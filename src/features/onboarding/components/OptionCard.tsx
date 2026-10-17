'use client';

import { Check } from 'lucide-react';
import type { SelectOption } from '../data/options';

export function OptionCard({
  label,
  description,
  icon,
  color,
  selected,
  onClick,
  disabled = false,
}: {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={`option-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
      aria-pressed={selected}
      className={`focus-ring group relative flex min-h-[76px] w-full items-center gap-4 rounded-[1.15rem] border p-4 text-left transition duration-200 ${
        selected
          ? 'border-primary bg-primary/8 shadow-[0_8px_24px_hsl(var(--primary)/.12)]'
          : 'border-border bg-card hover:-translate-y-0.5 hover:border-primary/45'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {color ? (
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-full border border-black/15 shadow-md transition-transform duration-200 ${
            selected ? 'ring-2 ring-primary ring-offset-2 scale-105' : 'hover:scale-102'
          }`}
          style={{ background: color }}
          aria-hidden
        >
          {selected && (
            <Check size={18} strokeWidth={3.5} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]" />
          )}
        </span>
      ) : icon ? (
        <span
          className={`grid size-11 shrink-0 place-items-center rounded-full text-xl ${
            selected ? 'bg-primary text-primary-foreground' : 'bg-secondary'
          }`}
          aria-hidden
        >
          {icon}
        </span>
      ) : (
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full ${
            selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
          }`}
          aria-hidden
        >
          <Check size={16} strokeWidth={3} className={selected ? '' : 'opacity-0'} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {description && (
          <span className="mt-1 block text-sm leading-snug text-muted-foreground">{description}</span>
        )}
      </span>
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-full border ${
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'
        }`}
      >
        <Check size={14} strokeWidth={3} />
      </span>
    </button>
  );
}

export function ChoiceGrid({
  options,
  value,
  toggle,
  multi = false,
  allowOther = true,
  otherPlaceholder,
  max,
  onMultiChange,
}: {
  options: SelectOption[];
  value: string | string[];
  toggle: (label: string) => void;
  onMultiChange?: (values: string[]) => void;
  multi?: boolean;
  allowOther?: boolean;
  otherPlaceholder?: string;
  max?: number;
}) {
  // Check if "Other" is currently selected
  const otherItem = multi
    ? (value as string[]).find(
        (v) => !options.some((o) => o.label === v) || v === 'Other' || v.startsWith('Other: '),
      )
    : !options.some((o) => o.label === value) && Boolean(value)
    ? (value as string)
    : undefined;

  const isOtherSelected = Boolean(otherItem);
  const otherText = otherItem
    ? otherItem.startsWith('Other: ')
      ? otherItem.slice(7)
      : otherItem === 'Other'
      ? ''
      : otherItem
    : '';

  const handleToggleOther = () => {
    if (multi) {
      const values = (value as string[]) || [];
      if (isOtherSelected) {
        // Deselect Other
        if (onMultiChange) {
          onMultiChange(values.filter((v) => v !== otherItem));
        } else {
          toggle(otherItem!);
        }
      } else {
        // Select Other
        if (max !== undefined && values.length >= max) return;
        if (onMultiChange) {
          onMultiChange([...values, 'Other']);
        } else {
          toggle('Other');
        }
      }
    } else {
      if (isOtherSelected) {
        // Already selected
      } else {
        toggle('Other');
      }
    }
  };

  const handleOtherTextChange = (newText: string) => {
    const formatted = newText.trim() ? `Other: ${newText}` : 'Other';
    if (multi) {
      const values = (value as string[]) || [];
      const nextValues = isOtherSelected
        ? values.map((v) => (v === otherItem ? formatted : v))
        : [...values, formatted];
      if (onMultiChange) {
        onMultiChange(nextValues);
      } else {
        toggle(formatted);
      }
    } else {
      toggle(formatted);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((item) => {
        const selected = multi ? (value as string[]).includes(item.label) : value === item.label;
        return (
          <OptionCard
            key={item.label}
            label={item.label}
            description={item.description}
            icon={item.icon}
            color={item.color}
            selected={selected}
            onClick={() => toggle(item.label)}
          />
        );
      })}

      {allowOther && (
        <OptionCard
          key="__other__"
          label="Other"
          description={
            isOtherSelected && otherText
              ? `Custom: ${otherText}`
              : 'Type your own preference'
          }
          icon="✏️"
          selected={isOtherSelected}
          onClick={handleToggleOther}
        />
      )}

      {allowOther && isOtherSelected && (
        <div className="sm:col-span-2 mt-1 animate-rise">
          <div className="rounded-2xl border border-primary/40 bg-[#FAF5EE] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-[#795548]">
              <span>✏️ Specify your preference:</span>
            </div>
            <input
              type="text"
              autoFocus
              value={otherText}
              onChange={(e) => handleOtherTextChange(e.target.value)}
              data-testid="input-other-custom"
              placeholder={otherPlaceholder || 'Type your custom preference here...'}
              className="focus-ring w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 shadow-inner"
            />
          </div>
        </div>
      )}
    </div>
  );
}
