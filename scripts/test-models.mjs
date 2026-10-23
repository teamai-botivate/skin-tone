import fs from 'fs';
import OpenAI from 'openai';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq !== -1 && !line.startsWith('#')) {
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

async function testImageGen() {
  console.log('Testing image generation with configured model:', env.OPENAI_IMAGE_MODEL);
  try {
    const res = await openai.images.generate({
      model: env.OPENAI_IMAGE_MODEL,
      prompt: 'A stylish woman in a modern emerald blazer, waist up portrait',
      n: 1,
      size: '1024x1024',
    });
    console.log('Images.generate SUCCESS! URL:', res.data[0].url?.slice(0, 50));
  } catch (err) {
    console.log('Images.generate FAILED:', err.status, err.message);
  }
}

async function testDalle3() {
  console.log('\nTesting image generation with dall-e-3...');
  try {
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt: 'A stylish woman in a modern emerald blazer, waist up portrait',
      n: 1,
      size: '1024x1024',
    });
    console.log('dall-e-3 SUCCESS! URL:', res.data[0].url?.slice(0, 50));
  } catch (err) {
    console.log('dall-e-3 FAILED:', err.status, err.message);
  }
}

async function testResponsesApiImage() {
  console.log('\nTesting Responses API image_generation tool with model:', env.OPENAI_IMAGE_MODEL);
  try {
    const res = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: 'Generate a portrait of a stylish woman in a navy blazer' }],
      tools: [{ type: 'image_generation', model: env.OPENAI_IMAGE_MODEL }],
    });
    console.log('Responses API SUCCESS! Output types:', res.output.map(o => o.type));
  } catch (err) {
    console.log('Responses API FAILED:', err.status, err.message);
  }
}

async function testRecommendations() {
  console.log('\nTesting recommendations chat completion with gpt-4o-mini...');
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hello in 3 words' }],
      max_tokens: 50,
    });
    console.log('gpt-4o-mini SUCCESS! Reply:', res.choices[0]?.message?.content);
  } catch (err) {
    console.log('gpt-4o-mini FAILED:', err.status, err.message);
  }
}

async function run() {
  await testRecommendations();
  await testImageGen();
  await testDalle3();
  await testResponsesApiImage();
}
run();
