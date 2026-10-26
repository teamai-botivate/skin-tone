'use client';
import { ArrowRight, Sparkles, Shield, Heart, Clock } from 'lucide-react';

interface FinalCTAProps {
  onStart: () => void;
}

export function FinalCTA({ onStart }: FinalCTAProps) {
  return (
    <section className="relative overflow-hidden bg-[#F0E5D5] text-[#194A49] py-8 sm:py-12 lg:py-16 border-b border-[#B08A70]/30">
      {/* Background radial gradients */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[32rem] rounded-full bg-[#D9BC96]/25 blur-[150px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-10 size-60 rounded-full bg-[#B08A70]/15 blur-[130px]" />

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
        {/* Sparkle emblem */}
        <div className="mx-auto grid size-11 sm:size-14 place-items-center rounded-2xl border border-[#B08A70]/40 bg-white/80 text-[#194A49] shadow-sm backdrop-blur-md">
          <Sparkles size={20} className="sm:hidden" />
          <Sparkles size={24} className="hidden sm:block" />
        </div>

        {/* Heading */}
        <h2 className="mt-4 sm:mt-6 font-serif text-[clamp(1.75rem,4vw,3.5rem)] leading-[1.04] tracking-tight text-[#194A49]">
          Ready to find <br className="hidden sm:inline" />
          your <span className="italic text-[#795548]">style?</span>
        </h2>

        {/* Supporting Copy */}
        <p className="mx-auto mt-3 sm:mt-4 max-w-xl text-xs sm:text-base leading-relaxed text-[#194A49]/80">
          Discover the colors, looks and details that make you feel like yourself.
          Personalized recommendations for your makeup, outfits, jewellery, hairstyles and colors.
        </p>

        {/* Primary CTA Button */}
        <div className="mt-5 sm:mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            data-testid="button-start-final"
            className="group flex min-h-[46px] sm:min-h-[52px] items-center gap-2.5 rounded-full bg-[#D9BC96] px-7 py-2.5 sm:px-8 sm:py-3.5 text-sm sm:text-base font-bold text-[#194A49] shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#cfaf86] hover:shadow-lg focus:ring-4 focus:ring-[#D9BC96]/40 focus:outline-none"
          >
            <span>Style Your Way</span>
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Reassurance Features */}
        <div className="mt-7 sm:mt-10 grid grid-cols-2 gap-3 border-t border-[#B08A70]/30 pt-6 sm:grid-cols-4 text-[10px] sm:text-xs text-[#795548]">
          <div className="flex flex-col items-center gap-1">
            <Shield size={16} className="text-[#194A49]" />
            <span className="font-semibold text-[#194A49]">100% Private</span>
            <span>Runs in-browser</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Clock size={16} className="text-[#194A49]" />
            <span className="font-semibold text-[#194A49]">About 3 Minutes</span>
            <span>Quick consultation</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Sparkles size={16} className="text-[#194A49]" />
            <span className="font-semibold text-[#194A49]">5 Complete Looks</span>
            <span>Full styling breakdown</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Heart size={16} className="text-[#194A49]" />
            <span className="font-semibold text-[#194A49]">Zero Beauty Scores</span>
            <span>Supporting your taste</span>
          </div>
        </div>
      </div>
    </section>
  );
}
