'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

export function FooterActions({
  onBack,
  onContinue,
  disabled = false,
  label = 'Continue',
}: {
  onBack?: () => void;
  onContinue: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-10 flex flex-col-reverse gap-3 border-t border-border/70 bg-background/95 px-4 py-4 backdrop-blur-md sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:pt-6 sm:backdrop-blur-none">
      <button
        type="button"
        onClick={onBack}
        disabled={!onBack}
        data-testid="button-step-back"
        className="focus-ring inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:bg-secondary disabled:invisible"
      >
        <ArrowLeft size={16} /> Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={disabled}
        data-testid="button-continue"
        className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-foreground shadow-[0_8px_18px_hsl(var(--primary)/.2)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {label}
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
