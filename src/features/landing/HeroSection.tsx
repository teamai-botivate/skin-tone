'use client';
import { useRef, useEffect, useState } from 'react';
import { ArrowRight, Sparkles, Shield, Palette, Eye, Heart, Compass } from 'lucide-react';

interface HeroSectionProps {
  onStart: () => void;
  onExplore: () => void;
}

export function HeroSection({ onStart, onExplore }: HeroSectionProps) {
  const [mounted, setMounted] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || videoError) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.play().catch(() => {});
  }, [mounted, videoError]);

  return (
    <section className="relative overflow-hidden bg-[#F0E5D5] text-[#194A49] py-10 sm:py-12 lg:py-16 border-b border-[#B08A70]/30">
      {/* Ambient background glow accents in warm champagne and soft mocha */}
      <div className="pointer-events-none absolute -left-32 top-0 size-96 rounded-full bg-[#D9BC96]/30 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-1/4 size-[32rem] rounded-full bg-[#B08A70]/20 blur-[140px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-80 rounded-full bg-[#D9BC96]/20 blur-[110px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[0.88fr_1.32fr] lg:gap-12 xl:gap-16">
          {/* Left Column: Editorial Headline & Messaging */}
          <div className="animate-rise z-10">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#B08A70]/15 px-3 py-1 sm:px-3.5 sm:py-1.5 backdrop-blur-sm">
              <Sparkles size={14} className="text-[#795548]" />
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-[#795548]">
                AI Personal Styling & Beauty
              </span>
            </div>

            {/* Main Editorial Headline */}
            <h1 className="mt-4 font-serif text-[clamp(2.1rem,4.2vw,3.75rem)] leading-[1.03] tracking-[-0.035em] text-[#194A49]">
              Your Next Look? <br />
              <span className="italic text-[#194A49]">LetStyle</span> It.
            </h1>

            {/* Clear, immediate product explanation */}
            <p className="mt-3.5 sm:mt-4 max-w-lg text-sm sm:text-base lg:text-lg leading-relaxed text-[#194A49]/85">
              Personalized recommendations for your <strong className="font-semibold text-[#194A49]">makeup</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">outfits</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">jewellery</strong>,{' '}
              <strong className="font-semibold text-[#194A49]">hairstyles</strong> and{' '}
              <strong className="font-semibold text-[#194A49]">colors</strong> — designed around your natural features, build, and taste.
            </p>

            {/* Pillar Chips for quick 5-second understanding */}
            <div className="mt-4 sm:mt-5 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/85 px-2.5 py-1 sm:px-3 sm:py-1.5 font-medium text-[#194A49] shadow-sm">
                <Palette size={13} className="text-[#795548]" /> Color Undertones
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/85 px-2.5 py-1 sm:px-3 sm:py-1.5 font-medium text-[#194A49] shadow-sm">
                <Eye size={13} className="text-[#795548]" /> Personalized Makeup
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/85 px-2.5 py-1 sm:px-3 sm:py-1.5 font-medium text-[#194A49] shadow-sm">
                <Compass size={13} className="text-[#795548]" /> Complete OOTD
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B08A70]/40 bg-white/85 px-2.5 py-1 sm:px-3 sm:py-1.5 font-medium text-[#194A49] shadow-sm">
                <Sparkles size={13} className="text-[#795548]" /> Jewellery & Hair
              </span>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3.5">
              <button
                type="button"
                onClick={onStart}
                data-testid="button-start"
                className="group flex min-h-[50px] items-center justify-center gap-2.5 rounded-full bg-[#D9BC96] px-7 py-3 text-base font-bold text-[#194A49] shadow-[0_8px_24px_rgba(217,188,150,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#cfaf86] hover:shadow-[0_12px_30px_rgba(217,188,150,0.45)] focus:ring-2 focus:ring-[#D9BC96] focus:outline-none"
              >
                <span>Style Your Way</span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </button>

              <button
                type="button"
                onClick={onExplore}
                className="flex min-h-[50px] items-center justify-center gap-2 rounded-full border border-[#194A49]/30 bg-white/60 px-6 py-3 text-sm font-semibold text-[#194A49] backdrop-blur-sm transition-all duration-200 hover:border-[#194A49]/60 hover:bg-white"
              >
                Explore Styling
              </button>
            </div>

            {/* Reassurance & Trust Bar */}
            <div className="mt-6 sm:mt-7 flex flex-wrap items-center gap-3.5 sm:gap-6 border-t border-[#B08A70]/30 pt-4 sm:pt-5 text-xs text-[#795548]">
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

          {/* Right Column: Layered Editorial Visual Composition in Wide Horizontal Format */}
          <div className="relative mx-auto w-full lg:max-w-none">
            {/* Main Editorial Video Frame - Enhanced mobile width and rounded hierarchy */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-[2rem] border border-[#B08A70]/30 bg-white/85 p-1.5 sm:p-2.5 shadow-xl sm:shadow-2xl">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-[1.6rem] bg-[#F0E5D5]">
                {mounted && !videoError ? (
                  <video
                    ref={videoRef}
                    poster="/images/hero-model.jpg"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onError={() => setVideoError(true)}
                    className="size-full object-cover object-center transition duration-700 hover:scale-105"
                  >
                    <source src="/model-video.mp4" type="video/mp4" onError={() => setVideoError(true)} />
                  </video>
                ) : (
                  <img
                    src="/images/hero-model.jpg"
                    alt="Editorial styling reference showing complete outfit, jewellery, and natural makeup"
                    className="size-full object-cover object-center transition duration-700 hover:scale-105"
                  />
                )}
                {/* Subtle ambient vignette rim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-black/5" />

                {/* Overlaid Tag */}
                <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 rounded-full bg-white/90 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/50 shadow-sm">
                  AI Visual Edit
                </div>
              </div>
            </div>

            {/* Floating Card 1: Personal Color Palette (Top Right) - Safe bounds on mobile */}
            <div className="absolute -top-3 right-2 sm:-top-3.5 sm:-right-3 rounded-xl sm:rounded-2xl border border-[#B08A70]/40 bg-white/95 p-2 sm:p-3.5 shadow-lg sm:shadow-xl backdrop-blur-md animate-floaty text-[#194A49]">
              <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.16em] text-[#795548]">
                Your Palette Match
              </p>
              <div className="mt-1 sm:mt-2 flex items-center gap-1 sm:gap-1.5">
                <span className="size-4 sm:size-5 rounded-full border border-black/10 bg-[#194A49]" title="Teal" />
                <span className="size-4 sm:size-5 rounded-full border border-black/10 bg-[#795548]" title="Mocha" />
                <span className="size-4 sm:size-5 rounded-full border border-black/10 bg-[#D9BC96]" title="Champagne" />
                <span className="size-4 sm:size-5 rounded-full border border-black/10 bg-[#B08A70]" title="Soft Mocha" />
                <span className="size-4 sm:size-5 rounded-full border border-black/10 bg-[#F0E5D5]" title="Linen" />
              </div>
              <p className="mt-0.5 sm:mt-1.5 text-[10px] sm:text-[11px] font-semibold text-[#194A49]">Teal & Mocha Harmony</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
