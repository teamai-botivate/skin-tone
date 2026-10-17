'use client';

import type { SkinTuneProfile } from '@/types';
import type { SelectOption } from '../data/options';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { ChoiceGrid } from './OptionCard';

export type SectionField =
  | { kind: 'single'; field: keyof SkinTuneProfile; label: string; hint?: string; options: SelectOption[]; required?: boolean; allowOther?: boolean; otherPlaceholder?: string }
  | { kind: 'multi'; field: keyof SkinTuneProfile; label: string; hint?: string; options: SelectOption[]; max?: number; required?: boolean; allowOther?: boolean; otherPlaceholder?: string }
  | { kind: 'text'; field: keyof SkinTuneProfile; label: string; hint?: string; placeholder: string; required?: boolean };

function isSectionFieldFilled(profile: SkinTuneProfile, def: SectionField): boolean {
  if (def.required === false) return true;
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
        <div className="space-y-9">
          {fields.map((def) => {
            const optionalTag = def.required === false ? <span className="ml-1.5 font-normal normal-case text-muted-foreground">optional</span> : null;
            if (def.kind === 'text') {
              const value = (profile[def.field] as string) ?? '';
              return (
                <div key={def.field}>
                  <p className="mb-2 text-sm font-bold">{def.label}{optionalTag}</p>
                  {def.hint && <p className="mb-3 text-sm text-muted-foreground">{def.hint}</p>}
                  <textarea
                    value={value}
                    onChange={(e) => update({ [def.field]: e.target.value } as Partial<SkinTuneProfile>)}
                    data-testid={`textarea-${String(def.field)}`}
                    rows={4}
                    placeholder={def.placeholder}
                    className="focus-ring w-full resize-none rounded-2xl border border-border bg-card p-4 leading-relaxed outline-none placeholder:text-muted-foreground/55"
                  />
                </div>
              );
            }
            if (def.kind === 'single') {
              const value = profile[def.field] as string;
              return (
                <div key={def.field}>
                  <p className="mb-3 text-sm font-bold">{def.label}{optionalTag}</p>
                  {def.hint && <p className="mb-3 -mt-2 text-sm text-muted-foreground">{def.hint}</p>}
                  <ChoiceGrid
                    options={def.options}
                    value={value}
                    toggle={(v) => update({ [def.field]: v } as Partial<SkinTuneProfile>)}
                    allowOther={def.allowOther ?? true}
                    otherPlaceholder={def.otherPlaceholder}
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
                <p className="mb-3 text-sm font-bold">
                  {def.label}{optionalTag}
                  {def.max ? <span className="ml-1.5 font-normal normal-case text-muted-foreground">choose up to {def.max}</span> : null}
                </p>
                {def.hint && <p className="mb-3 -mt-2 text-sm text-muted-foreground">{def.hint}</p>}
                <ChoiceGrid
                  multi
                  options={def.options}
                  value={values}
                  toggle={toggle}
                  onMultiChange={setValues}
                  allowOther={def.allowOther ?? true}
                  otherPlaceholder={def.otherPlaceholder}
                  max={def.max}
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
