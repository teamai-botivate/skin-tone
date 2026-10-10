'use client';
import { ArrowRight, Sparkles, Shield, Palette, Eye, Heart, Compass } from 'lucide-react';

interface HeroSectionProps {
  onStart: () => void;
  onExplore: () => void;
}

export function HeroSection({ onStart, onExplore }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden bg-[#194343] text-[#D7BD9B] py-16 lg:py-24">
      {/* Ambient background glow accents in Teal, Mocha, and Linen */}
      <div className="pointer-events-none absolute -left-32 top-0 size-96 rounded-full bg-[#194343]/35 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 top-1/4 size-[32rem] rounded-full bg-[#663B1B]/25 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-80 rounded-full bg-[#D7BD9B]/10 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
          {/* Left Column: Editorial Headline & Messaging */}
          <div className="animate-rise z-10">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#663B1B]/60 bg-[#663B1B]/30 px-3.5 py-1.5 backdrop-blur-sm">
              <Sparkles size={14} className="text-[#D7BD9B]" />
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#D7BD9B]">
                AI Personal Styling & Beauty
              </span>
            </div>

            {/* Main Editorial Headline */}
            <h1 className="mt-6 font-serif text-[clamp(2.75rem,5.5vw,5.2rem)] leading-[0.98] tracking-[-0.04em] text-[#D7BD9B]">
              Discover what looks <br className="hidden sm:inline" />
              best on <span className="italic text-[#D7BD9B]">YOU.</span>
            </h1>

            {/* Clear, immediate product explanation */}
            <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-[#D7BD9B]/80">
              Personalized recommendations for your <strong className="font-semibold text-[#D7BD9B]">makeup</strong>,{' '}
              <strong className="font-semibold text-[#D7BD9B]">outfits</strong>,{' '}
              <strong className="font-semibold text-[#D7BD9B]">jewellery</strong>,{' '}
              <strong className="font-semibold text-[#D7BD9B]">hairstyles</strong> and{' '}
              <strong className="font-semibold text-[#D7BD9B]">colors</strong> — designed around your natural features, build, and taste.
            </p>

            {/* Pillar Chips for quick 5-second understanding */}
            <div className="mt-7 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#663B1B]/60 bg-[#194343]/90 px-3 py-1.5 text-[#D7BD9B]">
                <Palette size={13} className="text-[#D7BD9B]" /> Color Undertones
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#663B1B]/60 bg-[#194343]/90 px-3 py-1.5 text-[#D7BD9B]">
                <Eye size={13} className="text-[#D7BD9B]" /> Personalized Makeup
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#663B1B]/60 bg-[#194343]/90 px-3 py-1.5 text-[#D7BD9B]">
                <Compass size={13} className="text-[#D7BD9B]" /> Complete OOTD
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#663B1B]/60 bg-[#194343]/90 px-3 py-1.5 text-[#D7BD9B]">
                <Sparkles size={13} className="text-[#D7BD9B]" /> Jewellery & Hair
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onStart}
                data-testid="button-start"
                className="group flex min-h-[52px] items-center gap-3 rounded-full bg-[#D7BD9B] px-8 py-3.5 text-base font-bold text-[#194343] shadow-[0_8px_24px_rgba(215,189,155,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e4cdb0] hover:shadow-[0_12px_30px_rgba(215,189,155,0.4)] focus:ring-2 focus:ring-[#D7BD9B] focus:outline-none"
              >
                <span>Start Your Style</span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={onExplore}
                className="flex min-h-[52px] items-center gap-2 rounded-full border border-[#663B1B] bg-[#663B1B]/30 px-6 py-3.5 text-sm font-semibold text-[#D7BD9B] backdrop-blur-sm transition-all duration-200 hover:border-[#D7BD9B]/60 hover:bg-[#663B1B]/60 hover:text-[#F3E7D8]"
              >
                Explore Styling
              </button>
            </div>

            {/* Reassurance & Trust Bar */}
            <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-[#663B1B]/40 pt-6 text-xs text-[#D7BD9B]/75">
              <span className="flex items-center gap-1.5">
                <Shield size={14} className="text-[#D7BD9B]" />
                Private by design (in-browser)
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#D7BD9B]" />
                About 3 minutes
              </span>
              <span className="flex items-center gap-1.5">
                <Heart size={14} className="text-[#D7BD9B]" />
                Zero beauty scoring
              </span>
            </div>
          </div>

          {/* Right Column: Layered Editorial Visual Composition */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {/* Main Editorial Image Frame */}
            <div className="relative overflow-hidden rounded-[2rem] border border-[#663B1B]/50 bg-[#194343] p-2 shadow-2xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.6rem] bg-[#194343]/40">
                <img
                  src="/images/hero-model.jpg"
                  alt="Editorial styling reference showing complete outfit, jewellery, and natural makeup"
                  className="size-full object-cover object-top transition duration-700 hover:scale-105"
                />
                {/* Gradient vignette for card integration */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#194343]/90 via-transparent to-black/20" />

                {/* Overlaid Tag */}
                <div className="absolute top-4 left-4 rounded-full bg-[#194343]/85 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#D7BD9B] backdrop-blur-md border border-[#663B1B]/60">
                  AI Visual Edit
                </div>

                {/* Bottom Look Summary Box inside frame */}
                <div className="absolute bottom-4 inset-x-4 rounded-xl border border-[#663B1B]/70 bg-[#194343]/95 p-3.5 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-[#D7BD9B]">Complete Recommended Look</p>
                      <p className="font-serif text-lg font-semibold text-[#D7BD9B]">The Quiet Luxe Edit</p>
                    </div>
                    <span className="rounded-full bg-[#663B1B] px-2.5 py-1 text-[11px] font-bold text-[#D7BD9B]">
                      96% Match
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#D7BD9B]/70 line-clamp-1">
                    Sage linen tiered dress · Brushed gold jewellery · Terracotta glow
                  </p>
                </div>
              </div>
            </div>

            {/* Floating Card 1: Personal Color Palette (Top Right) */}
            <div className="absolute -top-4 -right-4 sm:-right-6 rounded-2xl border border-[#663B1B]/60 bg-[#194343]/95 p-3.5 shadow-xl backdrop-blur-md animate-floaty">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#D7BD9B]/75">
                Your Palette Match
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="size-5 rounded-full border border-white/20 bg-[#194343]" title="Teal" />
                <span className="size-5 rounded-full border border-white/20 bg-[#663B1B]" title="Mocha" />
                <span className="size-5 rounded-full border border-white/20 bg-[#D7BD9B]" title="Linen" />
                <span className="size-5 rounded-full border border-white/20 bg-[#194343]" title="Deep Teal" />
                <span className="size-5 rounded-full border border-white/20 bg-[#854E26]" title="Warm Mocha" />
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-[#D7BD9B]">Teal & Mocha Harmony</p>
            </div>

            {/* Floating Card 2: Beauty & Makeup Detail (Bottom Left) */}
            <div className="absolute -bottom-6 -left-4 sm:-left-6 max-w-[210px] rounded-2xl border border-[#663B1B]/60 bg-[#194343]/95 p-3.5 shadow-xl backdrop-blur-md hidden sm:block">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-[#663B1B]/30 text-[#D7BD9B]">
                  <Sparkles size={12} />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#D7BD9B]/75">Makeup Formula</p>
              </div>
              <p className="mt-1.5 text-xs font-semibold leading-tight text-[#D7BD9B]">
                Dewy skin tint, soft terracotta lip & warm cheek flush.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
