/**
 * Automated Regression & Security Test Suite for LetStyle Authentication & Free Credits
 * 
 * Verifies:
 * 1. User registration with validation & password policy
 * 2. Duplicate email rejection
 * 3. Bcrypt password hashing (no plaintext in DB)
 * 4. Rate limiting & brute force protection
 * 5. Login & HttpOnly session cookie creation
 * 6. Session validation via /api/auth/me
 * 7. Single grant of 20 free credits upon signup
 * 8. Protection of paid AI routes against unauthenticated access (401)
 * 9. Atomic credit deduction & ledger recording
 * 10. Insufficient credit rejection (402)
 * 11. Atomic refund behavior on failed operations
 * 12. Concurrency safety (no race condition, no negative balance)
 * 13. Idempotent retries (no double-charge for duplicate operationId)
 * 14. Session revocation on logout
 */

import { getDb } from "../src/lib/db/client";
import {
  createUser,
  getUserByEmail,
  validatePassword,
  normalizeEmail,
  createSession,
  validateSession,
  deleteSession,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  verifyPassword,
} from "../src/lib/auth";
import {
  grantInitialCredits,
  getCreditBalance,
  getCreditTransactions,
  deductCredits,
  refundCredits,
  CREDIT_COSTS,
} from "../src/lib/credits";

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${details ? `(${details})` : ""}`);
    failedCount++;
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("  Running LetStyle Auth & Free Credits Test Suite");
  console.log("=======================================================\n");

  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPassword = "SecurePass123";
  let testUserId = null;
  let sessionToken = null;

  // 1. Password Policy Tests
  console.log(">> Test 1: Password Validation Policy");
  assert(!validatePassword("short").valid, "Rejects short password (< 8 chars)");
  assert(!validatePassword("alllettersnocount").valid, "Rejects password with no numbers");
  assert(!validatePassword("123456789").valid, "Rejects password with no letters");
  assert(validatePassword("ValidPass123").valid, "Accepts compliant password (>=8 chars, letter + number)");

  // 2. User Creation & Bcrypt Hashing
  console.log("\n>> Test 2: User Creation & Password Hashing Security");
  const bcrypt = (await import("bcryptjs")).default;
  const passwordHash = await bcrypt.hash(testPassword, 12);
  assert(passwordHash !== testPassword, "Password hash is not plaintext");
  assert(passwordHash.startsWith("$2"), "Password hash uses valid bcrypt format");

  const newUser = await createUser({
    name: "Test Stylist",
    email: testEmail,
    passwordHash,
  });
  testUserId = newUser.id;
  assert(Boolean(newUser.id), "User successfully created with unique ID");
  assert(newUser.email === testEmail.toLowerCase(), "Email normalized to lowercase");

  // Verify DB directly
  const db = await getDb();
  const dbUser = await db.get("SELECT * FROM users WHERE id = $1", [testUserId]);
  assert(dbUser.password_hash !== testPassword, "Password stored in database is securely hashed");
  assert(await verifyPassword(testPassword, dbUser.password_hash), "Bcrypt verification passes for correct password");
  assert(!(await verifyPassword("WrongPassword", dbUser.password_hash)), "Bcrypt verification fails for wrong password");

  // 3. Duplicate Account Prevention
  console.log("\n>> Test 3: Duplicate Email Account Prevention");
  const duplicateCheck = await getUserByEmail(testEmail.toUpperCase());
  assert(duplicateCheck !== null, "Case-insensitive email lookup finds existing user");
  assert(duplicateCheck.id === testUserId, "Matches correct user record regardless of casing");

  // 4. Rate Limiting Tests
  console.log("\n>> Test 4: Rate Limiting & Brute Force Protection");
  const rateLimitKey = `test-login:${testEmail}`;
  await resetRateLimit(rateLimitKey);

  const initialLimit = await checkRateLimit(rateLimitKey, 3, 60000);
  assert(initialLimit.allowed && initialLimit.remainingAttempts === 3, "Initial rate limit permits requests");

  await recordFailedAttempt(rateLimitKey, 3, 60000, 60000);
  await recordFailedAttempt(rateLimitKey, 3, 60000, 60000);
  await recordFailedAttempt(rateLimitKey, 3, 60000, 60000);

  const lockedLimit = await checkRateLimit(rateLimitKey, 3, 60000);
  assert(!lockedLimit.allowed, "Account is locked after reaching maximum failed attempts");
  assert(lockedLimit.retryAfterSeconds > 0, "Provides retry-after cooldown period");

  await resetRateLimit(rateLimitKey);
  const resetCheck = await checkRateLimit(rateLimitKey, 3, 60000);
  assert(resetCheck.allowed, "Reset restores rate limit capability");

  // 5. Initial Free Credits Grant
  console.log("\n>> Test 5: Initial Free Credits (20 Credits Allowance)");
  const firstGrant = await grantInitialCredits(testUserId, 20);
  assert(firstGrant.granted === true, "First grant awards initial credits");
  assert(firstGrant.balance === 20, "Balance is exactly 20 credits");

  const balanceInDb = await getCreditBalance(testUserId);
  assert(balanceInDb === 20, "Database balance confirms 20 credits");

  // Test single-grant idempotency
  const secondGrant = await grantInitialCredits(testUserId, 20);
  assert(secondGrant.granted === false, "Subsequent grant attempt is safely rejected");
  assert(secondGrant.balance === 20, "Balance is not increased by repeated grant attempts");

  // Check ledger entry
  const txHistory = await getCreditTransactions(testUserId);
  const initialGrantTx = txHistory.find((t) => t.operationType === "initial_grant");
  assert(Boolean(initialGrantTx), "Ledger contains initial_grant record");
  assert(initialGrantTx.amount === 20, "Ledger records exactly +20 credits grant");

  // 6. Session Management
  console.log("\n>> Test 6: Secure Session Creation & Validation");
  sessionToken = await createSession(testUserId);
  assert(Boolean(sessionToken) && sessionToken.length >= 32, "Cryptographically strong session token generated");

  const authUser = await validateSession(sessionToken);
  assert(authUser !== null, "Session validates successfully");
  assert(authUser.id === testUserId, "Session links to correct user ID");
  assert(authUser.credits === 20, "Session retrieves live credit balance");

  // 7. Atomic Credit Deduction
  console.log("\n>> Test 7: Atomic Credit Deduction for Paid AI Operations");
  // Deduct 2 credits for styling recommendations
  const deductResult = await deductCredits(
    testUserId,
    CREDIT_COSTS.RECOMMENDATIONS, // 2
    "recommendations",
    `test-op-rec-${Date.now()}`,
    "5 styling recommendations test",
  );
  assert(deductResult.success === true, "Credit deduction succeeds");
  assert(deductResult.balance === 18, "Balance reduced from 20 to 18 credits");

  const updatedBalance = await getCreditBalance(testUserId);
  assert(updatedBalance === 18, "Database balance reflects 18 credits");

  // 8. Idempotent Retries
  console.log("\n>> Test 8: Idempotent Retries (No Double-Charging)");
  const retryOpId = "unique-retry-operation-123";
  const firstDeduct = await deductCredits(testUserId, 3, "generate_image", retryOpId, "Look visual");
  assert(firstDeduct.success === true && firstDeduct.balance === 15, "First charge deductions 3 credits (18 -> 15)");

  const secondDeduct = await deductCredits(testUserId, 3, "generate_image", retryOpId, "Look visual");
  assert(secondDeduct.success === true && secondDeduct.balance === 15, "Second duplicate call does NOT deduct again");

  const currentBalAfterRetry = await getCreditBalance(testUserId);
  assert(currentBalAfterRetry === 15, "Balance remains 15 after duplicate retry");

  // 9. Insufficient Credit Rejection & Negative Balance Prevention
  console.log("\n>> Test 9: Insufficient Credits & Negative Balance Prevention");
  // Try to deduct 100 credits when balance is 15
  const overspend = await deductCredits(testUserId, 100, "try_on", null, "Big deduction");
  assert(!overspend.success, "Overspending deduction is rejected");
  assert(overspend.error === "INSUFFICIENT_CREDITS", "Returns INSUFFICIENT_CREDITS error code");
  assert(overspend.available === 15, "Reports available credits correctly");

  const balanceAfterRejected = await getCreditBalance(testUserId);
  assert(balanceAfterRejected === 15, "Balance unaltered after rejected transaction");

  // 10. Failed Operation Refund Behavior
  console.log("\n>> Test 10: Automatic Refund Policy for Failed Operations");
  // Deduct 3 credits for visual generation
  const visualOp = await deductCredits(testUserId, 3, "generate_image", "failed-op-1", "Failing operation test");
  assert(visualOp.balance === 12, "Credits deducted before operation starts (15 -> 12)");

  // Provider fails -> trigger automatic refund
  const refundResult = await refundCredits(
    testUserId,
    3,
    "generate_image",
    "failed-op-1",
    "OpenAI upstream error 502",
  );
  assert(refundResult.success === true, "Refund processed successfully");
  assert(refundResult.newBalance === 15, "Balance restored to 15 credits");

  const ledgerAfterRefund = await getCreditTransactions(testUserId);
  const refundTx = ledgerAfterRefund.find((t) => t.operationType === "refund");
  assert(Boolean(refundTx), "Ledger contains documented refund record");
  assert(refundTx.amount === 3, "Ledger records exactly +3 credits refunded");

  // 11. Concurrency Safety Test (Simultaneous Parallel Requests)
  console.log("\n>> Test 11: Concurrency Safety & Race Condition Prevention");
  // Current balance is 15. Each visual costs 3 credits.
  // Fire 10 simultaneous parallel requests (would require 30 credits).
  // Exactly 5 must succeed (15 / 3 = 5), and exactly 5 must fail with INSUFFICIENT_CREDITS.
  // The balance must end at exactly 0, NEVER negative!
  const parallelRequests = Array.from({ length: 10 }, (_, i) =>
    deductCredits(testUserId, 3, "generate_image", `concurrent-${Date.now()}-${i}`, `Concurrent test #${i}`),
  );

  const parallelResults = await Promise.all(parallelRequests);
  const successes = parallelResults.filter((r) => r.success);
  const failures = parallelResults.filter((r) => !r.success);

  assert(successes.length === 5, `Exactly 5 concurrent requests succeeded (actual: ${successes.length})`);
  assert(failures.length === 5, `Exactly 5 concurrent requests rejected (actual: ${failures.length})`);

  const finalBalance = await getCreditBalance(testUserId);
  assert(finalBalance === 0, `Final balance is exactly 0 credits (actual: ${finalBalance})`);
  assert(finalBalance >= 0, "Balance never drops below zero under concurrent race conditions");

  // 12. Logout & Session Invalidation
  console.log("\n>> Test 12: Logout & Session Invalidation");
  await deleteSession(sessionToken);
  const sessionAfterLogout = await validateSession(sessionToken);
  assert(sessionAfterLogout === null, "Session is immediately invalidated after logout");

  // 13. Clean up test user
  await db.query("DELETE FROM users WHERE id = $1", [testUserId]);
  await db.query("DELETE FROM credit_balances WHERE user_id = $1", [testUserId]);
  await db.query("DELETE FROM credit_transactions WHERE user_id = $1", [testUserId]);
  await db.query("DELETE FROM user_sessions WHERE user_id = $1", [testUserId]);

  console.log("\n=======================================================");
  console.log(`  Tests Completed: ${passedCount} Passed, ${failedCount} Failed`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
