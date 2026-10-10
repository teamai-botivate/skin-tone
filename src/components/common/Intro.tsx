'use client';

import type { ReactNode } from 'react';

export function Intro({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  children: ReactNode;
}) {
  return (
    <div className="animate-rise">
      <p className="mb-4 text-xs font-bold uppercase tracking-[.2em] text-primary">{eyebrow}</p>
      <h1 className="max-w-2xl font-serif text-[clamp(2.25rem,6vw,4.6rem)] leading-[.98] tracking-[-.045em]">
        {title}
      </h1>
      {body && (
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {body}
        </p>
      )}
      <div className="mt-8">{children}</div>
    </div>
  );
}
