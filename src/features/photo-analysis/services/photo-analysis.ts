// Photo Analysis Service
// -----------------------
// Calls the backend's /api/analyze-photo route (GPT-4o vision) to judge whether
// an uploaded photo is usable for styling colour analysis, and if so, estimate
// skin tone / undertone / contrast / confidence.

import type { PhotoStatus } from '@/types';

export type PhotoAnalysisResult = {
  status: PhotoStatus;
  skinTone: string;
  undertone: string;
  contrast: string;
  confidence: number;
};

export const analyzePhoto = async (photoUrl: string): Promise<PhotoAnalysisResult> => {
  const res = await fetch('/api/analyze-photo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoUrl }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const msg =
      errData?.error ||
      errData?.message ||
      `Photo analysis service returned HTTP ${res.status}.`;
    throw new Error(msg);
  }

  const data = (await res.json()) as PhotoAnalysisResult;
  if (!data.status) throw new Error('Empty photo analysis response');
  return data;
};
