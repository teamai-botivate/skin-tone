import type { PhotoStatus } from '@/types';

export type PhotoDiagnostic = {
  label: string;
  good: boolean;
  /** Shown as the headline when this status is active. */
  title: string;
  /** "Problem" — what the system detected. */
  problem: string;
  /** "Why it matters" — why this affects the read, framed supportively. */
  whyItMatters: string;
  /** "How to improve" — a concrete, actionable fix. */
  howToImprove: string;
};

export const photoDiagnostics: Record<PhotoStatus, PhotoDiagnostic> = {
  good: {
    label: 'Good photo',
    good: true,
    title: 'We can work with this.',
    problem: 'Your face is clear and evenly lit.',
    whyItMatters: 'A clear, well-lit photo gives us a reliable read on your natural coloring.',
    howToImprove: 'Nothing to do here — you’re ready to continue.',
  },
  'low-light': {
    label: 'Low lighting',
    good: false,
    title: 'Your photo is a little dark.',
    problem: 'Your photo is too dark to read your natural coloring clearly.',
    whyItMatters: 'Low light shifts how skin tone and undertone appear, which can throw off your appearance profile.',
    howToImprove: 'Move near natural daylight and avoid backlighting — try facing a window instead of standing in front of one.',
  },
  'warm-light': {
    label: 'Warm lighting',
    good: false,
    title: 'The lighting is adding a tint.',
    problem: 'The lighting in this photo is adding a warm, yellow tint.',
    whyItMatters: 'Indoor bulbs can shift colors enough to make your undertone read differently than it actually is.',
    howToImprove: 'Try natural daylight without yellow indoor lights, ideally near a window in the daytime.',
  },
  blurry: {
    label: 'Blurry photo',
    good: false,
    title: 'The photo is slightly blurry.',
    problem: 'The photo is slightly blurry.',
    whyItMatters: 'A soft or shaky image makes it hard to read fine detail like contrast and undertone.',
    howToImprove: 'Hold your phone steady, or rest it against something solid, and take another photo.',
  },
  angle: {
    label: 'Unhelpful angle',
    good: false,
    title: 'Let’s try a straighter angle.',
    problem: 'Your face isn’t facing the camera directly.',
    whyItMatters: 'An angled shot changes how light falls across your face, which affects the accuracy of the read.',
    howToImprove: 'Please face the camera directly, at eye level, so we can analyse your appearance accurately.',
  },
  filter: {
    label: 'Filter detected',
    good: false,
    title: 'Let’s keep it real.',
    problem: 'It looks like a beauty or filter effect may be affecting colour accuracy.',
    whyItMatters: 'Filters smooth skin and shift color, so recommendations built on a filtered photo won’t match your real coloring.',
    howToImprove: 'Please upload an unfiltered photo, straight from your camera.',
  },
  occluded: {
    label: 'Face partially covered',
    good: false,
    title: 'A little more of your face, please.',
    problem: 'Please make sure your face is clearly visible.',
    whyItMatters: 'Sunglasses, hats, or hair covering your cheeks and jaw make it hard to read your full coloring.',
    howToImprove: 'Remove anything covering your face, if you feel comfortable, and try again.',
  },
  'low-confidence': {
    label: 'Low confidence',
    good: false,
    title: 'We want to get this right.',
    problem: 'The image is usable, but the read is uncertain.',
    whyItMatters: 'A low-confidence read means your recommendations may not reflect your real coloring as closely as they could.',
    howToImprove: 'A clear, unfiltered photo in soft natural daylight will improve the result.',
  },
};

// Staged copy shown while a photo is being analyzed.
export const photoAnalysisStages: string[] = [
  'Analyzing your appearance…',
  'Checking lighting…',
  'Checking image quality…',
  'Building your appearance profile…',
];
