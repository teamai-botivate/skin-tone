/**
 * Offline benchmark of the background generation pipeline.
 *
 * Runs the REAL job runner (DB, leases, retries, prompt agent, provider
 * calls) against a mock OpenAI whose latencies follow a configurable
 * profile, so it measures how the pipeline orchestrates work — where it
 * waits, what runs in parallel, what gets retried — without any paid call.
 * Provider latencies themselves are the assumed profile below, scaled by
 * SCALE so a run takes seconds; reported "projected" numbers undo the scale.
 *
 * Every image request's model/quality settings and a hash of every image
 * prompt are recorded, so two runs can prove those are identical.
 *
 * Usage: npx tsx scripts/benchmark-generation-pipeline.ts [out.json]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const SCALE = 0.1; // 1 real second = 100ms here
const dbFile = path.join(os.tmpdir(), `letstyle-bench-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.VERCEL;
process.env.OPENAI_API_KEY = "sk-bench-stub-not-real";

import { logger } from "../src/lib/logger";
import { getDb } from "../src/lib/db";
import { createGenerationJob, runGenerationJob } from "../src/lib/generation-jobs";
import type { SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

// ---- Assumed real-world provider latency profile (seconds) ----
// gpt-image renders at quality "high", 1024x1536, via the Responses API tool,
// typically take tens of seconds; one look is deliberately slower.
const PROFILE = {
  recommendationsGenerate: 25,
  recommendationsReview: 8,
  stylingAddendum: 6,
  render: { "look-01": 45, "look-02": 48, "look-03": 50, "look-04": 52, "look-05": 70 } as Record<string, number>,
  fallbackEdit: 45,
};
const ms = (seconds: number) => Math.round(seconds * 1000 * SCALE);
const projected = (measuredMs: number) => +(measuredMs / SCALE / 1000).toFixed(1);

const look = (i: number) => ({
  id: `look-0${i}`, title: `Bench look ${i}`, note: "n", category: "", vibe: `vibe${i}`, personaEnergy: "e",
  palette: ["#111111", "#222222", "#333333"],
  pieces: [{ category: "Outfit", name: `Bench garment ${i}`, detail: "" }],
  outfit: `Bench garment ${i}`, outfitColor: "c", jewellery: "None", hairstyle: "h", makeup: "None",
  accessories: "a", footwear: "f", reasoning: ["a", "b", "c"], confidence: 90, applicableCategories: ["outfit"],
});
const recs = {
  styleBrief: { effectiveOccasion: "o", occasionReasoning: "r", themeOrAesthetic: "t", styleDirection: "western", styleDirectionReasoning: "r", mustInclude: [], mustAvoid: [], resolvedConflicts: [] },
  recommendations: [1, 2, 3, 4, 5].map(look),
};
const review = { requirements: ["x"], reviews: [1, 2, 3, 4, 5].map((i) => ({ lookId: `look-0${i}`, requirementChecks: [{ requirement: "x", satisfied: true, evidence: "ok" }], audienceAppropriate: true, titleGarmentsInOutfit: true, outfitNamesAllClothingPieces: true })) };
// Deterministic per-look addendum so prompts are comparable across runs.
const addendumFor = (lookId: string) => ({
  expression: `expr-${lookId}`, headAndCameraAngle: "full length", bodyLanguage: "relaxed", hairstyleRendering: "soft waves",
  fitNotes: "tailored", environmentAndSetting: `setting-${lookId}`, flatteringDirection: "warm light",
});

interface Scenario {
  /** lookId -> sequence of per-attempt behaviours for the render call */
  renderPlan?: Record<string, Array<"ok" | 500 | 400 | "moderation">>;
  renderSeconds?: number;
  env?: Record<string, string>;
}

const state = {
  scenario: {} as Scenario,
  t0: 0,
  events: [] as Array<{ at: number; kind: string; lookId?: string }>,
  renderAttempts: new Map<string, number>(),
  lastBehaviour: new Map<string, unknown>(),
  imageRequests: [] as Array<{ lookId: string; settings: string; promptHash: string }>,
  providerCalls: { recommendations: 0, review: 0, addendum: 0, render: 0, fallback: 0 },
};
const now = () => Date.now() - state.t0;

function delay(msValue: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, msValue);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const chat = (payload: unknown) =>
  json({ id: "c", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }] });
const lookIdIn = (text: string) => `look-0${/Bench garment (\d)/.exec(text)![1]}`;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  const signal = init?.signal;

  if (url.endsWith("/chat/completions")) {
    const name = body.response_format?.json_schema?.name;
    if (name === "skintune_recommendations") {
      state.providerCalls.recommendations++;
      await delay(ms(PROFILE.recommendationsGenerate), signal);
      return chat(recs);
    }
    if (name === "skintune_look_review") {
      state.providerCalls.review++;
      await delay(ms(PROFILE.recommendationsReview), signal);
      return chat(review);
    }
    if (name === "styling_addendum") {
      state.providerCalls.addendum++;
      const lookId = lookIdIn(JSON.stringify(body.messages));
      state.events.push({ at: now(), kind: "addendum-start", lookId });
      await delay(ms(PROFILE.stylingAddendum), signal);
      return chat(addendumFor(lookId));
    }
  }

  if (url.endsWith("/responses")) {
    state.providerCalls.render++;
    const prompt: string = body.input[0].content[0].text;
    const lookId = lookIdIn(prompt);
    const tool = body.tools[0];
    state.imageRequests.push({
      lookId,
      settings: JSON.stringify({ orchestrator: body.model, tool, detail: body.input[0].content[1].detail, hasReference: Boolean(body.input[0].content[1].image_url) }),
      promptHash: createHash("sha256").update(prompt).digest("hex").slice(0, 16),
    });
    const attempt = state.renderAttempts.get(lookId) ?? 0;
    state.renderAttempts.set(lookId, attempt + 1);
    state.events.push({ at: now(), kind: "render-start", lookId });
    const plan = state.scenario.renderPlan?.[lookId];
    const behaviour = plan ? plan[Math.min(attempt, plan.length - 1)] : "ok";
    state.lastBehaviour.set(lookId, behaviour);
    await delay(ms(state.scenario.renderSeconds ?? PROFILE.render[lookId]), signal);
    if (behaviour === 500) return json({ error: { message: "server error" } }, 500);
    if (behaviour === 400) return json({ error: { message: "Your request was rejected by the safety system.", type: "invalid_request_error", code: "content_policy_violation" } }, 400);
    if (behaviour === "moderation") return json({ error: { message: "Request blocked by moderation.", type: "image_generation_user_error", code: "moderation_blocked" } }, 400);
    state.events.push({ at: now(), kind: "render-done", lookId });
    return json({ id: "r", object: "response", created_at: 0, status: "completed", model: "m", output: [{ type: "image_generation_call", id: "ig", status: "completed", result: Buffer.from(`img:${lookId}`).toString("base64") }] });
  }

  if (url.endsWith("/images/edits")) {
    state.providerCalls.fallback++;
    await delay(ms(PROFILE.fallbackEdit), signal);
    // The fallback is only reached after a primary failure; it fails the same way.
    const failedLook = [...state.lastBehaviour.entries()].find(([, b]) => b !== "ok");
    if (failedLook?.[1] === "moderation") return json({ error: { message: "Request blocked by moderation.", type: "image_generation_user_error", code: "moderation_blocked" } }, 400);
    return json({ error: { message: "Your request was rejected by the safety system.", type: "invalid_request_error", code: "content_policy_violation" } }, 400);
  }

  throw new Error(`Unexpected request: ${url}`);
}) as typeof fetch;

const profile = {
  name: "Bench", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "", photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" }, bodyBuild: "", fit: "",
  style: ["Casual"], colorsLove: [], colorsAvoid: [], restrictions: [], occasion: "Everyday", impression: [], budget: "", customStyleNotes: "",
} as SkinTuneProfile;
const input = { profile, context: { occasion: "Everyday", details: "" }, photoUrl: "data:image/jpeg;base64," + Buffer.from("selfie").toString("base64") };

async function runScenario(name: string, scenario: Scenario) {
  state.scenario = scenario;
  state.events = [];
  state.renderAttempts = new Map();
  state.lastBehaviour = new Map();
  state.imageRequests = [];
  state.providerCalls = { recommendations: 0, review: 0, addendum: 0, render: 0, fallback: 0 };
  const savedEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(scenario.env ?? {})) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }

  const job = await createGenerationJob(`bench-${name}`, input);
  state.t0 = Date.now();
  const outcomes: string[] = [];
  let invocations = 0;
  // Act like the hand-off: keep starting fresh runners until the job is final.
  while (true) {
    invocations++;
    const result = await runGenerationJob(job.id, { onContinue: () => {} });
    outcomes.push(result.outcome);
    if (result.outcome !== "continued" || invocations > 10) break;
  }
  const totalMs = now();
  const db = await getDb();
  const row = await db.get<{ status: string }>("SELECT status FROM generation_jobs WHERE id = $1", [job.id]);
  const images = await db.query<{ look_id: string }>("SELECT look_id FROM generation_job_images WHERE job_id = $1", [job.id]);
  const firstImage = state.events.find((e) => e.kind === "render-done")?.at ?? null;
  const firstRenderStart = state.events.find((e) => e.kind === "render-start")?.at ?? null;

  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  return {
    name,
    status: row?.status,
    imagesStored: images.length,
    invocations,
    outcomes,
    totalMs,
    projectedSeconds: projected(totalMs),
    projectedFirstRenderStartSeconds: firstRenderStart === null ? null : projected(firstRenderStart),
    projectedFirstImageSeconds: firstImage === null ? null : projected(firstImage),
    providerCalls: { ...state.providerCalls },
    renderAttempts: Object.fromEntries(state.renderAttempts),
    imageRequests: [...state.imageRequests].sort((a, b) => a.lookId.localeCompare(b.lookId)),
  };
}

async function main() {
  const out = process.argv[2];
  const results = [];
  results.push(await runScenario("happy-path", {}));
  results.push(await runScenario("transient-500-once", { renderPlan: { "look-03": [500, "ok"] } }));
  results.push(await runScenario("non-retryable-400", { renderPlan: { "look-02": [400] } }));
  results.push(await runScenario("moderation-once", { renderPlan: { "look-04": ["moderation", "ok"] } }));
  // Vercel-shaped run: 270s budget, 120s per image attempt, slow 90s renders.
  results.push(
    await runScenario("vercel-budget-slow-renders", {
      renderSeconds: 90,
      env: {
        GENERATION_JOB_TIME_BUDGET_MS: String(ms(270)),
        GENERATION_IMAGE_TIMEOUT_MS: String(ms(120)),
        GENERATION_RECOMMENDATIONS_TIMEOUT_MS: String(ms(120)),
      },
    }),
  );

  for (const r of results) {
    console.log(
      `${r.name.padEnd(28)} status=${r.status} images=${r.imagesStored} invocations=${r.invocations} ` +
        `total≈${r.projectedSeconds}s firstRenderStart≈${r.projectedFirstRenderStartSeconds}s firstImage≈${r.projectedFirstImageSeconds}s ` +
        `calls=${JSON.stringify(r.providerCalls)}`,
    );
  }
  if (out) fs.writeFileSync(out, JSON.stringify({ scale: SCALE, profile: PROFILE, results }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const s of ["", "-wal", "-shm"]) {
      try {
        fs.rmSync(dbFile + s, { force: true });
      } catch {
        // Windows may still hold the file; it's in the OS temp dir.
      }
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 100);
  });
