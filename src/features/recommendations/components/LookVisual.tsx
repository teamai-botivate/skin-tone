'use client';

import { useEffect, useState } from 'react';
import type { LookRecommendation } from '@/types';
import { Sparkles, RefreshCw, Clock3 } from 'lucide-react';

export const hasRealImage = (url: string) => Boolean(url) && !url.startsWith('/replace-with-generated/');

export function LookVisual({
  look,
  large = false,
  onRetry,
}: {
  look: LookRecommendation;
  large?: boolean;
  onRetry?: () => void;
}) {
  if (hasRealImage(look.imageUrl)) {
    return (
      <div className={`relative overflow-hidden rounded-[1.4rem] bg-[#e4d6c4] ${large ? 'min-h-[390px]' : 'h-56'}`}>
        <img
          src={look.imageUrl}
          alt={`${look.title} — style visualisation`}
          className="size-full object-cover"
          loading="lazy"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-card/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-foreground backdrop-blur">
          Style visualisation
        </span>
      </div>
    );
  }
  return (
    <div
      className={`relative overflow-hidden rounded-[1.4rem] bg-[#e4d6c4] ${large ? 'min-h-[390px]' : 'h-56'}`}
      data-image-url={look.imageUrl}
      aria-label={`${look.title} visual placeholder`}
    >
      <div
        className="absolute inset-0 opacity-75"
        style={{
          background: `radial-gradient(circle at 68% 21%, ${look.palette[1]} 0 8%, transparent 8.5%), linear-gradient(145deg, ${look.palette[2]} 0 38%, ${look.palette[0]} 38% 70%, #b78668 70%)`,
        }}
      />
      <div className="absolute bottom-[-8%] left-[23%] h-[82%] w-[55%] rounded-t-[48%] bg-card/70 mix-blend-screen" />
      <div className="absolute left-[39%] top-[16%] size-[22%] rounded-full bg-[#b7785c]" />
      <div className="absolute bottom-[15%] left-1/2 h-[42%] w-[20%] -translate-x-1/2 rounded-[45%] bg-card/55" />
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-card/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground backdrop-blur">
          Visualisation unavailable
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            data-testid={`button-retry-visual-${look.id}`}
            className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground shadow transition hover:brightness-105"
          >
            Retry visual
          </button>
        )}
      </div>
    </div>
  );
}

const generatingStages = [
  'Reading the room',
  'Balancing your palette',
  'Building complete outfits',
  'Styling every detail',
  'Fitting each piece to you',
  'Rendering your look',
  'Adding the finishing touches',
];

export function Generating({
  error,
  onRetry,
  onBack,
}: {
  error?: string | null;
  onRetry?: () => void;
  onBack?: () => void;
} = {}) {
  const [active, setActive] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (error) return;
    const stageTimer = window.setInterval(
      () => setActive((value) => (value + 1) % generatingStages.length),
      2600,
    );
    const clockTimer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => {
      window.clearInterval(stageTimer);
      window.clearInterval(clockTimer);
    };
  }, [error]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  if (error) {
    return (
      <div className="noise min-h-[100dvh] bg-background text-foreground">
        <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col justify-center px-6 py-16">
          <div className="mb-8 flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground">
              <Sparkles size={19} />
            </span>
            <span className="font-serif text-2xl">LetStyle</span>
          </div>
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-destructive">Generation Notice</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-foreground">
              Unable to generate styling recommendations
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {error === '[object Event]' || error === '[object Object]'
                ? 'A temporary network connection or asset loading event occurred. Please click Try again.'
                : error}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  data-testid="button-retry-generate"
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <RefreshCw size={15} /> Try again
                </button>
              )}
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold hover:border-primary/50"
                >
                  Back to edit profile
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-6 py-16">
        <div className="mb-14 flex items-center gap-2">
          <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground">
            <Sparkles size={19} className="animate-pulse" />
          </span>
          <span className="font-serif text-2xl">LetStyle</span>
        </div>
        <p className="text-xs font-bold uppercase tracking-[.24em] text-primary">Your personal edit</p>
        <h1 className="mt-5 max-w-xl font-serif text-[clamp(3rem,8vw,6.5rem)] leading-[.88] tracking-[-.05em]">
          Making room<br />
          for your <em className="text-primary">point of view.</em>
        </h1>
        <div className="mt-16 flex max-w-md items-center gap-4" data-testid="text-generating-stage">
          <span className="relative grid size-9 shrink-0 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/40" />
            <span className="relative grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <RefreshCw size={16} className="animate-spin" />
            </span>
          </span>
          <span key={active} className="animate-rise text-lg font-semibold">
            {generatingStages[active]}…
          </span>
        </div>
        <div className="mt-6 h-1.5 max-w-md overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/3 animate-[indeterminate_1.6s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 size={14} />{' '}
          {elapsedSeconds < 5
            ? 'Getting started…'
            : `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s so far — five complete looks take real, careful work.`}
        </p>
      </div>
    </div>
  );
}

