'use client';

import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { Header } from '@/components/common/Header';
import { LookVisual } from '@/features/recommendations/components/LookVisual';
import { homeOccasionShortcuts } from '@/features/onboarding/data/options';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';

export function Home({
  profile,
  savedLooks,
  generatedLooks,
  onNew,
  onResults,
  onSettings,
  onLook,
  onQuickStart,
  onDiscover,
}: {
  profile: SkinTuneProfile;
  savedLooks: string[];
  generatedLooks: LookRecommendation[];
  onNew: () => void;
  onResults: () => void;
  onSettings: () => void;
  onLook: (id: string) => void;
  onQuickStart: (occasion: string) => void;
  onDiscover: () => void;
}) {
  return (
    <div className="noise min-h-[100dvh]">
      <Header onSettings={onSettings} name={profile.name} />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div className="animate-rise">
            <p className="text-xs font-bold uppercase tracking-[.22em] text-primary">
              How can LetStyle style you today?
            </p>
            <h1 className="mt-4 max-w-2xl font-serif text-[clamp(3rem,7vw,6.2rem)] leading-[.88] tracking-[-.05em]">
              Good to see you,<br />
              <em className="text-primary">{profile.name}.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Pick a moment to get dressed for, or pick up where you left off.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {homeOccasionShortcuts.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  onClick={() => onQuickStart(item.label)}
                  data-testid={`button-quickstart-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:border-primary/50"
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onResults}
                data-testid="button-view-looks"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-lg"
              >
                View your five looks <ArrowRight size={16} />
              </button>
              <button
                type="button"
                onClick={onNew}
                data-testid="button-new-edit"
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-bold hover:border-primary/50"
              >
                <RefreshCw size={16} /> New edit
              </button>
              <button
                type="button"
                onClick={onDiscover}
                data-testid="button-discover-guide"
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-bold hover:border-primary/50"
              >
                <Sparkles size={16} /> Styling Guide
              </button>
            </div>
          </div>
          <div className="soft-grid relative overflow-hidden rounded-[1.7rem] border border-border bg-secondary/60 p-7">
            <div className="absolute -right-14 -top-14 size-48 rounded-full bg-primary/15 blur-2xl" />
            <p className="relative text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">
              Your signature direction
            </p>
            <h2 className="relative mt-3 font-serif text-3xl">Rich, considered, quietly luxe.</h2>
            <div className="relative mt-7 flex items-end gap-2">
              <div className="h-20 w-12 rounded-t-full bg-[#c9a35c]" />
              <div className="h-28 w-12 rounded-t-full bg-[#1c1917]" />
              <div className="h-16 w-12 rounded-t-full bg-[#e8d5a3]" />
              <div className="h-24 w-12 rounded-t-full bg-[#8a6d3f]" />
            </div>
            <p className="relative mt-6 text-sm leading-relaxed text-muted-foreground">
              Your saved palette leans into depth and gold, with room for one clear surprise.
            </p>
          </div>
        </div>
        {savedLooks.length > 0 && (
          <section className="mt-20">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Saved for later</p>
                <h2 className="mt-2 font-serif text-3xl">Your keepers</h2>
              </div>
              <button
                type="button"
                onClick={onResults}
                data-testid="button-see-all-saved"
                className="focus-ring text-sm font-bold text-primary"
              >
                See all <ArrowRight className="ml-1 inline" size={15} />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedLooks.map((id) => {
                const look = generatedLooks.find((item) => item.id === id);
                return (
                  look && (
                    <button
                      type="button"
                      key={id}
                      onClick={() => onLook(id)}
                      data-testid={`card-saved-look-${id}`}
                      className="focus-ring rounded-[1.3rem] border border-border bg-card p-2 text-left transition hover:-translate-y-1"
                    >
                      <LookVisual look={look} />
                      <p className="px-3 pb-2 pt-3 font-serif text-xl">{look.title}</p>
                    </button>
                  )
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
