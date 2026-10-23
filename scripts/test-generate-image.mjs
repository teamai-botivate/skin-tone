import fs from 'fs';

// Load .env.local into process.env
for (const line of fs.readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const eq = line.indexOf('=');
  if (eq !== -1 && !line.startsWith('#')) {
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const { POST } = await import('../src/app/api/generate-image/route.ts');

const dummyLook = {
  id: 'look-01',
  title: 'Festive Flared Chaniya Choli',
  note: 'Vibrant mirror work and authentic flare.',
  vibe: 'Radiant',
  personaEnergy: 'High-energy festive celebration.',
  palette: ['#E91E63', '#FFD700', '#FFFFFF'],
  imageUrl: '/replace-with-generated/pending.webp',
  outfit: 'Flared Pink Mirror-Work Chaniya Choli',
  outfitColor: 'Rani pink with mirror accents',
  jewellery: 'Oxidised silver jhumkas and cuff bangles',
  hairstyle: 'Half-up braided crown',
  makeup: 'Warm glow with soft berry lips',
  footwear: 'Embroidered ethnic juttis',
  accessories: 'Embroidered bandhani potli bag',
  confidence: 96,
  applicableCategories: ['outfit', 'footwear', 'jewellery', 'makeup', 'accessories'],
  reasoning: ['Perfect for Garba dancing.'],
  pieces: [
    { category: 'Outfit', name: 'Flared Pink Mirror-Work Chaniya Choli', detail: 'Authentic cotton lehenga' }
  ]
};

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

console.log('Testing /api/generate-image POST handler (without uploaded photo)...');
const req = new Request('http://localhost:3000/api/generate-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    look: dummyLook,
    profile: dummyProfile,
    context: { occasion: 'Garba', details: '' },
    photoUrl: undefined,
    siblingVibes: ['Festive', 'Traditional'],
  }),
});

try {
  const res = await POST(req);
  console.log('Response Status:', res.status);
  const data = await res.json();
  if (res.status === 200) {
    console.log('SUCCESS! Look ID:', data.look?.id);
    console.log('Image URL prefix:', data.look?.imageUrl?.slice(0, 50));
    console.log('Image URL length:', data.look?.imageUrl?.length);
  } else {
    console.log('FAILED! Error response:', data);
  }
} catch (err) {
  console.error('Exception thrown:', err);
}
