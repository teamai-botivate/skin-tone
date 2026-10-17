'use client';
import { ArrowRight, Sparkles, Shield, Palette, Eye, Heart, Compass } from 'lucide-react';

interface HeroSectionProps {
  onStart: () => void;
  onExplore: () => void;
}

export function HeroSection({ onStart, onExplore }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-[#F0E5D5] text-[#194A49] py-16 lg:py-24 border-b border-[#B08A70]/30">
      {/* Ambient background glow accents in warm champagne and soft mocha */}
      <div className="pointer-events-none absolute -left-32 top-0 size-96 rounded-full bg-[#D9BC96]/30 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-1/4 size-[32rem] rounded-full bg-[#B08A70]/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-80 rounded-full bg-[#D9BC96]/20 blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* Left Column: Editorial Headline & Messaging */}
          <div className="animate-rise z-10">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#B08A70]/15 px-3.5 py-1.5 backdrop-blur-sm">
              <Sparkles size={14} className="text-[#795548]" />
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#795548]">
                AI Personal Styling & Beauty
              </span>
            </div>

            {/* Main Editorial Headline */}
            <h1 className="mt-6 font-serif text-[clamp(2.75rem,5.5vw,5.2rem)] leading-[0.98] tracking-[-0.04em] text-[#194A49]">
              Discover what looks <br className="hidden sm:inline" />
              best on <span className="italic text-[#194A49]">YOU.</span>
            </h1>

            {/* Clear, immediate product explanation */}
            <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-[#194A49]/80">
              Personalized recommendations for your <strong className="font-semibold text-[#194A49]">makeup</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">outfits</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">jewellery</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">hairstyles</strong> and{' '}
              <strong className="font-semibold text-[#194A49]">colors</strong> — designed around your natural features, build, and taste.
            </p>

            {/* Pillar Chips for quick 5-second understanding */}
            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/80 px-3 py-1.5 text-[#194A49] shadow-sm">
                <Palette size={13} className="text-[#795548]" /> Color Undertones
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/80 px-3 py-1.5 text-[#194A49] shadow-sm">
                <Eye size={13} className="text-[#795548]" /> Personalized Makeup
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/80 px-3 py-1.5 text-[#194A49] shadow-sm">
                <Compass size={13} className="text-[#795548]" /> Complete OOTD
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/80 px-3 py-1.5 text-[#194A49] shadow-sm">
                <Sparkles size={13} className="text-[#795548]" /> Jewellery & Hair
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onStart}
                data-testid="button-start"
                className="group flex min-h-[52px] items-center gap-3 rounded-full bg-[#D9BC96] px-8 py-3.5 text-base font-bold text-[#194A49] shadow-[0_8px_24px_rgba(217,188,150,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#cfaf86] hover:shadow-[0_12px_30px_rgba(217,188,150,0.45)] focus:ring-2 focus:ring-[#D9BC96] focus:outline-none"
              >
                <span>Start Your Style</span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={onExplore}
                className="flex min-h-[52px] items-center gap-2 rounded-full border border-[#194A49]/30 bg-white/60 px-6 py-3.5 text-sm font-semibold text-[#194A49] backdrop-blur-sm transition-all duration-200 hover:border-[#194A49]/60 hover:bg-white"
              >
                Explore Styling
              </button>
            </div>

            {/* Reassurance & Trust Bar */}
            <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-[#B08A70]/30 pt-6 text-xs text-[#795548]">
              <span className="flex items-center gap-1.5">
                <Shield size={14} className="text-[#795548]" />
                Private by design (in-browser)
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#795548]" />
                About 3 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <Heart size={14} className="text-[#795548]" />
                Zero beauty scoring
              </span>
            </div>
          </div>

          {/* Right Column: Layered Editorial Visual Composition */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {/* Main Editorial Image Frame */}
            <div className="relative overflow-hidden rounded-[2rem] border border-[#B08A70]/30 bg-white/80 p-2 shadow-xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.6rem] bg-[#F0E5D5]">
                <img
                  src="/images/hero-model.jpg"
                  alt="Editorial styling reference showing complete outfit, jewellery, and natural makeup"
                  className="size-full object-cover object-top transition duration-700 hover:scale-105"
                />
                {/* Gradient vignette for card integration */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#194A49]/80 via-transparent to-black/10" />

                {/* Overlaid Tag */}
                <div className="absolute top-4 left-4 rounded-full bg-white/90 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/50">
                  AI Visual Edit
                </div>

                {/* Bottom Look Summary Box inside frame */}
                <div className="absolute bottom-4 inset-x-4 rounded-xl border border-[#B08A70]/40 bg-white/95 p-3.5 backdrop-blur-md shadow-lg text-[#194A49]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#795548]">Complete Recommended Look</p>
                      <p className="font-serif text-lg font-semibold text-[#194A49]">The Quiet Luxe Edit</p>
                    </div>
                    <span className="rounded-full bg-[#194A49] px-2.5 py-1 text-[11px] font-bold text-[#F0E5D5]">
                      96% Match
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#194A49]/70 line-clamp-1">
                    Sage linen tiered dress · Brushed gold jewellery · Terracotta glow
                  </p>
                </div>
              </div>
            </div>

            {/* Floating Card 1: Personal Color Palette (Top Right) */}
            <div className="absolute -top-4 -right-4 sm:-right-6 rounded-2xl border border-[#B08A70]/40 bg-white/95 p-3.5 shadow-xl backdrop-blur-md animate-floaty text-[#194A49]">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#795548]">
                Your Palette Match
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="size-5 rounded-full border border-black/10 bg-[#194A49]" title="Teal" />
                <span className="size-5 rounded-full border border-black/10 bg-[#795548]" title="Mocha" />
                <span className="size-5 rounded-full border border-black/10 bg-[#D9BC96]" title="Champagne" />
                <span className="size-5 rounded-full border border-black/10 bg-[#B08A70]" title="Soft Mocha" />
                <span className="size-5 rounded-full border border-black/10 bg-[#F0E5D5]" title="Linen" />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-[#194A49]">Teal & Mocha Harmony</p>
            </div>

            {/* Floating Card 2: Beauty & Makeup Detail (Bottom Left) */}
            <div className="absolute -bottom-6 -left-4 sm:-left-6 max-w-[210px] rounded-2xl border border-[#B08A70]/40 bg-white/95 p-3.5 shadow-xl backdrop-blur-md hidden sm:block text-[#194A49]">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-[#D9BC96]/40 text-[#194A49]">
                  <Sparkles size={12} />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#795548]">Makeup Formula</p>
              </div>
              <p className="mt-1.5 text-xs font-semibold leading-tight text-[#194A49]">
                Dewy skin tint, soft terracotta lip & warm cheek flush.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
