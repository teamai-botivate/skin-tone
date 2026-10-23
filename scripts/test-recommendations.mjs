import fs from 'fs';

// Load .env.local into process.env
for (const line of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq !== -1 && !line.startsWith('#')) {
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const { POST } = await import('../src/app/api/recommendations/route.ts');

const dummyProfile = {
  name: 'Anushka',
  pronouns: 'she/her/women',
  ageGroup: '25–34',
  height: '5ft 4in',
  bodyBuild: 'Average',
  appearance: { skinTone: 'Medium', undertone: 'Warm', confidence: 90, contrast: 'High' },
  fit: 'Regular',
  style: ['Traditional'],
  colorsLove: ['Pink'],
  colorsAvoid: [],
  restrictions: [],
  occasion: 'Garba',
  impression: ['Festive', 'Confident'],
  budget: '₹5,000 - ₹10,000',
  customStyleNotes: '',
};

console.log('Testing /api/recommendations POST handler...');
const req = new Request('http://localhost:3000/api/recommendations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ profile: dummyProfile }),
});

try {
  const res = await POST(req);
  console.log('Response Status:', res.status);
  const data = await res.json();
  if (res.status === 200) {
    console.log('SUCCESS! Number of recommendations:', data.recommendations?.length);
    console.log('Look 1 title:', data.recommendations?.[0]?.title);
    console.log('Look 1 outfit:', data.recommendations?.[0]?.outfit);
  } else {
    console.log('FAILED! Error response:', data);
  }
} catch (err) {
  console.error('Exception thrown:', err);
}
