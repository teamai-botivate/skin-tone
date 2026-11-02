import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import webpush, { WebPushError } from "web-push";

// Fully offline: a throwaway SQLite file, a fetch dispatcher standing in for
// OpenAI (installed before the lazily created OpenAI client exists, since the
// SDK captures the global fetch at construction), and a stubbed web-push
// sender. Any request no test expects fails loudly, so no paid call can happen.
const dbFile = path.join(os.tmpdir(), `letstyle-jobs-test-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.OPENAI_API_KEY = "sk-test-stub-key-not-real";
process.env.GENERATION_JOB_TIME_BUDGET_MS = "0";
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;

import { logger } from "../src/lib/logger";
import { getDb } from "../src/lib/db";
import {
  createGenerationJob,
  findStalledJobIds,
  sweepStalledJobs,
  getGenerationJobForUser,
  getGenerationJobImageForUser,
  notifyJobOutcome,
  runGenerationJob,
} from "../src/lib/generation-jobs";
import { savePushSubscription, sendPushToUser } from "../src/lib/push-notifications";
import { generateLookImage } from "../src/lib/server-image-generation";
import { IMAGE_MODEL, RECOMMENDATION_MODEL } from "../src/lib/openai-client";
import type { SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("REGRESSION TEST SUITE: BACKGROUND GENERATION JOBS + WEB PUSH");
console.log("======================================================================");

// ---------------------------------------------------------------------------
// Mock OpenAI
// ---------------------------------------------------------------------------

const look = (i: number) => ({
  id: `look-0${i}`,
  title: `Fixture look ${i}`,
  note: "Fixture note",
  category: "",
  vibe: `vibe${i}`,
  personaEnergy: "Fixture energy.",
  palette: ["#111111", "#222222", "#333333"],
  pieces: [
    { category: "Outfit", name: `Fixture garment ${i}`, detail: "" },
    { category: "Footwear", name: "Fixture shoes", detail: "" },
  ],
  outfit: `Fixture garment ${i}`,
  outfitColor: "Fixture colour",
  jewellery: "None",
  hairstyle: "Fixture hair",
  makeup: "None",
  accessories: "Fixture accessory",
  footwear: "Fixture footwear",
  reasoning: ["a", "b", "c"],
  confidence: 90,
  applicableCategories: ["outfit"],
});

const recommendationsPayload = {
  styleBrief: {
    effectiveOccasion: "fixture occasion",
    occasionReasoning: "fixture",
    themeOrAesthetic: "fixture theme",
    styleDirection: "western",
    styleDirectionReasoning: "fixture",
    mustInclude: [],
    mustAvoid: [],
    resolvedConflicts: [],
  },
  recommendations: [1, 2, 3, 4, 5].map(look),
};
const passingReview = {
  requirements: ["fixture requirement"],
  reviews: [1, 2, 3, 4, 5].map((i) => ({
    lookId: `look-0${i}`,
    requirementChecks: [{ requirement: "fixture requirement", satisfied: true, evidence: "ok" }],
    audienceAppropriate: true,
    titleGarmentsInOutfit: true,
    outfitNamesAllClothingPieces: true,
  })),
};
const addendum = {
  expression: "x", headAndCameraAngle: "x", bodyLanguage: "x", hairstyleRendering: "x",
  fitNotes: "x", environmentAndSetting: "x", flatteringDirection: "x",
};

interface MockState {
  recommendationsFail: boolean;
  /** Delay before the recommendations response; Infinity = hang until aborted. */
  recommendationsDelayMs: number;
  /** Number of recommendation calls that hang (until aborted) before responding normally. */
  recommendationHangs: number;
  /** lookId -> number of image calls that come back without an image (retryable) before succeeding (Infinity = always) */
  imageFailures: Map<string, number>;
  /** lookId -> provider rejections to return, in order (e.g. content policy, moderation) */
  imageRejections: Map<string, Array<"content_policy" | "moderation">>;
  /** Per-look render delay override (ms). */
  imageDelayByLook: Map<string, number>;
  /** Every styling-agent call, with the ms offset it started at. */
  addendumCalls: Array<{ lookId: string; at: number }>;
  /** Every render request: when it started and its exact body. */
  renderRequests: Array<{ lookId: string; at: number; body: any }>;
  inFlightRenders: number;
  maxInFlightRenders: number;
  t0: number;
  /** lookId -> number of image calls that hang until aborted (Infinity = always) */
  imageHangs: Map<string, number>;
  imageDelayMs: number;
  /** Appended to generated image bytes so tests can tell which runner produced them. */
  imageTag: string;
  imageCalls: string[];
  fallbackCalls: string[];
  recommendationCalls: number;
  /** Requests whose AbortSignal fired while the mock provider was still working. */
  aborted: string[];
}
const mock = {} as MockState;
function resetMock() {
  mock.recommendationsFail = false;
  mock.recommendationsDelayMs = 0;
  mock.recommendationHangs = 0;
  mock.imageFailures = new Map();
  mock.imageRejections = new Map();
  mock.imageDelayByLook = new Map();
  mock.addendumCalls = [];
  mock.renderRequests = [];
  mock.inFlightRenders = 0;
  mock.maxInFlightRenders = 0;
  mock.t0 = Date.now();
  mock.imageHangs = new Map();
  mock.imageDelayMs = 0;
  mock.imageTag = "";
  mock.imageCalls = [];
  mock.fallbackCalls = [];
  mock.recommendationCalls = 0;
  mock.aborted = [];
}
resetMock();

/** Simulated provider latency that, like a real HTTP request, stops when the caller aborts. */
function providerDelay(ms: number, signal: AbortSignal | null | undefined, label: string): Promise<void> {
  if (!ms) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = Number.isFinite(ms)
      ? setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms)
      : undefined;
    const onAbort = () => {
      clearTimeout(timer);
      mock.aborted.push(label);
      reject(Object.assign(new Error(`aborted: ${label}`), { name: "AbortError" }));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const chat = (payload: unknown) =>
  json({ id: "c", object: "chat.completion", created: 0, model: "m", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(payload) } }] });

function lookIdFromPrompt(text: string): string {
  const match = /Fixture garment (\d)/.exec(text);
  if (!match) throw new Error("Could not identify look in image prompt");
  return `look-0${match[1]}`;
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};

  if (url.endsWith("/chat/completions")) {
    const name = body.response_format?.json_schema?.name;
    if (name === "skintune_recommendations") {
      mock.recommendationCalls += 1;
      if (mock.recommendationHangs > 0) {
        mock.recommendationHangs -= 1;
        await providerDelay(Infinity, init?.signal, "recommendations");
      }
      await providerDelay(mock.recommendationsDelayMs, init?.signal, "recommendations");
      // 400, not 5xx: the SDK would transparently retry a 5xx itself.
      if (mock.recommendationsFail) return json({ error: { message: "Bad request" } }, 400);
      return chat(recommendationsPayload);
    }
    if (name === "skintune_look_review") return chat(passingReview);
    if (name === "styling_addendum") {
      mock.addendumCalls.push({ lookId: lookIdFromPrompt(JSON.stringify(body.messages)), at: Date.now() - mock.t0 });
      return chat(addendum);
    }
  }

  if (url.endsWith("/responses")) {
    const text: string = body.input[0].content[0].text;
    const lookId = lookIdFromPrompt(text);
    mock.imageCalls.push(lookId);
    mock.renderRequests.push({ lookId, at: Date.now() - mock.t0, body });
    mock.inFlightRenders += 1;
    mock.maxInFlightRenders = Math.max(mock.maxInFlightRenders, mock.inFlightRenders);
    try {
      const hangs = mock.imageHangs.get(lookId) ?? 0;
      if (hangs > 0) {
        mock.imageHangs.set(lookId, hangs - 1);
        await providerDelay(Infinity, init?.signal, lookId);
      }
      await providerDelay(mock.imageDelayByLook.get(lookId) ?? mock.imageDelayMs, init?.signal, lookId);
    } finally {
      mock.inFlightRenders -= 1;
    }
    const rejection = mock.imageRejections.get(lookId)?.shift();
    if (rejection === "content_policy") {
      return json({ error: { message: "Your request was rejected by the safety system.", type: "invalid_request_error", code: "content_policy_violation" } }, 400);
    }
    if (rejection === "moderation") {
      return json({ error: { message: "Request blocked by moderation.", type: "image_generation_user_error", code: "moderation_blocked" } }, 400);
    }
    const remaining = mock.imageFailures.get(lookId) ?? 0;
    if (remaining > 0) {
      mock.imageFailures.set(lookId, remaining - 1);
      // The provider answered but produced no image: worth another attempt.
      return json({ id: "r", object: "response", created_at: 0, status: "incomplete", model: "m", output: [] });
    }
    return json({
      id: "r", object: "response", created_at: 0, status: "completed", model: "m",
      output: [{ type: "image_generation_call", id: "ig", status: "completed", result: Buffer.from(`img:${lookId}${mock.imageTag ? `:${mock.imageTag}` : ""}`).toString("base64") }],
    });
  }

  if (url.endsWith("/images/edits")) {
    mock.fallbackCalls.push("edit");
    // Fallback path after a Responses API failure: fail too so failure counts stay deterministic.
    return json({ error: { message: "Image provider error" } }, 400);
  }

  throw new Error(`Unexpected network request: ${url}`);
}) as typeof fetch;

// ---------------------------------------------------------------------------
// Mock web-push
// ---------------------------------------------------------------------------

type Sent = { endpoint: string; payload: { title: string; body: string; url: string; tag: string }; topic?: string };
let sent: Sent[] = [];
const endpointBehaviour = new Map<string, number>(); // endpoint -> HTTP status to fail with
(webpush as unknown as { sendNotification: typeof webpush.sendNotification }).sendNotification = (async (
  subscription: webpush.PushSubscription,
  payload?: string | Buffer | null,
  options?: webpush.RequestOptions,
) => {
  const status = endpointBehaviour.get(subscription.endpoint);
  if (status) throw new WebPushError("Push failed", status, {}, "", subscription.endpoint);
  sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(String(payload)), topic: options?.topic });
  return { statusCode: 201, body: "", headers: {} };
}) as typeof webpush.sendNotification;

// ---------------------------------------------------------------------------

const profile = {
  name: "Test", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "",
  photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" },
  bodyBuild: "", fit: "", style: ["Casual"], colorsLove: [], colorsAvoid: [], restrictions: [],
  occasion: "Everyday", impression: [], budget: "", customStyleNotes: "",
} as SkinTuneProfile;
const input = {
  profile,
  context: { occasion: "Everyday", details: "" },
  photoUrl: "data:image/jpeg;base64," + Buffer.from("photo").toString("base64"),
};

let userCounter = 0;
async function newUserWithDevice() {
  const userId = `user-${++userCounter}`;
  await savePushSubscription(
    userId,
    { endpoint: `https://push.example.test/${userId}`, keys: { p256dh: "p", auth: "a" } },
    "test-agent",
  );
  return userId;
}

async function rawJob(jobId: string) {
  const db = await getDb();
  return db.get<Record<string, any>>("SELECT * FROM generation_jobs WHERE id = $1", [jobId]);
}

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n[Test 1] A job runs to completion server-side with no browser involved...");
  resetMock();
  sent = [];
  let user = await newUserWithDevice();
  let job = await createGenerationJob(user, input);
  assert.equal(job.status, "pending");
  let result = await runGenerationJob(job.id);
  assert.equal(result.outcome, "completed");
  let view = await getGenerationJobForUser(job.id, user);
  assert.equal(view?.status, "completed");
  assert.equal(view?.stage, "done");
  assert.equal(view?.looks?.length, 5);
  assert.deepEqual([...(view?.readyLookIds ?? [])].sort(), ["look-01", "look-02", "look-03", "look-04", "look-05"]);
  assert.ok(view?.looks?.every((l) => l.imageUrl.startsWith("/replace-with-generated/")), "Status payload carries no image data");
  const image = await getGenerationJobImageForUser(job.id, "look-03", user);
  assert.equal(image, `data:image/jpeg;base64,${Buffer.from("img:look-03").toString("base64")}`, "The real generated image is stored and served");
  assert.equal((await rawJob(job.id))?.input_json, null, "The user's photo is dropped once the job finishes");
  assert.equal(mock.recommendationCalls, 1);
  assert.equal(mock.imageCalls.length, 5);
  console.log("✓ Test 1 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 2] Completion sends exactly one push that deep-links to the result...");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, `https://push.example.test/${user}`);
  assert.equal(sent[0].payload.url, `/?job=${job.id}`);
  assert.equal(sent[0].payload.tag, `letstyle-job-${job.id}`);
  assert.match(sent[0].payload.title, /ready/i);
  assert.ok(sent[0].topic && sent[0].topic.length <= 32 && /^[A-Za-z0-9_-]+$/.test(sent[0].topic), "Valid push topic for collapsing");
  console.log("✓ Test 2 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 3] No duplicate notifications: re-runs and repeated notify calls are no-ops...");
  assert.equal((await runGenerationJob(job.id)).outcome, "not-claimed");
  assert.equal(await notifyJobOutcome(job.id), false);
  assert.equal(await notifyJobOutcome(job.id), false);
  assert.equal(sent.length, 1);
  console.log("✓ Test 3 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 4] Jobs are private to their owner...");
  assert.equal(await getGenerationJobForUser(job.id, "someone-else"), null);
  assert.equal(await getGenerationJobImageForUser(job.id, "look-01", "someone-else"), null);
  console.log("✓ Test 4 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 5] Two runners racing on one job: only one works, one notification...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  job = await createGenerationJob(user, input);
  const outcomes = (await Promise.all([runGenerationJob(job.id), runGenerationJob(job.id)])).map((r) => r.outcome).sort();
  assert.deepEqual(outcomes, ["completed", "not-claimed"]);
  assert.equal(mock.imageCalls.length, 5, "No image is generated twice");
  assert.equal(sent.length, 1);
  console.log("✓ Test 5 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 6] A failing image is retried and the job still completes...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  mock.imageFailures.set("look-02", 1);
  job = await createGenerationJob(user, input);
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(mock.imageCalls.filter((id) => id === "look-02").length, 2, "look-02 retried once");
  assert.equal(sent.length, 1);
  console.log("✓ Test 6 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 7] Failed generation: job fails with a clear message and one failure push...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  mock.imageFailures.set("look-04", Infinity);
  job = await createGenerationJob(user, input);
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  view = await getGenerationJobForUser(job.id, user);
  assert.equal(view?.status, "failed");
  assert.match(view?.error ?? "", /1 look/);
  assert.equal(mock.imageCalls.filter((id) => id === "look-04").length, 3, "Bounded retries (3 attempts)");
  assert.equal((await rawJob(job.id))?.input_json, null);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.title, /couldn't/i);
  assert.equal(sent[0].payload.url, `/?job=${job.id}`);

  resetMock();
  sent = [];
  mock.recommendationsFail = true;
  job = await createGenerationJob(user, input);
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  assert.equal(mock.recommendationCalls, 2, "Recommendations retried once");
  assert.equal(mock.imageCalls.length, 0);
  assert.match((await getGenerationJobForUser(job.id, user))?.error ?? "", /styling service/i);
  assert.equal(sent.length, 1);
  console.log("✓ Test 7 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 8] A crashed runner's job is resumed, regenerating only missing images...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  job = await createGenerationJob(user, input);
  const db = await getDb();
  const past = new Date(Date.now() - 60_000).toISOString();
  await db.query(
    "UPDATE generation_jobs SET status = 'processing', stage = 'rendering', looks_json = $1, lease_owner = 'dead-runner', lease_until = $2, attempts = 1 WHERE id = $3",
    [JSON.stringify(recommendationsPayload.recommendations.map((l) => ({ ...l, imageUrl: "/replace-with-generated/pending.webp" }))), past, job.id],
  );
  for (const id of ["look-01", "look-02"]) {
    await db.query("INSERT INTO generation_job_images (job_id, look_id, image_url, created_at) VALUES ($1, $2, $3, $4)", [job.id, id, "data:image/jpeg;base64,eA==", past]);
  }
  assert.ok((await findStalledJobIds()).includes(job.id), "Sweep finds the stalled job");
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(mock.recommendationCalls, 0, "Stored recommendations are reused");
  assert.deepEqual([...mock.imageCalls].sort(), ["look-03", "look-04", "look-05"]);
  assert.equal(sent.length, 1);
  console.log("✓ Test 8 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 9] Starting a new generation cancels the old one without notifying for it...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  // Slow renders + a fast heartbeat: cancellation must abort the in-flight
  // provider calls rather than wait for them.
  mock.imageDelayMs = 5000;
  process.env.GENERATION_JOB_HEARTBEAT_MS = "50";
  const oldJob = await createGenerationJob(user, input);
  const oldRun = runGenerationJob(oldJob.id);
  await new Promise((r) => setTimeout(r, 100));
  const cancelledAt = Date.now();
  const newJob = await createGenerationJob(user, input);
  assert.equal((await oldRun).outcome, "lease-lost");
  assert.ok(Date.now() - cancelledAt < 1000, "Old runner stopped promptly");
  assert.ok(mock.aborted.length > 0, "In-flight provider calls of the cancelled job were aborted");
  delete process.env.GENERATION_JOB_HEARTBEAT_MS;
  assert.equal((await getGenerationJobForUser(oldJob.id, user))?.status, "cancelled");
  mock.imageDelayMs = 0;
  assert.equal((await runGenerationJob(newJob.id)).outcome, "completed");
  assert.equal(sent.length, 1, "Only the new job notifies");
  assert.equal(sent[0].payload.url, `/?job=${newJob.id}`);
  console.log("✓ Test 9 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 10] Serverless time budget: runner hands off instead of being killed...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  job = await createGenerationJob(user, input);
  // 900ms budget, 400ms per image attempt, 300ms renders, 2 at a time:
  // rounds finish at ~300 and ~600ms; a third round would need 400ms but only
  // ~300ms remain, so the runner must stop and hand off with 4 of 5 images.
  process.env.GENERATION_JOB_TIME_BUDGET_MS = "900";
  process.env.GENERATION_IMAGE_TIMEOUT_MS = "400";
  process.env.GENERATION_IMAGE_CONCURRENCY = "2";
  const continued: string[] = [];
  mock.imageDelayMs = 300;
  let runStart = Date.now();
  const budgeted = await runGenerationJob(job.id, { onContinue: (id) => { continued.push(id); } });
  const firstRunMs = Date.now() - runStart;
  assert.equal(budgeted.outcome, "continued");
  assert.ok(firstRunMs < 900, `Runner finished inside its budget (${firstRunMs}ms < 900ms)`);
  assert.deepEqual(continued, [job.id], "Hand-off requested exactly once");
  const mid = await rawJob(job.id);
  assert.equal(mid?.status, "processing");
  assert.equal(mid?.lease_until, null, "Lease released for the next runner");
  assert.equal((await getGenerationJobForUser(job.id, user))?.readyLookIds.length, 4, "Partial images kept");
  assert.equal(mock.aborted.length, 0, `No call was cut off by the budget (aborted: ${mock.aborted.join(",")}, calls: ${mock.imageCalls.join(",")}, ${firstRunMs}ms)`);
  assert.equal(sent.length, 0, "No notification before completion");
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(mock.imageCalls.length, 5, "The next runner renders only the missing image");
  assert.equal(mock.recommendationCalls, 1, "Recommendations are not regenerated");
  assert.equal(sent.length, 1);
  delete process.env.GENERATION_JOB_TIME_BUDGET_MS;
  delete process.env.GENERATION_IMAGE_TIMEOUT_MS;
  delete process.env.GENERATION_IMAGE_CONCURRENCY;
  process.env.GENERATION_JOB_TIME_BUDGET_MS = "0";
  console.log("✓ Test 10 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 11] A job whose runner keeps dying is eventually failed (and notified once)...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  job = await createGenerationJob(user, input);
  await db.query("UPDATE generation_jobs SET attempts = 8 WHERE id = $1", [job.id]);
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  assert.equal((await getGenerationJobForUser(job.id, user))?.status, "failed");
  assert.equal(sent.length, 1);
  console.log("✓ Test 11 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 12] Expired subscriptions are removed; transient failures are kept...");
  sent = [];
  user = `user-${++userCounter}`;
  const ok = `https://push.example.test/${user}/ok`;
  const gone = `https://push.example.test/${user}/gone`;
  const missing = `https://push.example.test/${user}/missing`;
  const flaky = `https://push.example.test/${user}/flaky`;
  for (const endpoint of [ok, gone, missing, flaky]) {
    await savePushSubscription(user, { endpoint, keys: { p256dh: "p", auth: "a" } }, null);
  }
  endpointBehaviour.set(gone, 410);
  endpointBehaviour.set(missing, 404);
  endpointBehaviour.set(flaky, 500);
  const outcome = await sendPushToUser(user, { title: "t", body: "b", url: "/", tag: "x" });
  assert.deepEqual(outcome, { sent: 1, removed: 2, failed: 1 });
  const remaining = (await db.query<{ endpoint: string }>("SELECT endpoint FROM push_subscriptions WHERE user_id = $1", [user])).map((r) => r.endpoint).sort();
  assert.deepEqual(remaining, [flaky, ok].sort());
  console.log("✓ Test 12 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 13] Re-subscribing a shared device moves it to the new account...");
  const shared = "https://push.example.test/shared-device";
  await savePushSubscription("account-a", { endpoint: shared, keys: { p256dh: "p1", auth: "a1" } }, null);
  await savePushSubscription("account-b", { endpoint: shared, keys: { p256dh: "p2", auth: "a2" } }, null);
  const owner = await db.get<{ user_id: string; p256dh: string }>("SELECT user_id, p256dh FROM push_subscriptions WHERE endpoint = $1", [shared]);
  assert.deepEqual({ ...owner }, { user_id: "account-b", p256dh: "p2" });
  console.log("✓ Test 13 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 14] A hanging image call is aborted at its deadline and retried...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  process.env.GENERATION_IMAGE_TIMEOUT_MS = "300";
  mock.imageHangs.set("look-03", 1);
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.ok(Date.now() - runStart < 3000, "Did not wait on the hung request");
  assert.deepEqual(mock.aborted, ["look-03"], "The hung request was aborted");
  assert.equal(mock.imageCalls.filter((id) => id === "look-03").length, 2, "Then retried once and succeeded");
  assert.equal(mock.fallbackCalls.length, 0, "No pointless images.edit fallback after a timeout");
  assert.equal(sent.length, 1);

  resetMock();
  sent = [];
  mock.imageHangs.set("look-02", Infinity);
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  const hungMs = Date.now() - runStart;
  assert.ok(hungMs < 6000, `A permanently hung look fails in bounded time (${hungMs}ms)`);
  assert.equal(mock.aborted.filter((l) => l === "look-02").length, 3, "3 attempts, each aborted");
  assert.equal((await getGenerationJobForUser(job.id, user))?.readyLookIds.length, 4, "Other looks' images kept");
  assert.equal(sent.length, 1);
  delete process.env.GENERATION_IMAGE_TIMEOUT_MS;
  console.log("✓ Test 14 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 15] A hanging recommendations call is aborted and retried...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  process.env.GENERATION_RECOMMENDATIONS_TIMEOUT_MS = "300";
  mock.recommendationHangs = 1;
  job = await createGenerationJob(user, input);
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.deepEqual(mock.aborted, ["recommendations"]);
  assert.equal(mock.recommendationCalls, 2);

  resetMock();
  sent = [];
  mock.recommendationHangs = Infinity;
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  assert.ok(Date.now() - runStart < 3000, "Fails in bounded time");
  assert.equal(mock.recommendationCalls, 2, "Retried once, then failed");
  assert.equal(mock.imageCalls.length, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0].payload.title, /couldn't/i);
  delete process.env.GENERATION_RECOMMENDATIONS_TIMEOUT_MS;
  console.log("✓ Test 15 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 16] Hung calls can't push a runner past its budget; it hands off instead...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  process.env.GENERATION_JOB_TIME_BUDGET_MS = "1000";
  process.env.GENERATION_IMAGE_TIMEOUT_MS = "400";
  for (const id of ["look-01", "look-02", "look-03", "look-04", "look-05"]) mock.imageHangs.set(id, 1);
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  const hungRun = await runGenerationJob(job.id, { onContinue: () => {} });
  const hungRunMs = Date.now() - runStart;
  assert.equal(hungRun.outcome, "continued");
  // Worst case: budget + one retry backoff (800ms) before the budget check.
  assert.ok(hungRunMs < 1000 + 900, `Runner stopped near its budget (${hungRunMs}ms)`);
  assert.equal((await rawJob(job.id))?.status, "processing", "Not failed: work remains for the next runner");
  process.env.GENERATION_JOB_TIME_BUDGET_MS = "0";
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(sent.length, 1);
  delete process.env.GENERATION_IMAGE_TIMEOUT_MS;
  console.log("✓ Test 16 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 17] The scheduled sweep resumes interrupted jobs, never live ones...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  const interrupted = await createGenerationJob(user, input);
  const longAgo = new Date(Date.now() - 5_000).toISOString();
  await db.query(
    "UPDATE generation_jobs SET status = 'processing', stage = 'rendering', looks_json = $1, lease_owner = 'crashed-runner', lease_until = $2, attempts = 1 WHERE id = $3",
    [JSON.stringify(recommendationsPayload.recommendations.map((l) => ({ ...l, imageUrl: "/replace-with-generated/pending.webp" }))), longAgo, interrupted.id],
  );
  await db.query("INSERT INTO generation_job_images (job_id, look_id, image_url, created_at) VALUES ($1, $2, $3, $4)", [interrupted.id, "look-01", "data:image/jpeg;base64,eA==", longAgo]);
  const otherUser = await newUserWithDevice();
  const live = await createGenerationJob(otherUser, input);
  await db.query(
    "UPDATE generation_jobs SET status = 'processing', lease_owner = 'live-runner', lease_until = $1 WHERE id = $2",
    [new Date(Date.now() + 60_000).toISOString(), live.id],
  );
  let sweep = await sweepStalledJobs(50);
  assert.ok(sweep.resume.includes(interrupted.id), "Interrupted job is picked up");
  assert.ok(!sweep.resume.includes(live.id), "A job with a live lease is left alone");
  assert.deepEqual(sweep.abandoned, []);
  // What the run endpoint does for each resumed id:
  const results = await Promise.all(sweep.resume.map((id) => runGenerationJob(id)));
  assert.ok(results.every((r) => r.outcome === "completed"));
  assert.deepEqual([...mock.imageCalls].sort(), ["look-02", "look-03", "look-04", "look-05"]);
  assert.equal(sent.length, 1, "Owner notified without reopening the site");
  sweep = await sweepStalledJobs(50);
  assert.ok(!sweep.resume.includes(interrupted.id), "Finished job is not picked up again");
  assert.equal((await runGenerationJob(live.id)).outcome, "not-claimed", "Live lease still blocks other runners");
  await db.query("UPDATE generation_jobs SET status = 'cancelled' WHERE id = $1", [live.id]);
  console.log("✓ Test 17 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 18] The sweep fails jobs too old to be useful, notifying exactly once...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  const stale = await createGenerationJob(user, input);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await db.query("UPDATE generation_jobs SET created_at = $1, status = 'processing', lease_until = $2 WHERE id = $3", [twoHoursAgo, twoHoursAgo, stale.id]);
  sweep = await sweepStalledJobs(50);
  assert.ok(sweep.abandoned.includes(stale.id) && !sweep.resume.includes(stale.id));
  assert.equal((await getGenerationJobForUser(stale.id, user))?.status, "failed");
  assert.equal((await rawJob(stale.id))?.input_json, null, "Photo dropped");
  assert.equal(sent.length, 1);
  sweep = await sweepStalledJobs(50);
  assert.ok(!sweep.abandoned.includes(stale.id));
  assert.equal(sent.length, 1, "No second notification");
  assert.equal(mock.recommendationCalls + mock.imageCalls.length, 0, "No provider calls for a stale job");
  console.log("✓ Test 18 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 19] A stalled runner that gets taken over can't write results or notify...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  process.env.GENERATION_IMAGE_CONCURRENCY = "5";
  mock.imageDelayMs = 1000;
  mock.imageTag = "A";
  job = await createGenerationJob(user, input);
  const runA = runGenerationJob(job.id);
  await new Promise((r) => setTimeout(r, 300));
  // Runner A looks dead (lease expired), so a sweep-started runner B takes over.
  await db.query("UPDATE generation_jobs SET lease_until = $1 WHERE id = $2", [new Date(Date.now() - 1000).toISOString(), job.id]);
  const runB = runGenerationJob(job.id);
  // A's renders respond at ~1000ms, B's at ~1300ms: tag responses so we can tell who stored what.
  setTimeout(() => { mock.imageTag = "B"; }, 850);
  const [outA, outB] = await Promise.all([runA, runB]);
  assert.equal(outA.outcome, "lease-lost", "Runner A stops once it notices it lost the job");
  assert.equal(outB.outcome, "completed");
  const stored = await db.query<{ image_url: string }>("SELECT image_url FROM generation_job_images WHERE job_id = $1", [job.id]);
  assert.equal(stored.length, 5);
  assert.ok(
    stored.every((r) => Buffer.from(r.image_url.split(",")[1], "base64").toString().endsWith(":B")),
    "Only the current owner's images were stored",
  );
  assert.equal(sent.length, 1, "Exactly one notification");
  delete process.env.GENERATION_IMAGE_CONCURRENCY;
  mock.imageTag = "";
  console.log("✓ Test 19 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 20] A non-retryable rejection fails fast and stops the other renders...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  mock.imageDelayMs = 2000;
  mock.imageDelayByLook.set("look-02", 50);
  mock.imageRejections.set("look-02", ["content_policy", "content_policy", "content_policy"]);
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "failed");
  const failFastMs = Date.now() - runStart;
  assert.ok(failFastMs < 1500, `Failed without waiting for the other 2s renders (${failFastMs}ms)`);
  assert.equal(mock.imageCalls.filter((id) => id === "look-02").length, 1, "Content-policy rejection is not retried");
  assert.equal(mock.fallbackCalls.length, 1, "Existing images.edit fallback still tried once");
  assert.ok(mock.aborted.length >= 4, `Other in-flight renders were stopped (${mock.aborted.length})`);
  view = await getGenerationJobForUser(job.id, user);
  assert.equal(view?.status, "failed");
  assert.match(view?.error ?? "", /1 look/);
  assert.equal(sent.length, 1, "One failure notification, sent only once the job is final");
  console.log("✓ Test 20 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 21] A moderation block is retried (moderation is per render) and reuses the prompt...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  mock.imageRejections.set("look-03", ["moderation"]);
  job = await createGenerationJob(user, input);
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(mock.imageCalls.filter((id) => id === "look-03").length, 2);
  assert.equal(mock.addendumCalls.length, 5, "The retry reused look-03's styling decisions instead of re-running the agent");
  const look3Prompts = new Set(mock.renderRequests.filter((r) => r.lookId === "look-03").map((r) => r.body.input[0].content[0].text));
  assert.equal(look3Prompts.size, 1, "Retry rendered the identical prompt");
  assert.equal(sent.length, 1);
  console.log("✓ Test 21 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 22] Every look's prompt is prepared up front, not behind earlier renders...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  process.env.GENERATION_IMAGE_CONCURRENCY = "2";
  mock.imageDelayMs = 200;
  job = await createGenerationJob(user, input);
  mock.t0 = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  assert.equal(mock.addendumCalls.length, 5, "One styling-agent call per look");
  const firstRenderAt = Math.min(...mock.renderRequests.map((r) => r.at));
  const lastAddendumAt = Math.max(...mock.addendumCalls.map((c) => c.at));
  assert.ok(lastAddendumAt <= firstRenderAt + 50, `All 5 prompts prepared before the first render finished (last agent call at ${lastAddendumAt}ms, first render at ${firstRenderAt}ms)`);
  assert.equal(mock.maxInFlightRenders, 2, "Configured concurrency respected");
  delete process.env.GENERATION_IMAGE_CONCURRENCY;
  console.log("✓ Test 22 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 23] By default all 5 looks render in one parallel wave...");
  resetMock();
  sent = [];
  user = await newUserWithDevice();
  mock.imageDelayMs = 300;
  job = await createGenerationJob(user, input);
  runStart = Date.now();
  assert.equal((await runGenerationJob(job.id)).outcome, "completed");
  const waveMs = Date.now() - runStart;
  assert.equal(mock.maxInFlightRenders, 5);
  assert.ok(waveMs < 600, `5 × 300ms renders finished in one wave (${waveMs}ms)`);
  assert.equal(mock.imageCalls.length, 5, "No duplicate render requests");
  console.log("✓ Test 23 Passed");

  // -------------------------------------------------------------------------
  console.log("\n[Test 24] Image model, quality, size, reference image and prompt are unchanged...");
  // The background job's render request must be byte-identical to what the
  // original single-request path (/api/generate-image -> generateLookImage) sends.
  const jobLook1 = mock.renderRequests.find((r) => r.lookId === "look-01")!.body;
  const tool = jobLook1.tools[0];
  assert.deepEqual(
    { model: tool.model, quality: tool.quality, size: tool.size, output_format: tool.output_format, output_compression: tool.output_compression, moderation: tool.moderation },
    { model: IMAGE_MODEL, quality: "high", size: "1024x1536", output_format: "jpeg", output_compression: 90, moderation: "low" },
  );
  assert.equal(jobLook1.model, RECOMMENDATION_MODEL);
  assert.equal(jobLook1.input[0].content[1].image_url, input.photoUrl, "User's reference photo is sent");
  assert.equal(jobLook1.input[0].content[1].detail, "original", "Reference photo at original detail");
  const jobLooks = (await getGenerationJobForUser(job.id, user))!.looks!;
  const before = mock.renderRequests.length;
  await generateLookImage({
    look: jobLooks[0],
    profile: { ...profile, photoUrl: "" },
    context: input.context,
    photoUrl: input.photoUrl,
    siblingVibes: jobLooks.slice(1).map((l) => l.vibe!).filter(Boolean),
  });
  const directLook1 = mock.renderRequests[before].body;
  assert.deepEqual(jobLook1, directLook1, "Job render request is identical to the original path's (prompt, model, settings)");
  console.log("✓ Test 24 Passed");

  console.log("\n======================================================================");
  console.log("ALL BACKGROUND GENERATION + PUSH TESTS PASSED");
  console.log("======================================================================");
}

main()
  .then(
    () => 0,
    (err) => {
      console.error("\n✗ TEST FAILED:", err);
      return 1;
    },
  )
  .then((code) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.rmSync(dbFile + suffix, { force: true });
      } catch {
        // SQLite may still hold the file open on Windows; it lives in the OS temp dir.
      }
    }
    process.exit(code);
  });
