'use client';

import { useEffect } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { Shell } from '@/components/common/Shell';
import { LookVisual } from './LookVisual';
import { lookCategoryBadges } from '@/features/onboarding/data/options';
import { getProductRecommendations } from '@/features/shopping/services/product-recommendations';
import { SlidersHorizontal, ChevronRight, ShoppingBag, Check, Heart, Info, Pencil } from 'lucide-react';

export function Results({
  profile,
  looks: resultLooks,
  savedLooks,
  onSave,
  onLook,
  onFeedback,
  onEdit,
  onBack,
}: {
  profile: SkinTuneProfile;
  looks: LookRecommendation[];
  savedLooks: string[];
  onSave: (id: string) => void;
  onLook: (id: string) => void;
  onFeedback: () => void;
  onEdit?: () => void;
  onBack: () => void;
}) {
  useEffect(() => {
    // Prefetch products in background for instant "Recreate this look" display
    if (resultLooks && resultLooks.length > 0) {
      getProductRecommendations(resultLooks[0], profile).catch(() => {});
      if (resultLooks[1]) {
        const timer = setTimeout(() => {
          getProductRecommendations(resultLooks[1], profile).catch(() => {});
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [resultLooks, profile]);

  return (
    <Shell profile={profile} onBack={onBack} onSettings={onBack}>
      <div className="animate-rise">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">✨ Your 5 Best Looks</p>
            <h1 className="mt-3 font-serif text-[clamp(2.8rem,6vw,5.4rem)] leading-[.9] tracking-[-.05em]">
              A wardrobe of<br />
              <em className="text-primary">possibilities.</em>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                data-testid="button-edit-styling"
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-bold hover:border-primary/50"
              >
                <Pencil size={16} /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={onFeedback}
              data-testid="button-request-changes"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-sm font-bold hover:border-primary/50"
            >
              <SlidersHorizontal size={16} /> Change the direction
            </button>
          </div>
        </div>
        <p className="mt-6 max-w-xl text-muted-foreground">
          Built for {profile.occasion.toLowerCase() || 'your moment'} with a{' '}
          {profile.impression.join(' and ').toLowerCase() || 'considered'} energy. Nothing here is a rule — just
          five places to begin.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {resultLooks.map((look, index) => {
            const badge = lookCategoryBadges[index] ?? lookCategoryBadges[lookCategoryBadges.length - 1];
            return (
              <article
                key={look.id}
                className={`group rounded-[1.45rem] border border-border bg-card p-2 shadow-[0_8px_30px_hsl(var(--foreground)/.04)] ${
                  index === 0 ? 'md:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => onLook(look.id)}
                  data-testid={`card-look-${look.id}`}
                  className="focus-ring block w-full text-left"
                >
                  <LookVisual look={look} large={index === 0} />
                  <div className="p-4 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[.15em] text-primary">
                          {badge.icon} {badge.label}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl">{look.title}</h2>
                      </div>
                      <ChevronRight
                        className="mt-2 text-muted-foreground transition group-hover:translate-x-1"
                        size={20}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{look.note}</p>
                    <dl className="mt-5 grid gap-x-4 gap-y-3 border-t border-border/70 pt-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                          Outfit
                        </dt>
                        <dd className="mt-1 text-sm leading-snug">{look.outfit}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                          Jewellery
                        </dt>
                        <dd className="mt-1 text-sm leading-snug">{look.jewellery}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                          Hairstyle
                        </dt>
                        <dd className="mt-1 text-sm leading-snug">{look.hairstyle}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">
                          Makeup
                        </dt>
                        <dd className="mt-1 text-sm leading-snug">{look.makeup}</dd>
                      </div>
                    </dl>
                  </div>
                </button>
                <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="flex gap-1.5">
                      {look.palette.map((color, idx) => (
                        <i
                          key={`${color}-${idx}`}
                          className="size-4 rounded-full border border-card shadow-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {look.confidence}% confidence
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onLook(look.id)}
                      data-testid={`button-shop-${look.id}`}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground"
                    >
                      <ShoppingBag size={13} /> Shop look
                    </button>
                    <button
                      type="button"
                      onClick={() => onSave(look.id)}
                      data-testid={`button-save-${look.id}`}
                      className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                        savedLooks.includes(look.id)
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {savedLooks.includes(look.id) ? <Check size={14} /> : <Heart size={14} />}{' '}
                      {savedLooks.includes(look.id) ? 'Saved' : 'Save'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-10 rounded-2xl border border-border bg-secondary/55 p-5 text-sm text-muted-foreground">
          <div className="flex items-start gap-3">
            <Info size={17} className="mt-0.5 shrink-0 text-primary" />
            <p>
              Style visualisation — actual fit, fabric fall and real-world colour may vary. These looks are
              starting points shaped around your answers; keep what feels like you, skip what doesn’t, and tell
              us what to change.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
