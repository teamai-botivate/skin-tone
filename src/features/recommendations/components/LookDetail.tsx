'use client';

import { useState } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { Header } from '@/components/common/Header';
import { LookVisual, hasRealImage } from './LookVisual';
import { refineLookImage, generateOneLookImage } from '../services/image-generation';
import { ShopLookSection } from '@/features/shopping';
import { useAuth } from '@/features/auth';
import { Download, Wand2, RefreshCw, Check, Save, X, Sparkles, Coins } from 'lucide-react';

function downloadLookImage(imageUrl: string, title: string) {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = `letstyle-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function LookDetail({
  look,
  profile,
  saved,
  onSave,
  onBack,
  onFeedback,
  onRefined,
}: {
  look: LookRecommendation;
  profile: SkinTuneProfile;
  saved: boolean;
  onSave: () => void;
  onBack: () => void;
  onFeedback: () => void;
  onRefined: (look: LookRecommendation) => void;
}) {
  const { user, openAuthModal, refreshUser } = useAuth();
  const [showRetry, setShowRetry] = useState(false);
  const [customization, setCustomization] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState('');
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [generateVisualError, setGenerateVisualError] = useState('');
  const hasImage = hasRealImage(look.imageUrl);

  const submitGenerateVisual = async () => {
    if (!user) {
      openAuthModal('signup', () => {
        submitGenerateVisual();
      });
      return;
    }
    setGeneratingVisual(true);
    setGenerateVisualError('');
    try {
      const { photoUrl, ...profileForRequest } = profile;
      const updated = await generateOneLookImage(
        look,
        profileForRequest,
        { occasion: profile.occasion, details: profile.customStyleNotes || '' },
        photoUrl || '',
        [],
      );
      refreshUser();
      if (hasRealImage(updated.imageUrl)) {
        onRefined(updated);
      } else {
        setGenerateVisualError('Image generation timed out or could not complete. Please try again.');
      }
    } catch (err) {
      refreshUser();
      setGenerateVisualError(err instanceof Error ? err.message : 'Visual generation failed. Please try again.');
    } finally {
      setGeneratingVisual(false);
    }
  };

  const submitRetry = async () => {
    if (!customization.trim()) return;
    if (!user) {
      openAuthModal('signup', () => {
        submitRetry();
      });
      return;
    }
    setRefining(true);
    setRefineError('');
    try {
      const refined = await refineLookImage(
        look,
        profile,
        { occasion: profile.occasion, details: '' },
        customization.trim(),
      );
      refreshUser();
      onRefined(refined);
      setShowRetry(false);
      setCustomization('');
    } catch (err) {
      refreshUser();
      setRefineError(err instanceof Error ? err.message : 'That retry didn’t go through. Please try again.');
      console.warn('Refine failed:', err);
    } finally {
      setRefining(false);
    }
  };


  const pronouns = (profile.pronouns || '').toLowerCase();
  const age = (profile.ageGroup || '').toLowerCase();
  const isChild =
    age.includes('kids') ||
    age.includes('0–12') ||
    age.includes('0-12') ||
    age.includes('child') ||
    pronouns.includes('kids') ||
    pronouns.includes('children');
  const isWoman = !isChild && (pronouns.includes('women') || pronouns.includes('female') || pronouns.includes('she/her'));
  const isMan = !isChild && !isWoman && (pronouns.includes('men') || pronouns.includes('male') || pronouns.includes('he/him'));

  return (
    <div className="noise min-h-[100dvh]">
      <Header onBack={onBack} onSettings={onBack} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
          <div>
            <LookVisual look={look} large />
            {hasImage ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadLookImage(look.imageUrl, look.title)}
                  data-testid="button-download-image"
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold hover:border-primary/50"
                >
                  <Download size={15} /> Download image
                </button>
                <button
                  type="button"
                  onClick={() => setShowRetry((v) => !v)}
                  data-testid="button-retry-look"
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold hover:border-primary/50"
                >
                  <Wand2 size={15} /> Retry with changes
                </button>
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitGenerateVisual}
                    disabled={generatingVisual}
                    data-testid="button-generate-visual"
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
                  >
                    {generatingVisual ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {generatingVisual ? 'Generating AI Visual…' : 'Generate AI Visual'}
                  </button>
                </div>
                {generateVisualError && (
                  <p className="text-xs font-semibold text-destructive">{generateVisualError}</p>
                )}
              </div>
            )}

            {showRetry && (
              <div
                className="mt-4 animate-rise rounded-2xl border border-primary/25 bg-primary/5 p-5"
                data-testid="panel-retry-customization"
              >
                <p className="text-sm font-bold">What should we change about this image?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  We'll keep the same look and the same you, just apply this correction — e.g. "make the sleeves
                  longer" or "different shoe colour".
                </p>
                <textarea
                  value={customization}
                  onChange={(e) => setCustomization(e.target.value)}
                  data-testid="textarea-retry-customization"
                  rows={3}
                  placeholder="Make the sleeves longer, and a lighter shade of the same colour."
                  className="focus-ring mt-3 w-full resize-none rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/55"
                />
                {refineError && <p className="mt-2 text-xs font-semibold text-destructive">{refineError}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitRetry}
                    disabled={!customization.trim() || refining}
                    data-testid="button-submit-retry"
                    className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {refining ? <RefreshCw size={15} className="animate-spin" /> : <Wand2 size={15} />}{' '}
                    {refining ? 'Regenerating…' : 'Regenerate this look'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRetry(false);
                      setCustomization('');
                      setRefineError('');
                    }}
                    disabled={refining}
                    data-testid="button-cancel-retry"
                    className="focus-ring rounded-full px-4 py-2.5 text-sm font-bold text-muted-foreground hover:bg-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="animate-rise lg:pt-4">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">The complete look</p>
            <h1 className="mt-4 font-serif text-[clamp(3rem,7vw,6rem)] leading-[.86] tracking-[-.05em]">
              {look.title}
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">{look.note}</p>
            <div className="mt-7 flex items-center gap-3">
              <div className="flex gap-2">
                {look.palette.map((color, idx) => (
                  <span
                    key={`${color}-${idx}`}
                    className="size-8 rounded-full border-2 border-card shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
                {look.confidence}% confidence
              </span>
            </div>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">👗 Outfit</p>
                <p className="mt-2 font-semibold">{look.outfit}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🎨 Colour</p>
                <p className="mt-2 font-semibold">{look.outfitColor}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isChild ? '🧸 Accessories' : isMan ? '⌚ Watches & Accessories' : '💎 Jewellery'}
                </p>
                <p className="mt-2 font-semibold">{isChild ? look.accessories : look.jewellery}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  💇 Hairstyle & Grooming
                </p>
                <p className="mt-2 font-semibold">{look.hairstyle}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isChild ? '☀️ Skin' : isMan ? '✨ Grooming' : '💄 Makeup'}
                </p>
                <p className="mt-2 font-semibold">
                  {isChild
                    ? 'Child-friendly natural skin (no cosmetics)'
                    : isMan
                    ? look.makeup || 'Clean natural grooming'
                    : look.makeup}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">👠 Footwear</p>
                <p className="mt-2 font-semibold">{look.footwear}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">👜 Accessories</p>
                <p className="mt-2 font-semibold">{look.accessories}</p>
              </div>
            </div>
            <div className="mt-8 rounded-2xl border border-accent/25 bg-accent/7 p-5">
              <p className="font-serif text-2xl">Why LetStyle chose this</p>
              <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {look.reasoning.map((reason, rIdx) => (
                  <li key={`${reason}-${rIdx}`} className="flex gap-2">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent" /> {reason}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 divide-y divide-border border-y border-border">
              {look.pieces.map((piece, pIdx) => (
                <div key={`${piece.category}-${piece.name}-${pIdx}`} className="grid grid-cols-[72px_1fr] gap-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {piece.category}
                  </p>
                  <div>
                    <p className="font-semibold">{piece.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{piece.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Style visualisation — actual fit, fabric fall and real-world colour may vary.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onSave}
                data-testid="button-detail-save"
                className={`focus-ring inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold ${
                  saved ? 'bg-secondary' : 'bg-primary text-primary-foreground'
                }`}
              >
                {saved ? <Check size={16} /> : <Save size={16} />}{' '}
                {saved ? 'Saved to your journal' : 'Save this look'}
              </button>
              <button
                type="button"
                onClick={onFeedback}
                data-testid="button-detail-not-for-me"
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold hover:border-primary/50"
              >
                <X size={16} /> Not my style
              </button>
            </div>
          </div>
        </div>
        {/* Real Product Shopping Section */}
        <ShopLookSection look={look} profile={profile} />
      </main>
    </div>
  );
}
