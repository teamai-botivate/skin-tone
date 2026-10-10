'use client';
import { useState } from 'react';
import { Palette, Sparkles, ArrowRight, Check, AlertCircle } from 'lucide-react';

interface ColorPaletteSectionProps {
  onStart: () => void;
}

interface PaletteHarmonies {
  name: string;
  description: string;
  undertone: string;
  contrast: string;
  swatches: { name: string; hex: string; role: string }[];
  accentNotes: string;
}

export function ColorPaletteSection({ onStart }: ColorPaletteSectionProps) {
  const [activeHarmonizer, setActiveHarmonizer] = useState<'forest-luxe' | 'warm-olive' | 'radiant-gold'>('forest-luxe');

  const palettes: Record<string, PaletteHarmonies> = {
    'forest-luxe': {
      name: 'Deep Teal & Rich Mocha Harmony',
      description: 'Sophisticated muted teal offset with warm rich mocha and luminous warm linen breathing room.',
      undertone: 'Neutral to Warm Complexions',
      contrast: 'Medium-High Visual Contrast',
      swatches: [
        { name: 'Teal', hex: '#194343', role: 'Anchor Foundation' },
        { name: 'Rich Mocha', hex: '#663B1B', role: 'Warm Contrast' },
        { name: 'Warm Linen', hex: '#D7BD9B', role: 'Luminous Highlight' },
        { name: 'Deep Teal', hex: '#0D2E2E', role: 'Sculptural Depth' },
        { name: 'Warm Terracotta', hex: '#854E26', role: 'Soft Balance' },
      ],
      accentNotes: 'Brings high-fashion warmth and sculptural clarity to facial features without harsh black silhouettes.',
    },
    'warm-olive': {
      name: 'Earthy Terracotta & Olive',
      description: 'Rich amber, dried sage, and warm terracotta tones that reflect gentle golden radiance onto the skin.',
      undertone: 'Warm Golden & Olive Undertones',
      contrast: 'Soft to Medium Contrast',
      swatches: [
        { name: 'Deep Teal Olive', hex: '#194343', role: 'Anchor Foundation' },
        { name: 'Terracotta', hex: '#C26A51', role: 'Warm Radiance' },
        { name: 'Warm Ochre', hex: '#D8B27C', role: 'Gentle Glow' },
        { name: 'Soft Linen', hex: '#EAE1D2', role: 'Breathable Base' },
        { name: 'Deep Fig', hex: '#4A2825', role: 'Rich Accent' },
      ],
      accentNotes: 'Neutralizes sallowness and makes natural eye color and warm hair highlights pop.',
    },
    'radiant-gold': {
      name: 'Champagne & Midnight Sheen',
      description: 'High-contrast evening elegance blending midnight depth, champagne silk, and jewel-tone emerald.',
      undertone: 'Cool & Neutral-Deep Tones',
      contrast: 'High Visual Impact',
      swatches: [
        { name: 'Deep Teal', hex: '#194343', role: 'Deep Contour' },
        { name: 'Champagne Gold', hex: '#C9A86E', role: 'Reflective Light' },
        { name: 'Warm Linen', hex: '#D7BD9B', role: 'Earthy Transition' },
        { name: 'Alabaster', hex: '#F5EFE6', role: 'Pristine Surface' },
        { name: 'Raw Umber', hex: '#3B3026', role: 'Tailored Shadow' },
      ],
      accentNotes: 'Creates striking editorial definition for formal occasions, weddings, and galas.',
    },
  };

  const current = palettes[activeHarmonizer];

  return (
    <section id="color-palette" className="relative bg-[#194343] text-[#D7BD9B] py-20 lg:py-28 overflow-hidden">
      {/* Background radial gradients */}
      <div className="pointer-events-none absolute right-10 top-20 size-[30rem] rounded-full bg-[#194343]/30 blur-[140px]" />
      <div className="pointer-events-none absolute left-10 bottom-20 size-[25rem] rounded-full bg-[#663B1B]/25 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#D7BD9B]">
            Color Intelligence
          </p>
          <h2 className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,3.8rem)] leading-[1.05] tracking-tight text-[#D7BD9B]">
            Your colors, your palette.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#D7BD9B]/75">
            Discover the exact color families that illuminate your complexion. Rather than rigid clinical seasons, SkinTune designs an editorial fashion palette curated for how colors reflect onto your face.
          </p>
        </div>

        {/* Palette Tab Selector */}
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveHarmonizer('forest-luxe')}
            className={`rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              activeHarmonizer === 'forest-luxe'
                ? 'bg-[#D7BD9B] text-[#194343] shadow-lg'
                : 'border border-[#663B1B] bg-[#663B1B]/30 text-[#D7BD9B]/80 hover:text-white'
            }`}
          >
            Signature Teal & Mocha
          </button>
          <button
            type="button"
            onClick={() => setActiveHarmonizer('warm-olive')}
            className={`rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              activeHarmonizer === 'warm-olive'
                ? 'bg-[#D7BD9B] text-[#194343] shadow-lg'
                : 'border border-[#663B1B] bg-[#663B1B]/30 text-[#D7BD9B]/80 hover:text-white'
            }`}
          >
            Warm Earth & Terracotta
          </button>
          <button
            type="button"
            onClick={() => setActiveHarmonizer('radiant-gold')}
            className={`rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
              activeHarmonizer === 'radiant-gold'
                ? 'bg-[#D7BD9B] text-[#194343] shadow-lg'
                : 'border border-[#663B1B] bg-[#663B1B]/30 text-[#D7BD9B]/80 hover:text-white'
            }`}
          >
            Champagne & Midnight Sheen
          </button>
        </div>

        {/* Swatches Visual Presentation */}
        <div className="mt-8 rounded-3xl border border-[#663B1B]/50 bg-[#194343] p-8 sm:p-10 shadow-2xl">
          <div className="flex flex-col justify-between gap-4 border-b border-[#663B1B]/40 pb-6 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#D7BD9B]/75">
                Curated Fashion Spectrum
              </p>
              <h3 className="font-serif text-3xl font-bold text-[#D7BD9B] mt-1">
                {current.name}
              </h3>
              <p className="text-sm text-[#D7BD9B]/70 mt-1">
                {current.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-[#663B1B] bg-[#194343]/80 px-3.5 py-1.5 text-[#D7BD9B] font-semibold">
                {current.undertone}
              </span>
              <span className="rounded-full border border-[#663B1B] bg-[#194343]/80 px-3.5 py-1.5 text-[#D7BD9B]/80 font-semibold">
                {current.contrast}
              </span>
            </div>
          </div>

          {/* Large Editorial Swatches Row */}
          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            {current.swatches.map((swatch) => (
              <div
                key={`${swatch.name}-${swatch.hex}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#194343]/90 p-3 transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl"
              >
                {/* Color Block */}
                <div
                  className="h-32 w-full rounded-xl border border-white/10 shadow-inner transition-transform group-hover:scale-102"
                  style={{ backgroundColor: swatch.hex }}
                />
                {/* Label */}
                <div className="mt-3.5 px-1">
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-base font-semibold text-[#D7BD9B]">
                      {swatch.name}
                    </p>
                    <span className="text-[10px] font-mono text-[#D7BD9B]/75">
                      {swatch.hex}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#D7BD9B]/75">
                    {swatch.role}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Color Insight Footer */}
          <div className="mt-10 flex flex-col justify-between gap-6 rounded-2xl border border-[#663B1B]/60 bg-[#663B1B]/25 p-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="text-[#D7BD9B] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#D7BD9B]">
                  Styling Implication
                </p>
                <p className="text-xs text-[#D7BD9B]/75 mt-0.5 max-w-2xl">
                  {current.accentNotes}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onStart}
              className="shrink-0 flex items-center gap-2 rounded-full bg-[#D7BD9B] px-6 py-2.5 text-xs font-bold text-[#194343] hover:bg-[#e4cdb0]"
            >
              Analyze My Complexion <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
