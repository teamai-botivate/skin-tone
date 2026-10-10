'use client';

import type { SkinTuneProfile } from '@/types';
import type { SelectOption } from '../data/options';
import { StepShell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { ChoiceGrid } from './OptionCard';

export type StepBaseProps = {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  step: number;
  eyebrow: string;
  title: string;
  body?: string;
  onNext: () => void;
  onBack: () => void;
};

export function SingleChoiceStep({
  profile,
  update,
  field,
  step,
  eyebrow,
  title,
  body,
  options,
  onNext,
  onBack,
}: StepBaseProps & {
  field: keyof SkinTuneProfile;
  options: SelectOption[];
}) {
  const value = profile[field] as string;

  const choose = (v: string) => {
    update({ [field]: v } as Partial<SkinTuneProfile>);
    window.setTimeout(onNext, 320);
  };

  return (
    <StepShell profile={profile} onBack={onBack} step={step}>
      <Intro eyebrow={eyebrow} title={title} body={body}>
        <ChoiceGrid options={options} value={value} toggle={choose} />
        <FooterActions onBack={onBack} onContinue={onNext} disabled={!value} />
      </Intro>
    </StepShell>
  );
}

export function MultiChoiceStep({
  profile,
  update,
  field,
  step,
  eyebrow,
  title,
  body,
  options,
  onNext,
  onBack,
  max,
  optional = false,
}: StepBaseProps & {
  field: keyof SkinTuneProfile;
  options: SelectOption[];
  max?: number;
  optional?: boolean;
}) {
  const values = (profile[field] as string[]) || [];
  const toggle = (v: string) => {
    const atMax = max !== undefined && values.length >= max && !values.includes(v);
    if (atMax) return;
    update({ [field]: values.includes(v) ? values.filter((item) => item !== v) : [...values, v] } as Partial<SkinTuneProfile>);
  };

  return (
    <StepShell profile={profile} onBack={onBack} step={step}>
      <Intro eyebrow={eyebrow} title={title} body={max ? `${body ?? ''} Choose up to ${max}.`.trim() : body}>
        <ChoiceGrid multi options={options} value={values} toggle={toggle} />
        <FooterActions onBack={onBack} onContinue={onNext} disabled={!optional && values.length === 0} />
      </Intro>
    </StepShell>
  );
}
