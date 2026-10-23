'use client';

import type { SkinTuneProfile } from '@/types';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { ShieldCheck, SlidersHorizontal, Check, RotateCcw } from 'lucide-react';

export function ConsentStep({
  profile,
  onNext,
  onBack,
  step = 4,
}: {
  profile: SkinTuneProfile;
  onNext: () => void;
  onBack: () => void;
  step?: number;
}) {
  return (
    <StepShell profile={profile} onBack={onBack} step={step} total={10}>
      <Intro
        eyebrow="04 / your choice"
        title="A portrait can make color guidance more precise."
        body="If you choose to share one, we’ll look at visible styling cues like light, contrast, and framing. LetStyle does not identify you, diagnose anything, or judge attractiveness."
      >
        <div className="space-y-3">
          <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <ShieldCheck className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="font-semibold">You stay in control</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your photo stays in this browser prototype. Delete it any time from Privacy, plainly.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <SlidersHorizontal className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">Guidance, not a verdict</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Every suggestion is optional. Your taste and comfort come first. No medical or diagnostic claims are made.
              </p>
            </div>
          </div>
        </div>
        <FooterActions onBack={onBack} onContinue={onNext} label="I’m comfortable continuing" />
      </Intro>
    </StepShell>
  );
}

export function AppearanceStep({
  profile,
  onNext,
  onPhoto,
  onBack,
  step = 6,
}: {
  profile: SkinTuneProfile;
  onNext: () => void;
  onPhoto: () => void;
  onBack: () => void;
  step?: number;
}) {
  return (
    <StepShell profile={profile} onBack={onBack} step={step} total={10}>
      <Intro
        eyebrow="06 / what we noticed"
        title="Your appearance profile is ready."
        body="Think of this as a creative starting point, not a label. We’ll use it to build harmony, then let your preferences lead."
      >
        <div className="rounded-[1.5rem] border border-accent/25 bg-accent/7 p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground">
              <Check size={20} />
            </div>
            <div>
              <p className="font-semibold">Your appearance profile is ready</p>
              <p className="text-sm text-muted-foreground">A styling read based on your photo, not a verdict.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Skin tone</p>
              <p className="mt-1 font-serif text-xl">{profile.appearance.skinTone}</p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Undertone</p>
              <p className="mt-1 font-serif text-xl">{profile.appearance.undertone}</p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-1 font-serif text-xl">{profile.appearance.confidence}%</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Analysis is based on your photo and is intended for styling recommendations only.
          </p>
        </div>
        <button
          type="button"
          onClick={onPhoto}
          data-testid="button-change-photo"
          className="focus-ring mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <RotateCcw size={15} /> Use a different photo
        </button>
        <FooterActions onBack={onBack} onContinue={onNext} />
      </Intro>
    </StepShell>
  );
}
