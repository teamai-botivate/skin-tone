'use client';

import type { ReactNode } from 'react';
import type { SkinTuneProfile } from '@/types';
import { Header } from './Header';

export function Shell({
  children,
  onBack,
  onSettings,
  step,
  total,
  profile,
}: {
  children: ReactNode;
  onBack?: () => void;
  onSettings: () => void;
  step?: number;
  total?: number;
  profile: SkinTuneProfile;
}) {
  return (
    <div className="noise min-h-[100dvh]">
      <Header
        onBack={onBack}
        onSettings={onSettings}
        step={step}
        total={total}
        name={profile.name}
      />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">{children}</main>
    </div>
  );
}

export function StepShell({
  profile,
  children,
  onBack,
  step,
  total = 11,
}: {
  profile: SkinTuneProfile;
  children: ReactNode;
  onBack: () => void;
  step: number;
  total?: number;
}) {
  return (
    <Shell profile={profile} onBack={onBack} onSettings={onBack} step={step} total={total}>
      <div className="mx-auto max-w-2xl">{children}</div>
    </Shell>
  );
}
