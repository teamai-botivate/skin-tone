/**
 * Integration Test for LetStyle HTTP API Routes
 * 
 * Verifies that HTTP routes over the network:
 * 1. Reject unauthenticated access to paid AI routes with 401
 * 2. Allow registration via POST /api/auth/signup with HttpOnly cookies & 20 credits
 * 3. Support GET /api/auth/me
 * 4. Support POST /api/auth/login and POST /api/auth/logout
 * 5. Provide credit history ledger via GET /api/credits/history
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details = "") {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    failedCount++;
  }
}

async function testHttpEndpoints() {
  console.log("\n=======================================================");
  console.log("  Running LetStyle HTTP API Integration Tests");
  console.log(`  Target: ${BASE_URL}`);
  console.log("=======================================================\n");

  // 1. Unauthenticated Paid Routes Protection (Must Return 401)
  console.log(">> Test 1: Paid AI Endpoints Reject Unauthenticated Access (401)");

  const protectedEndpoints = [
    { path: "/api/recommendations", body: { profile: { occasion: "Party" } } },
    { path: "/api/generate-image", body: { look: { id: "1" }, profile: {} } },
    { path: "/api/refine-image", body: { look: { id: "1", imageUrl: "https://example.com/test.jpg" }, customization: "blue" } },
    { path: "/api/try-on", body: { dress: { id: "1", title: "Test" }, profile: {}, photoUrl: "test" } },
    { path: "/api/avatar/create", body: { photoUrl: "test", profile: {} } },
    { path: "/api/search-dresses", body: { profile: { pronouns: "women" }, offset: 0, limit: 10 } },
    { path: "/api/search-dresses/research", body: { profile: { pronouns: "women" }, limit: 10, memory: {} } },
    { path: "/api/search-dresses/refine", body: { profile: { pronouns: "women" }, limit: 10, memory: {}, refinement: "blue" } },
    { path: "/api/product-recommendations", body: { look: { id: "1" }, profile: {} } },
    { path: "/api/analyze-photo", body: { photoUrl: "data:image/jpeg;base64,123" } },
  ];

  for (const ep of protectedEndpoints) {
    const res = await fetch(`${BASE_URL}${ep.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ep.body),
    });
    const json = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      `Endpoint ${ep.path} blocks unauthenticated requests with 401`,
      `Actual status: ${res.status}, body: ${JSON.stringify(json)}`,
    );
    assert(
      json.code === "UNAUTHORIZED" || json.error?.toLowerCase().includes("authentication"),
      `Endpoint ${ep.path} returns safe authorization error message`,
    );
  }

  // 2. Public / Non-Paid Endpoints Are Not Broken
  console.log("\n>> Test 2: Public Non-Paid Endpoints Remain Accessible");
  const healthRes = await fetch(`${BASE_URL}/api/healthz`);
  assert(healthRes.status === 200, "GET /api/healthz remains publicly accessible (200)");

  // 3. User Registration Flow
  console.log("\n>> Test 3: User Signup via POST /api/auth/signup");
  const testEmail = `http.user.${Date.now()}@example.com`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Harper Style",
      email: testEmail,
      password: "StrongPassword99",
      confirmPassword: "StrongPassword99",
    }),
  });

  assert(signupRes.status === 200, "Signup endpoint returns 200 OK");
  const signupJson = await signupRes.json();
  assert(signupJson.ok === true, "Signup response contains ok: true");
  assert(signupJson.user?.email === testEmail, "Signup response returns normalized email");
  assert(signupJson.credits === 20, "Signup awards exactly 20 initial free credits");

  // Extract session cookie from Set-Cookie header
  const setCookie = signupRes.headers.get("set-cookie") || "";
  assert(setCookie.includes("letstyle_session="), "Set-Cookie header sets letstyle_session");
  assert(setCookie.toLowerCase().includes("httponly"), "Session cookie is HttpOnly");
  assert(setCookie.toLowerCase().includes("samesite=lax"), "Session cookie has SameSite=Lax");

  const cookieMatch = /letstyle_session=([^;]+)/.exec(setCookie);
  const sessionCookie = cookieMatch ? `letstyle_session=${cookieMatch[1]}` : "";
  assert(Boolean(sessionCookie), "Session token extracted from response cookie");

  // 4. Authenticated /api/auth/me
  console.log("\n>> Test 4: Session Verification via GET /api/auth/me");
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  assert(meRes.status === 200, "GET /api/auth/me returns 200 OK");
  const meJson = await meRes.json();
  assert(meJson.user?.email === testEmail, "GET /api/auth/me returns authenticated user");
  assert(meJson.credits === 20, "GET /api/auth/me returns 20 credits");

  // 5. Credit History Audit Ledger
  console.log("\n>> Test 5: Credit Ledger History via GET /api/credits/history");
  const historyRes = await fetch(`${BASE_URL}/api/credits/history`, {
    headers: { Cookie: sessionCookie },
  });
  assert(historyRes.status === 200, "GET /api/credits/history returns 200 OK");
  const historyJson = await historyRes.json();
  assert(Array.isArray(historyJson.history), "History returns array of transactions");
  assert(historyJson.history.length >= 1, "History contains initial credit grant transaction");
  assert(historyJson.history[0].amount === 20, "Grant transaction records +20 credits");

  // 6. Logout Flow
  console.log("\n>> Test 6: Logout via POST /api/auth/logout");
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie },
  });
  assert(logoutRes.status === 200, "POST /api/auth/logout returns 200 OK");

  // Verify session is invalidated
  const meAfterLogout = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  });
  const meAfterLogoutJson = await meAfterLogout.json();
  assert(meAfterLogoutJson.user === null, "Subsequent GET /api/auth/me returns user: null after logout");

  // 7. Login Flow
  console.log("\n>> Test 7: Login via POST /api/auth/login");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: testEmail,
      password: "StrongPassword99",
    }),
  });
  assert(loginRes.status === 200, "POST /api/auth/login returns 200 OK with correct credentials");
  const loginJson = await loginRes.json();
  assert(loginJson.ok === true, "Login response contains ok: true");
  assert(loginJson.credits === 20, "Login response preserves existing credits (no reset, no repeat grant)");

  console.log("\n=======================================================");
  console.log(`  HTTP Tests Completed: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

testHttpEndpoints().catch((err) => {
  console.error("HTTP test error:", err);
  process.exit(1);
});
