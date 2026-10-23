'use client';

import { ArrowLeft, Sparkles, ChevronDown } from 'lucide-react';

export function Header({
  onBack,
  onSettings,
  step,
  total,
  name,
}: {
  onBack?: () => void;
  onSettings: () => void;
  step?: number;
  total?: number;
  name?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 px-4 py-4 backdrop-blur-md sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              data-testid="button-back"
              className="focus-ring rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              aria-label="Go back"
            >
              <ArrowLeft size={19} />
            </button>
          ) : (
            <span className="size-9" />
          )}
          <button
            type="button"
            onClick={onSettings}
            data-testid="button-open-settings"
            className="focus-ring flex items-center gap-2"
            aria-label="Open LetStyle home"
          >
            <span className="grid size-9 place-items-center rounded-[13px] bg-primary text-primary-foreground shadow-sm">
              <Sparkles size={18} />
            </span>
            <span className="font-serif text-xl font-semibold tracking-tight">LetStyle</span>
          </button>
        </div>
        {step && total && (
          <div className="hidden items-center gap-3 sm:flex">
            <span className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">Your edit</span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${(step / total) * 100}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">
              {step} / {total}
            </span>
          </div>
        )}
        {name ? (
          <button
            type="button"
            onClick={onSettings}
            data-testid="button-profile-menu"
            className="focus-ring flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-secondary"
          >
            <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-sm font-semibold sm:block">{name}</span>
            <ChevronDown size={15} className="text-muted-foreground" />
          </button>
        ) : (
          <span className="size-9" />
        )}
      </div>
    </header>
  );
}
