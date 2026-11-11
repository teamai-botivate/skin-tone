// Generation progress shown on the "generating" screen.
// Built only from real job state (the server's stage and which look images
// are stored), never from a timer, so what the user sees is what is happening.

export type GenerationStage = 'queued' | 'styling' | 'rendering' | 'done';

export interface GenerationLookProgress {
  id: string;
  title: string;
  ready: boolean;
}

export interface GenerationProgress {
  stage: GenerationStage;
  /** Empty until the five looks have been designed. */
  looks: GenerationLookProgress[];
}

export interface GenerationProgressSummary {
  label: string;
  detail: string;
  readyCount: number;
  total: number;
  /** 0–1 share of look images that are ready; null while no image can be ready yet. */
  fraction: number | null;
}

export const EXPECTED_LOOK_COUNT = 5;

export function normalizeStage(stage: string | null | undefined): GenerationStage {
  return stage === 'styling' || stage === 'rendering' || stage === 'done' ? stage : 'queued';
}

export function summarizeGenerationProgress(progress: GenerationProgress): GenerationProgressSummary {
  const total = progress.looks.length || EXPECTED_LOOK_COUNT;
  const readyCount = progress.looks.filter((look) => look.ready).length;
  const lookWord = (n: number) => `look${n === 1 ? '' : 's'}`;

  // Looks arriving means styling is over, even if a status poll is still behind.
  const stage =
    progress.stage === 'done' || (progress.looks.length > 0 && readyCount === progress.looks.length)
      ? 'done'
      : progress.looks.length > 0 && progress.stage !== 'rendering'
        ? 'rendering'
        : progress.stage;

  switch (stage) {
    case 'queued':
      return { label: 'Starting your styling session', detail: 'Queued — your looks will start in a moment.', readyCount: 0, total, fraction: null };
    case 'styling':
      return {
        label: `Designing your ${total} looks`,
        detail: 'Choosing outfits, palette and accessories for your profile and occasion.',
        readyCount: 0,
        total,
        fraction: null,
      };
    case 'rendering': {
      const rendering = total - readyCount;
      return {
        label: `${readyCount} of ${total} ${lookWord(total)} ready`,
        detail: `Rendering ${rendering} ${lookWord(rendering)} on your photo at the same time.`,
        readyCount,
        total,
        fraction: readyCount / total,
      };
    }
    default:
      return { label: `All ${total} looks are ready`, detail: 'Opening your results…', readyCount: total, total, fraction: 1 };
  }
}
