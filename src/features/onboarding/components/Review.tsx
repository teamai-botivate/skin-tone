'use client';

import type { SkinTuneProfile } from '@/types';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { Pencil } from 'lucide-react';

export function Review({
  profile,
  onEdit,
  onSave,
  onBack,
}: {
  profile: SkinTuneProfile;
  onEdit: (s: any) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const rows: { label: string; value: string; target: string }[] = [
    {
      label: 'Appearance',
      value: `${profile.appearance.skinTone} · ${profile.appearance.undertone} undertone · ${profile.appearance.confidence}% confidence`,
      target: 'appearance',
    },
    {
      label: 'Selfies',
      value: `${profile.photoUrl ? 'Face selfie' : ''}${profile.photoUrl && profile.bodyPhotoUrl ? ' · ' : ''}${profile.bodyPhotoUrl ? 'Full body selfie' : ''}` || 'Selfies on device',
      target: 'photo',
    },
    { label: 'Profile', value: `${profile.pronouns} · ${profile.ageGroup}`, target: 'profile' },
    {
      label: 'Style direction',
      value: profile.style.length ? profile.style.join(', ') : 'Personalized style',
      target: 'body-style',
    },
    {
      label: 'Custom styling',
      value: profile.customStyleNotes ? `"${profile.customStyleNotes}"` : 'Optional / not specified',
      target: 'custom-style',
    },
    {
      label: 'Colours & moment',
      value: `Loves ${profile.colorsLove.join(', ')}${profile.colorsAvoid.length ? ` · avoids ${profile.colorsAvoid.join(', ')}` : ''} · ${profile.occasion}`,
      target: 'colors-occasion',
    },
    {
      label: 'Budget',
      value: profile.budget || 'Flexible',
      target: 'colors-occasion',
    },
  ];

  return (
    <StepShell profile={profile} onBack={onBack} step={10} total={10}>
      <Intro
        eyebrow="10 / your edit, at a glance"
        title={`This sounds like ${profile.name}.`}
        body="Look it over, make any changes, then we'll make five complete looks around it."
      >
        <div className="divide-y divide-border overflow-hidden rounded-[1.5rem] border border-border bg-card">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">{row.label}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed">{row.value}</p>
              </div>
              <button
                type="button"
                onClick={() => onEdit(row.target)}
                data-testid={`button-edit-${row.label.toLowerCase().replace(' ', '-')}`}
                className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-primary hover:bg-secondary"
              >
                <Pencil size={13} /> Edit
              </button>
            </div>
          ))}
        </div>
        <FooterActions onBack={onBack} onContinue={onSave} label="✨ Make my five looks" />
      </Intro>
    </StepShell>
  );
}
