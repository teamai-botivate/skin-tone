'use client';
import { ArrowRight, Sparkles, Shield, Heart, Clock } from 'lucide-react';

interface FinalCTAProps {
  onStart: () => void;
}

export function FinalCTA({ onStart }: FinalCTAProps) {
  return (
    <section className="relative overflow-hidden bg-[#194343] text-[#D7BD9B] py-24 lg:py-32">
      {/* Background radial gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/20 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[42rem] rounded-full bg-[#194343]/40 blur-[150px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-10 size-72 rounded-full bg-[#663B1B]/25 blur-[130px]" />

      <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
        {/* Sparkle emblem */}
        <div className="mx-auto grid size-16 place-items-center rounded-3xl border border-[#663B1B]/60 bg-[#663B1B]/30 text-[#D7BD9B] shadow-xl backdrop-blur-md">
          <Sparkles size={28} />
        </div>

        {/* Heading */}
        <h2 className="mt-8 font-serif text-[clamp(2.5rem,5.5vw,4.8rem)] leading-[0.98] tracking-[-0.03em] text-[#D7BD9B]">
          Ready to find <br className="hidden sm:inline" />
          your <span className="italic text-[#D7BD9B]">style?</span>
        </h2>

        {/* Supporting Copy */}
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-xl leading-relaxed text-[#D7BD9B]/80">
          Discover the colors, looks and details that make you feel like yourself.
          Personalized recommendations for your makeup, outfits, jewellery, hairstyles and colors — designed around you.
        </p>

        {/* Primary CTA Button */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={onStart}
            data-testid="button-start-final"
            className="group flex min-h-[58px] items-center gap-3 rounded-full bg-[#D7BD9B] px-9 py-4 text-lg font-bold text-[#194343] shadow-[0_10px_30px_rgba(215,189,155,0.25)] transition-all duration-200 hover:-translate-y-1 hover:bg-[#e4cdb0] hover:shadow-[0_16px_40px_rgba(215,189,155,0.4)] focus:ring-4 focus:ring-[#D7BD9B]/40 focus:outline-none"
          >
            <span>Start Your Style</span>
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Reassurance Features */}
        <div className="mt-14 grid grid-cols-2 gap-4 border-t border-[#663B1B]/50 pt-10 sm:grid-cols-4 text-xs text-[#D7BD9B]/75">
          <div className="flex flex-col items-center gap-1.5">
            <Shield size={18} className="text-[#D7BD9B]" />
            <span className="font-semibold text-[#D7BD9B]">100% Private</span>
            <span>Runs locally in-browser</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Clock size={18} className="text-[#D7BD9B]" />
            <span className="font-semibold text-[#D7BD9B]">About 3 Minutes</span>
            <span>Quick tap consultation</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Sparkles size={18} className="text-[#D7BD9B]" />
            <span className="font-semibold text-[#D7BD9B]">5 Complete Looks</span>
            <span>Outfit, makeup, hair & jewels</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Heart size={18} className="text-[#D7BD9B]" />
            <span className="font-semibold text-[#D7BD9B]">Zero Beauty Scores</span>
            <span>Made to support your taste</span>
          </div>
        </div>
      </div>
    </section>
  );
}
