/**
 * Regression: image generation speed-ups keep quality and only retry what can succeed.
 * Fully offline — OpenAI and /api/generate-image are mocked; no paid calls.
 */
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = "sk-test-offline-not-real";

import { logger } from "../src/lib/logger";
import { renderLookImage, isModerationBlocked } from "../src/lib/server-image-generation";
import { renderRetryDelayMs } from "../src/lib/generation-jobs";
import {
  generateLookImages,
  isTransientImageFailure,
  imageRetryDelayMs,
  ImageRequestError,
} from "../src/features/recommendations/services/image-generation";
import {
  summarizeGenerationProgress,
  normalizeStage,
} from "../src/features/recommendations/services/generation-progress";
import { watchGenerationJob } from "../src/features/recommendations/services/generation-job";

logger.level = "fatal";
const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("[Server render fallback]");

  const providerCalls = { responses: 0, edits: 0 };
  const editBodies: unknown[] = [];
  let responsesError: { status: number; body: unknown } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/responses")) {
      providerCalls.responses++;
      if (responsesError) return json(responsesError.body, responsesError.status);
      const body = JSON.parse(String(init?.body));
      // Quality settings must be untouched
      assert.equal(body.tools[0].quality, "high");
      assert.equal(body.tools[0].size, "1024x1536");
      assert.equal(body.input[0].content[1].detail, "original");
      return json({ id: "r", object: "response", created_at: 0, status: "completed", model: "m", output: [{ type: "image_generation_call", id: "ig", status: "completed", result: "aW1n" }] });
    }
    if (url.endsWith("/images/edits")) {
      providerCalls.edits++;
      editBodies.push(init?.body);
      return json({ created: 0, data: [{ b64_json: "ZmFsbGJhY2s=" }] });
    }
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;

  const photoUrl = "data:image/jpeg;base64," + Buffer.from("selfie").toString("base64");

  await test("primary render keeps high quality, full size and original-detail reference", async () => {
    responsesError = null;
    const img = await renderLookImage({ lookId: "l1", prompt: "p", photoUrl });
    assert.equal(img, "data:image/jpeg;base64,aW1n");
    assert.equal(providerCalls.edits, 0);
  });

  await test("moderation_blocked does NOT trigger the slow images.edit fallback", async () => {
    providerCalls.responses = 0;
    providerCalls.edits = 0;
    responsesError = { status: 400, body: { error: { message: "Request blocked by moderation.", type: "image_generation_user_error", code: "moderation_blocked" } } };
    await assert.rejects(renderLookImage({ lookId: "l1", prompt: "p", photoUrl }), (err) => isModerationBlocked(err));
    assert.equal(providerCalls.responses, 1);
    assert.equal(providerCalls.edits, 0, "no wasted fallback call");
  });

  await test("other primary failures (e.g. org verification 403) still fall back to images.edit", async () => {
    providerCalls.responses = 0;
    providerCalls.edits = 0;
    responsesError = { status: 403, body: { error: { message: "Organization must be verified", type: "invalid_request_error", code: null } } };
    const img = await renderLookImage({ lookId: "l1", prompt: "p", photoUrl });
    assert.equal(img, "data:image/jpeg;base64,ZmFsbGJhY2s=");
    assert.equal(providerCalls.edits, 1);
  });

  console.log("\n[Retry backoff]");

  await test("runner backs off exponentially for transient errors and re-renders a moderation block at once", () => {
    const mid = () => 0.5; // no jitter
    const transient = new Error("server error");
    assert.equal(renderRetryDelayMs(0, transient, mid), 0);
    assert.equal(renderRetryDelayMs(1, transient, mid), 1000);
    assert.equal(renderRetryDelayMs(2, transient, mid), 2000);
    assert.equal(renderRetryDelayMs(3, transient, mid), 4000);
    assert.equal(renderRetryDelayMs(10, transient, mid), 8000, "capped");
    assert.equal(renderRetryDelayMs(1, { code: "moderation_blocked" }, mid), 0);
    for (let i = 0; i < 50; i++) {
      const d = renderRetryDelayMs(2, transient);
      assert.ok(d >= 1600 && d <= 2400, `jitter within ±20%: ${d}`);
    }
  });

  await test("in-page retries only transient failures", () => {
    assert.equal(isTransientImageFailure(new TypeError("Failed to fetch")), true, "network");
    for (const s of [408, 409, 429, 500, 502, 503]) assert.equal(isTransientImageFailure(new ImageRequestError("x", s)), true, `${s}`);
    assert.equal(isTransientImageFailure(new ImageRequestError("Request blocked by moderation.", 400)), true);
    for (const s of [400, 401, 403, 422]) assert.equal(isTransientImageFailure(new ImageRequestError("rejected by the safety system", s)), false, `${s}`);
    assert.equal(imageRetryDelayMs(1, () => 0.5), 1000);
    assert.equal(imageRetryDelayMs(3, () => 0.5), 4000);
  });

  console.log("\n[In-page pipeline]");

  const looks = [1, 2, 3, 4, 5].map((i) => ({ id: `look-0${i}`, title: `Look ${i}`, vibe: `v${i}`, imageUrl: "/replace-with-generated/pending.webp" }));
  const runInPage = async (plan: Record<string, Array<"ok" | number>>) => {
    const attempts = new Map<string, number>();
    let inFlight = 0;
    let maxInFlight = 0;
    const sleeps: number[] = [];
    globalThis.fetch = (async (_i: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const id: string = body.look.id;
      const n = attempts.get(id) ?? 0;
      attempts.set(id, n + 1);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      const steps = plan[id];
      const b = steps ? steps[Math.min(n, steps.length - 1)] : "ok";
      if (b !== "ok") return json({ error: b === 400 ? "rejected by the safety system" : "server error" }, b);
      return json({ look: { ...body.look, imageUrl: `data:image/jpeg;base64,${id}` } });
    }) as typeof fetch;
    const progress: number[] = [];
    const origWarn = console.warn;
    console.warn = () => {};
    try {
      const result = await generateLookImages(looks as any, { photoUrl: "data:x" } as any, { occasion: "o", details: "" }, {
        onProgress: (ls) => progress.push(ls.filter((l) => !l.imageUrl.startsWith("/replace")).length),
        sleep: async (ms) => { sleeps.push(ms); },
      }).then((r) => ({ ok: true as const, r }), (e) => ({ ok: false as const, e }));
      return { result, attempts, maxInFlight, progress, sleeps };
    } finally {
      console.warn = origWarn;
    }
  };

  await test("all five looks render at once (not in waves of two)", async () => {
    const { result, maxInFlight, progress } = await runInPage({});
    assert.ok(result.ok);
    assert.equal(maxInFlight, 5);
    assert.deepEqual(progress, [1, 2, 3, 4, 5], "each image reported as soon as it is ready");
  });

  await test("a transient failure is retried for that look only, with backoff", async () => {
    const { result, attempts, sleeps } = await runInPage({ "look-03": [502, "ok"] });
    assert.ok(result.ok);
    assert.equal(attempts.get("look-03"), 2);
    assert.equal(attempts.get("look-01"), 1, "successful looks are never regenerated");
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0] >= 800 && sleeps[0] <= 1200);
  });

  await test("a permanent rejection is not retried and fails fast", async () => {
    const { result, attempts } = await runInPage({ "look-02": [400] });
    assert.equal(result.ok, false);
    assert.equal(attempts.get("look-02"), 1, "no repeated paid call");
    assert.match(String((result as { e: Error }).e.message), /1 look/);
  });

  console.log("\n[Real progress]");

  await test("progress summary reflects the real stage and ready looks", () => {
    assert.equal(normalizeStage("weird"), "queued");
    assert.equal(summarizeGenerationProgress({ stage: "queued", looks: [] }).fraction, null);
    const styling = summarizeGenerationProgress({ stage: "styling", looks: [] });
    assert.match(styling.label, /Designing your 5 looks/);
    assert.equal(styling.fraction, null, "no fake percentage before any image can exist");
    const lk = (i: number, ready: boolean) => ({ id: `l${i}`, title: `Look ${i}`, ready });
    const rendering = summarizeGenerationProgress({ stage: "rendering", looks: [lk(1, true), lk(2, true), lk(3, false), lk(4, false), lk(5, false)] });
    assert.equal(rendering.label, "2 of 5 looks ready");
    assert.equal(rendering.fraction, 0.4);
    assert.match(rendering.detail, /Rendering 3 looks/);
    // Looks present while the status poll still says "styling": rendering has begun
    assert.match(summarizeGenerationProgress({ stage: "styling", looks: [lk(1, false)] }).label, /0 of 1 look ready/);
    assert.equal(summarizeGenerationProgress({ stage: "rendering", looks: [1, 2, 3, 4, 5].map((i) => lk(i, true)) }).fraction, 1);
  });

  await test("job watcher reports server stage and per-look readiness", async () => {
    const jobLooks = [1, 2, 3, 4, 5].map((i) => ({ id: `look-0${i}`, title: `Look ${i}`, imageUrl: "/replace-with-generated/pending.webp" }));
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/images/")) return json({ imageUrl: `data:image/jpeg;base64,${url.split("/").pop()}` });
      return json({ job: { id: "j", status: "completed", stage: "done", error: null, looks: jobLooks, readyLookIds: jobLooks.map((l) => l.id) } });
    }) as typeof fetch;
    const statuses: Array<{ stage: string; ready: number }> = [];
    const watched = await watchGenerationJob("j", {
      onStatus: (p) => statuses.push({ stage: p.stage, ready: p.looks.filter((l) => l.ready).length }),
    });
    assert.ok(watched);
    assert.deepEqual(statuses.at(-1), { stage: "done", ready: 5 });
  });

  globalThis.fetch = realFetch;
  console.log(`\nAll ${passed} generation performance checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
