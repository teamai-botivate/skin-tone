'use client';

import type { SkinTuneProfile } from '@/types';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';

export function NameStep({
  profile,
  update,
  onNext,
  onBack,
}: {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell profile={profile} onBack={onBack} step={1}>
      <Intro
        eyebrow="01 / welcome in"
        title="First, what should we call you?"
        body="This is your space. Use your real name, a nickname, or simply a word that feels like you."
      >
        <label className="block max-w-md">
          <span className="sr-only">Your name</span>
          <input
            autoFocus
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            data-testid="input-name"
            placeholder="Your name"
            className="focus-ring w-full rounded-2xl border border-border bg-card px-5 py-4 text-xl outline-none placeholder:text-muted-foreground/55"
          />
        </label>
        <FooterActions onBack={onBack} onContinue={onNext} disabled={!profile.name.trim()} />
      </Intro>
    </StepShell>
  );
}

export function HeightStep({
  profile,
  update,
  step,
  eyebrow,
  title,
  body,
  onNext,
  onBack,
}: {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  step: number;
  eyebrow: string;
  title: string;
  body?: string;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <StepShell profile={profile} onBack={onBack} step={step}>
      <Intro eyebrow={eyebrow} title={title} body={body}>
        <label className="block max-w-md">
          <span className="sr-only">Height</span>
          <input
            value={profile.height}
            onChange={(e) => update({ height: e.target.value })}
            data-testid="input-height"
            placeholder="e.g. 5' 7&quot; (optional)"
            className="focus-ring w-full rounded-2xl border border-border bg-card px-5 py-4 text-lg outline-none placeholder:text-muted-foreground/55"
          />
        </label>
        <p className="mt-3 text-xs text-muted-foreground">Optional — helps us tune proportion suggestions.</p>
        <FooterActions onBack={onBack} onContinue={onNext} />
      </Intro>
    </StepShell>
  );
}
