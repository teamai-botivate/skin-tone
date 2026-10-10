// Photo Analysis Service
// -----------------------
// Calls the backend's /api/analyze-photo route (GPT-4o vision — see
// artifacts/api-server/src/routes/analyze-photo.ts) to judge whether an
// uploaded photo is usable for styling colour analysis, and if so, estimate
// skin tone / undertone / contrast / confidence. This is the one place the
// raw photo actually needs to leave the browser — every other AI call
// (recommendations, image generation) deliberately never sends it.
//
// Falls back to a mock "good" result if the call fails for any reason (no
// OPENAI_API_KEY configured, network issue, etc.) so the onboarding flow
// never gets stuck on a missing/misconfigured backend.

import type { PhotoStatus } from '@/types';

export type PhotoAnalysisResult = {
  status: PhotoStatus;
  skinTone: string;
  undertone: string;
  contrast: string;
  confidence: number;
};

const mockAnalysis: PhotoAnalysisResult = {
  status: 'good',
  skinTone: 'Medium',
  undertone: 'Warm',
  contrast: 'Medium',
  confidence: 94,
};

export const analyzePhoto = async (photoUrl: string): Promise<PhotoAnalysisResult> => {
  try {
    const res = await fetch('/api/analyze-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoUrl }),
    });
    if (!res.ok) throw new Error(`Photo analysis request failed: ${res.status}`);
    const data = (await res.json()) as PhotoAnalysisResult;
    if (!data.status) throw new Error('Empty photo analysis response');
    return data;
  } catch (err) {
    console.warn('Falling back to mock photo analysis:', err);
    return mockAnalysis;
  }
};
