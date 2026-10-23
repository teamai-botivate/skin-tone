'use client';

import type { SkinTuneProfile } from '@/types';
import type { SelectOption } from '../data/options';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { ChoiceGrid } from './OptionCard';

export type SectionField =
  | { kind: 'single'; field: keyof SkinTuneProfile; label: string; hint?: string; options: SelectOption[]; required?: boolean; allowOther?: boolean; otherPlaceholder?: string; compact?: boolean }
  | { kind: 'multi'; field: keyof SkinTuneProfile; label: string; hint?: string; options: SelectOption[]; max?: number; required?: boolean; allowOther?: boolean; otherPlaceholder?: string; compact?: boolean }
  | { kind: 'text'; field: keyof SkinTuneProfile; label: string; hint?: string; placeholder: string; required?: boolean; quickTags?: string[] };

function isSectionFieldFilled(profile: SkinTuneProfile, def: SectionField): boolean {
  if (def.required === false) return true;
  // If field is 'style' and user provided custom styling notes, consider it filled
  if (def.field === 'style' && profile.customStyleNotes && profile.customStyleNotes.trim().length > 0) {
    return true;
  }
  const value = profile[def.field];
  if (def.kind === 'multi') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

export function SectionStep({
  profile,
  update,
  step,
  eyebrow,
  title,
  body,
  fields,
  onNext,
  onBack,
  continueLabel = 'Continue',
}: {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  step: number;
  eyebrow: string;
  title: string;
  body?: string;
  fields: SectionField[];
  onNext: () => void;
  onBack: () => void;
  continueLabel?: string;
}) {
  const allRequiredFilled = fields.every((def) => def.required === false || isSectionFieldFilled(profile, def));

  return (
    <StepShell profile={profile} onBack={onBack} step={step}>
      <Intro eyebrow={eyebrow} title={title} body={body}>
        <div className="space-y-5 sm:space-y-6">
          {fields.map((def) => {
            const optionalTag = def.required === false ? <span className="ml-1.5 font-normal normal-case text-muted-foreground text-xs">optional</span> : null;
            if (def.kind === 'text') {
              const value = (profile[def.field] as string) ?? '';
              const handleQuickTagClick = (tag: string) => {
                const cleanTag = tag.replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
                if (!value.trim()) {
                  update({ [def.field]: tag } as Partial<SkinTuneProfile>);
                } else if (value.includes(tag) || value.includes(cleanTag)) {
                  const next = value
                    .replace(tag, '')
                    .replace(cleanTag, '')
                    .replace(/;\s*;/g, ';')
                    .replace(/^;\s*|;\s*$/g, '')
                    .trim();
                  update({ [def.field]: next } as Partial<SkinTuneProfile>);
                } else {
                  const separator = value.trim().endsWith('.') || value.trim().endsWith(';') ? ' ' : '; ';
                  update({ [def.field]: `${value.trim()}${separator}${tag}` } as Partial<SkinTuneProfile>);
                }
              };

              return (
                <div key={def.field} className="rounded-2xl border border-primary/30 bg-card/80 p-4 sm:p-5 shadow-sm transition hover:border-primary/50">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span className="text-base">✍️</span>
                      <span>{def.label}</span>
                      {optionalTag}
                    </p>
                  </div>
                  {def.hint && <p className="mb-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">{def.hint}</p>}

                  {def.quickTags && def.quickTags.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {def.quickTags.map((tag) => {
                        const cleanTag = tag.replace(/^[^\w\s\u0900-\u097F]+/, '').trim();
                        const isSelected = value.includes(tag) || value.includes(cleanTag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleQuickTagClick(tag)}
                            className={`rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-medium transition ${
                              isSelected
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/60'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <textarea
                    value={value}
                    onChange={(e) => update({ [def.field]: e.target.value } as Partial<SkinTuneProfile>)}
                    data-testid={`textarea-${String(def.field)}`}
                    rows={3}
                    placeholder={def.placeholder}
                    className="focus-ring w-full resize-none rounded-xl border border-border/80 bg-background/90 p-3.5 text-xs sm:text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60 transition focus:border-primary shadow-inner"
                  />
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>💡 Tap any style prompt or write freely in your own words.</span>
                    {value.length > 0 && <span>{value.length} chars</span>}
                  </div>
                </div>
              );
            }
            if (def.kind === 'single') {
              const value = profile[def.field] as string;
              return (
                <div key={def.field}>
                  <p className="mb-2.5 text-sm font-bold">{def.label}{optionalTag}</p>
                  {def.hint && <p className="mb-3 -mt-1 text-xs sm:text-sm text-muted-foreground">{def.hint}</p>}
                  <ChoiceGrid
                    options={def.options}
                    value={value}
                    toggle={(v) => update({ [def.field]: v } as Partial<SkinTuneProfile>)}
                    allowOther={def.allowOther ?? true}
                    otherPlaceholder={def.otherPlaceholder}
                    compact={def.compact ?? (def.options.length > 6)}
                  />
                </div>
              );
            }
            const values = (profile[def.field] as string[]) || [];
            const toggle = (v: string) => {
              const atMax = def.max !== undefined && values.length >= def.max && !values.includes(v);
              if (atMax) return;
              update({ [def.field]: values.includes(v) ? values.filter((item) => item !== v) : [...values, v] } as Partial<SkinTuneProfile>);
            };
            const setValues = (newVals: string[]) => {
              update({ [def.field]: newVals } as Partial<SkinTuneProfile>);
            };
            return (
              <div key={def.field}>
                <p className="mb-2.5 text-sm font-bold">
                  {def.label}{optionalTag}
                  {def.max ? <span className="ml-1.5 font-normal normal-case text-muted-foreground text-xs">choose up to {def.max}</span> : null}
                </p>
                {def.hint && <p className="mb-3 -mt-1 text-xs sm:text-sm text-muted-foreground">{def.hint}</p>}
                <ChoiceGrid
                  multi
                  options={def.options}
                  value={values}
                  toggle={toggle}
                  onMultiChange={setValues}
                  allowOther={def.allowOther ?? true}
                  otherPlaceholder={def.otherPlaceholder}
                  max={def.max}
                  compact={def.compact ?? (def.options.length > 6)}
                />
              </div>
            );
          })}
        </div>
        <FooterActions onBack={onBack} onContinue={onNext} disabled={!allRequiredFilled} label={continueLabel} />
      </Intro>
    </StepShell>
  );
}
