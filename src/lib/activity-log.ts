// Lightweight step-tracking for long-running flows

export type LogStatus = 'pending' | 'active' | 'done' | 'error';

export type LogStep = {
  label: string;
  status: LogStatus;
  detail?: string;
};

/** Console-logs one step transition with a timestamp, prefixed for easy filtering in DevTools. */
function logToConsole(label: string, status: LogStatus, detail?: string) {
  const time = new Date().toISOString().split('T')[1]?.replace('Z', '');
  const prefix = `[SkinTune ${time}]`;
  if (status === 'error') console.error(`${prefix} ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  else if (status === 'done') console.log(`${prefix} ✓ ${label}`);
  else if (status === 'active') console.log(`${prefix} … ${label}`);
}

export function createActivityLog(steps: string[], onChange: (steps: LogStep[]) => void) {
  const state: LogStep[] = steps.map((label) => ({ label, status: 'pending' }));
  const emit = () => onChange([...state]);

  return {
    start(label: string) {
      const step = state.find((s) => s.label === label);
      if (!step) return;
      step.status = 'active';
      logToConsole(label, 'active');
      emit();
    },
    done(label: string) {
      const step = state.find((s) => s.label === label);
      if (!step) return;
      step.status = 'done';
      logToConsole(label, 'done');
      emit();
    },
    fail(label: string, detail: string) {
      const step = state.find((s) => s.label === label);
      if (!step) return;
      step.status = 'error';
      step.detail = detail;
      logToConsole(label, 'error', detail);
      emit();
    },
  };
}
