'use client';

import type { SkinTuneProfile } from '@/types';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { RotateCcw } from 'lucide-react';

const defaultQuickTags = [
  '👗 Latest Indo-Western look',
  '✨ Minimal silver jewellery',
  '🥻 Latest traditional look',
  '🧥 Tailored power suit',
  '🌸 Soft pastel ethnic',
  '🌿 Comfortable breathable fabrics',
  '💎 Statement jewellery',
  '⚡ Modern sleek cuts',
];

export function CustomStyleStep({
  profile,
  update,
  onNext,
  onBack,
  step = 8,
  total = 10,
  continueLabel = 'Continue',
}: {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  onNext: () => void;
  onBack: () => void;
  step?: number;
  total?: number;
  continueLabel?: string;
}) {
  const value = profile.customStyleNotes ?? '';

  const handleQuickTagClick = (tag: string) => {
    const cleanTag = tag.replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
    if (!value.trim()) {
      update({ customStyleNotes: tag });
    } else if (value.includes(tag) || value.includes(cleanTag)) {
      const next = value
        .replace(tag, '')
        .replace(cleanTag, '')
        .replace(/;\s*;/g, ';')
        .replace(/^;\s*|;\s*$/g, '')
        .trim();
      update({ customStyleNotes: next });
    } else {
      const separator = value.trim().endsWith('.') || value.trim().endsWith(';') ? ' ' : '; ';
      update({ customStyleNotes: `${value.trim()}${separator}${tag}` });
    }
  };

  return (
    <StepShell profile={profile} onBack={onBack} step={step} total={total}>
      <Intro
        eyebrow="08 / your vision"
        title="How would you like us to style you?"
        body="Tell us in your own words — describe the exact outfit, silhouette, cuts, or aesthetic you want. This step is optional."
      >
        <div className="rounded-3xl border border-primary/25 bg-card/90 p-5 sm:p-7 shadow-sm transition">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="text-base">✍️</span>
              <span>Describe your dream look</span>
              <span className="ml-1.5 font-normal normal-case text-muted-foreground text-xs">optional</span>
            </p>
            {value.trim().length > 0 && (
              <button
                type="button"
                onClick={() => update({ customStyleNotes: '' })}
                className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} /> Clear
              </button>
            )}
          </div>

          <p className="mb-3.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Tap any style prompt below or write freely to guide your silhouette, outfit, and accessories:
          </p>

          <div className="mb-4 flex flex-wrap gap-2">
            {defaultQuickTags.map((tag) => {
              const cleanTag = tag.replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
              const isSelected = value.includes(tag) || value.includes(cleanTag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleQuickTagClick(tag)}
                  className={`rounded-full px-3 py-1.5 text-xs sm:text-[13px] font-medium transition cursor-pointer ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary'
                      : 'bg-secondary/70 text-secondary-foreground hover:bg-secondary border border-border/70 hover:border-primary/40'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <textarea
            value={value}
            onChange={(e) => update({ customStyleNotes: e.target.value })}
            data-testid="textarea-customStyleNotes"
            rows={5}
            placeholder="e.g. Latest Indo-Western look with lightweight flare and minimal silver jewellery; or a sharp navy tailored power suit with pointed pumps..."
            className="focus-ring w-full resize-none rounded-2xl border border-border/80 bg-background/90 p-4 text-xs sm:text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 transition focus:border-primary shadow-inner"
          />

          <div className="mt-2.5 flex items-center justify-between text-[11px] sm:text-xs text-muted-foreground">
            <span>💡 Tap any style prompt or write freely in your own words.</span>
            {value.length > 0 && <span>{value.length} chars</span>}
          </div>
        </div>

        <FooterActions onBack={onBack} onContinue={onNext} disabled={false} label={continueLabel} />
      </Intro>
    </StepShell>
  );
}
