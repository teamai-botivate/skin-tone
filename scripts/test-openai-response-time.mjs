import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { performance } from 'perf_hooks';

// Resolve OpenAI across monorepo packages safely
let OpenAI;
try {
  const mod = await import('openai');
  OpenAI = mod.OpenAI || mod.default?.OpenAI || mod.default;
} catch {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(process.cwd(), 'artifacts/skintune-next/node_modules/openai/index.mjs'),
    path.resolve(process.cwd(), 'node_modules/openai/index.mjs'),
    path.resolve(scriptDir, '../artifacts/skintune-next/node_modules/openai/index.mjs'),
    path.resolve(scriptDir, '../node_modules/openai/index.mjs'),
  ];
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      const mod = await import(pathToFileURL(candidate).href);
      OpenAI = mod.OpenAI || mod.default?.OpenAI || mod.default;
      break;
    }
  }
}

if (!OpenAI) {
  console.error('❌ Could not resolve openai package. Please run: pnpm install');
  process.exit(1);
}

function loadEnv() {
  const envPaths = [
    '.env.local',
    'artifacts/skintune-next/.env.local',
    '.env'
  ];

  const env = {};
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq !== -1) {
          const k = trimmed.slice(0, eq).trim();
          let v = trimmed.slice(eq + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1).trim();
          }
          if (!env[k]) env[k] = v;
        }
      }
    }
  }
  return env;
}

const env = loadEnv();
const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const textModel = env.OPENAI_TEXT_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini';

console.log('===========================================================');
console.log('🚀 OPENAI RESPONSE TIME BENCHMARK');
console.log('===========================================================');

if (!apiKey) {
  console.error('❌ Error: OPENAI_API_KEY not found in .env files or environment.');
  process.exit(1);
}

const maskedKey = `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
console.log(`🔑 API Key:     ${maskedKey} (Length: ${apiKey.length})`);
console.log(`🤖 Text Model:  ${textModel}`);
console.log('-----------------------------------------------------------\n');

const openai = new OpenAI({ apiKey });

async function benchmarkChat() {
  console.log(`[Test 1/3] Testing Standard Completion (${textModel})...`);
  const t0 = performance.now();
  try {
    const isReasoning = textModel.includes('gpt-5') || textModel.includes('o1') || textModel.includes('o3');
    const params = {
      model: textModel,
      messages: [{ role: 'user', content: 'Reply in 5 words: Confirm you are online.' }],
      ...(isReasoning ? { max_completion_tokens: 50 } : { max_tokens: 50 }),
    };
    const response = await openai.chat.completions.create(params);
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    const durationSec = (durationMs / 1000).toFixed(2);
    const reply = response.choices[0]?.message?.content?.trim() || '';

    console.log(`✅ Success!`);
    console.log(`⏱️ Response Time: ${durationSec}s (${durationMs} ms)`);
    console.log(`💬 Model Reply:   "${reply}"`);
    console.log(`📊 Prompt Tokens: ${response.usage?.prompt_tokens}, Completion Tokens: ${response.usage?.completion_tokens}`);
    return { success: true, durationMs };
  } catch (err) {
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    console.error(`❌ Failed after ${(durationMs / 1000).toFixed(2)}s:`, err.message);
    return { success: false, durationMs, error: err.message };
  }
}

async function benchmarkWebSearch() {
  console.log(`\n[Test 2/2] Testing OpenAI Web Search Preview (Responses API)...`);
  console.log(`ℹ️ Note: Web search actively browses live web pages, which has higher latency.`);
  const t0 = performance.now();
  try {
    const response = await openai.responses.create({
      model: textModel,
      tools: [{ type: 'web_search_preview' }],
      input: 'Find 1 navy blue blazer on myntra.com for women in India with exact real price and URL',
    });
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    const durationSec = (durationMs / 1000).toFixed(2);
    const preview = (response.output_text || '').trim().slice(0, 150).replace(/\n/g, ' ');

    console.log(`✅ Success!`);
    console.log(`⏱️ Response Time: ${durationSec}s (${durationMs} ms)`);
    console.log(`📄 Output Preview: "${preview}..."`);
    console.log(`📦 Tool Calls / Output Items: ${response.output?.length || 0}`);
    return { success: true, durationMs };
  } catch (err) {
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    console.error(`❌ Failed after ${(durationMs / 1000).toFixed(2)}s:`, err.message);
    return { success: false, durationMs, error: err.message };
  }
}

async function benchmarkTavily() {
  const tavilyKey = env.TAVILY_API_KEY || process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.log('\n[Test 3/3] Tavily Search: Skipped (TAVILY_API_KEY not set).');
    return { success: false, durationMs: 0, skipped: true };
  }

  console.log(`\n[Test 3/3] Testing Tavily Web Search API...`);
  const t0 = performance.now();
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: 'navy blue blazer myntra',
        max_results: 2,
      }),
    });
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    const durationSec = (durationMs / 1000).toFixed(2);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    }

    console.log(`✅ Success!`);
    console.log(`⏱️ Response Time: ${durationSec}s (${durationMs} ms)`);
    console.log(`📦 Results Returned: ${data.results?.length || 0}`);
    if (data.results?.[0]) {
      console.log(`🔗 Sample Link:    ${data.results[0].url}`);
    }
    return { success: true, durationMs };
  } catch (err) {
    const t1 = performance.now();
    const durationMs = Math.round(t1 - t0);
    console.error(`❌ Failed after ${(durationMs / 1000).toFixed(2)}s:`, err.message);
    return { success: false, durationMs, error: err.message };
  }
}

async function main() {
  const chatRes = await benchmarkChat();
  const searchRes = await benchmarkWebSearch();
  const tavilyRes = await benchmarkTavily();

  console.log('\n===========================================================');
  console.log('📋 SUMMARY:');
  console.log('===========================================================');
  console.log(`- Standard OpenAI Chat:        ${chatRes.success ? `${(chatRes.durationMs / 1000).toFixed(2)}s (${chatRes.durationMs} ms)` : 'FAILED'}`);
  console.log(`- OpenAI Web Search Preview:   ${searchRes.success ? `${(searchRes.durationMs / 1000).toFixed(2)}s (${searchRes.durationMs} ms)` : 'FAILED'}`);
  if (!tavilyRes.skipped) {
    console.log(`- Tavily Live Search:          ${tavilyRes.success ? `${(tavilyRes.durationMs / 1000).toFixed(2)}s (${tavilyRes.durationMs} ms)` : 'FAILED'}`);
  }
  console.log('===========================================================');
}

main();
