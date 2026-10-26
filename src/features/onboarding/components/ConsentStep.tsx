'use client';

import { useState, useEffect } from 'react';
import type { SkinTuneProfile } from '@/types';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { ShieldCheck, SlidersHorizontal, Check, RotateCcw, Sliders } from 'lucide-react';

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

const skinToneOptions = ['Fair', 'Light', 'Medium', 'Tan', 'Deep', 'Rich'];
const undertoneOptions = ['Warm', 'Neutral', 'Cool'];

export function AppearanceStep({
  profile,
  update,
  onNext,
  onPhoto,
  onBack,
  step = 6,
}: {
  profile: SkinTuneProfile;
  update?: (p: Partial<SkinTuneProfile>) => void;
  onNext: () => void;
  onPhoto: () => void;
  onBack: () => void;
  step?: number;
}) {
  const [showAdjust, setShowAdjust] = useState(false);

  const skinTone = profile.appearance.skinTone || 'Medium';
  const undertone = profile.appearance.undertone || 'Warm';
  const confidence = profile.appearance.confidence > 0 ? profile.appearance.confidence : 85;

  useEffect(() => {
    if ((!profile.appearance.skinTone || profile.appearance.confidence === 0) && update) {
      update({
        appearance: {
          skinTone,
          undertone,
          confidence,
          contrast: profile.appearance.contrast || 'Medium',
        },
      });
    }
  }, [profile.appearance.skinTone, profile.appearance.confidence, update, skinTone, undertone, confidence]);

  const setTone = (newTone: string) => {
    if (update) {
      update({
        appearance: {
          ...profile.appearance,
          skinTone: newTone,
          confidence: Math.max(profile.appearance.confidence || 85, 80),
        },
      });
    }
  };

  const setUnder = (newUndertone: string) => {
    if (update) {
      update({
        appearance: {
          ...profile.appearance,
          undertone: newUndertone,
          confidence: Math.max(profile.appearance.confidence || 85, 80),
        },
      });
    }
  };

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
              <p className="mt-1 font-serif text-xl" data-testid="appearance-skin-tone">{skinTone}</p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Undertone</p>
              <p className="mt-1 font-serif text-xl" data-testid="appearance-undertone">{undertone}</p>
            </div>
            <div className="rounded-xl bg-card p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-1 font-serif text-xl" data-testid="appearance-confidence">{confidence}%</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Analysis is based on your photo and is intended for styling recommendations only.
          </p>

          {/* Quick Tone & Undertone Adjustment */}
          {update && (
            <div className="mt-5 border-t border-accent/15 pt-4">
              <button
                type="button"
                onClick={() => setShowAdjust(!showAdjust)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Sliders size={13} />
                {showAdjust ? 'Hide adjustments' : 'Fine-tune tone or undertone'}
              </button>

              {showAdjust && (
                <div className="mt-3 space-y-3 rounded-xl bg-card/60 p-4 border border-border">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Select Skin Tone</p>
                    <div className="flex flex-wrap gap-1.5">
                      {skinToneOptions.map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          onClick={() => setTone(tone)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            skinTone === tone
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'bg-muted/60 text-foreground hover:bg-muted'
                          }`}
                        >
                          {tone}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Select Undertone</p>
                    <div className="flex flex-wrap gap-1.5">
                      {undertoneOptions.map((under) => (
                        <button
                          key={under}
                          type="button"
                          onClick={() => setUnder(under)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            undertone === under
                              ? 'bg-primary text-primary-foreground shadow-xs'
                              : 'bg-muted/60 text-foreground hover:bg-muted'
                          }`}
                        >
                          {under}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
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
