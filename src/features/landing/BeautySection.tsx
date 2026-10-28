'use client';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface BeautySectionProps {
  onStart: () => void;
}

export function BeautySection({ onStart }: BeautySectionProps) {
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

  const makeupPillars = [
    {
      category: 'BASE',
      title: 'Skin-Identical Coverage & Finish',
      description: 'Whether your undertone calls for a dewy luminous skin tint or a velvet satin veil, LetStyle matches finish and coverage to your skin tone and event lighting.',
      shadeExample: 'Medium Warm Olive · Luminous Sheen',
      swatch: '#D5A478',
    },
    {
      category: 'LIP',
      title: 'Flattering Undertone Harmonies',
      description: 'Move past viral shades that wash you out. Discover personalized lip hues — from everyday terracotta tints and rich spiced caramels to celebratory berry washes.',
      shadeExample: 'Velvet Terracotta Silk · Undertone 98% Match',
      swatch: '#C26A51',
    },
    {
      category: 'EYE',
      title: 'Structural Depth & Definition',
      description: 'Subtle dimension crafted for your eye shape. Champagne shimmer washes, warm espresso tightlining, or softened smoky contours that bring forward eye color.',
      shadeExample: 'Champagne Warm Bronze Contour',
      swatch: '#8C6C52',
    },
    {
      category: 'BLUSH',
      title: 'Anatomical Placement & Glow',
      description: 'Strategic placement mapped to your cheekbone structure. Lift the face with high-temple warm peach, or add youthful softness with apple-of-cheek rosewood.',
      shadeExample: 'Spiced Apricot Flush · High Cheekbone Lift',
      swatch: '#D97D64',
    },
    {
      category: 'OVERALL STYLE',
      title: 'Occasion & Wardrobe Synchronization',
      description: 'Your makeup is never designed in a vacuum. LetStyle balances makeup intensity with your clothing neckline, fabric weight, and jewellery reflectivity.',
      shadeExample: 'Quiet Luxury Day-to-Evening Transition',
      swatch: '#194A49',
    },
  ];

  return (
    <section
      id="beauty-section"
      suppressHydrationWarning
      className="relative bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 overflow-hidden border-b border-[#B08A70]/30"
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute left-0 top-1/3 size-72 sm:size-96 rounded-full bg-[#D9BC96]/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 bottom-10 size-60 sm:size-80 rounded-full bg-[#B08A70]/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" suppressHydrationWarning>
        {/* Section Header */}
        <div className="max-w-2xl mb-4 sm:mb-6" suppressHydrationWarning>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#B08A70]/15 px-2.5 py-0.5 sm:px-3 sm:py-1">
            <Sparkles size={13} className="text-[#795548]" />
            <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#795548]">
              Dedicated Beauty Intelligence
            </span>
          </div>

          <h2 className="mt-2 font-serif text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.1] tracking-tight text-[#194A49]">
            Makeup that works <br />
            with <span className="italic text-[#194A49]">YOU.</span>
          </h2>

          <p className="mt-1.5 max-w-xl text-xs sm:text-sm leading-relaxed text-[#194A49]/75">
            LetStyle is far more than an outfit picker. We calculate the exact makeup shades, finishes, and techniques that harmonize with your natural complexion.
          </p>
        </div>

        {/* 2-Column Grid: Video on Top/Left (above rectangles on mobile!), Features on Below/Right */}
        <div className="grid items-start gap-6 sm:gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12" suppressHydrationWarning>
          
          {/* Column 1: Video & Undertone Showcase (Above rectangles on mobile, left on desktop) */}
          <div className="relative mx-auto w-full max-w-lg lg:max-w-none" suppressHydrationWarning>
            {/* Visual Frame & Swatch Showcase */}
            <div className="overflow-hidden rounded-2xl sm:rounded-[2rem] border border-[#B08A70]/30 bg-white/80 p-2 sm:p-2.5 shadow-lg">
              {/* Horizontal Video (widescreen 16:9 aspect ratio) */}
              <div
                className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-[1.4rem] bg-[#194A49]/10 shadow-inner"
                suppressHydrationWarning
              >
                {mounted && !videoError ? (
                  <video
                    ref={videoRef}
                    poster="/images/cat-women.jpg"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    onError={() => setVideoError(true)}
                    className="size-full object-cover object-center"
                  >
                    <source src="/makeup-video.mp4" type="video/mp4" onError={() => setVideoError(true)} />
                  </video>
                ) : (
                  <img
                    src="/images/cat-women.jpg"
                    alt="Editorial beauty portrait showcasing glowing complexion and harmonious makeup"
                    className="size-full object-cover transition duration-700 hover:scale-105"
                  />
                )}

                {/* Overlaid Badge */}
                <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 rounded-full bg-white/90 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/50 shadow-sm">
                  Personalized Shade Harmony
                </div>
              </div>

              {/* Dedicated Undertone Compatibility Section: cleanly BELOW video without overlapping */}
              <div className="mt-2.5 sm:mt-3 rounded-xl sm:rounded-2xl border border-[#B08A70]/30 bg-white/95 p-3 sm:p-3.5 shadow-xs text-[#194A49]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                      Detected Undertone Compatibility
                    </p>
                    <p className="font-serif text-sm sm:text-base font-semibold text-[#194A49] mt-0.5">
                      Warm Olive & Golden Balance
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#B08A70]/15 px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-[#795548] shrink-0">
                    <Sparkles size={11} /> 98% Match
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-4 gap-2 pt-2.5 border-t border-[#B08A70]/25">
                  <div className="text-center">
                    <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#D5A478] border border-black/10 shadow-sm" />
                    <span className="text-[9px] sm:text-[10px] font-medium text-[#795548] mt-1 block">Base Tint</span>
                  </div>
                  <div className="text-center">
                    <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#C26A51] border border-black/10 shadow-sm" />
                    <span className="text-[9px] sm:text-[10px] font-medium text-[#795548] mt-1 block">Terracotta</span>
                  </div>
                  <div className="text-center">
                    <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#D97D64] border border-black/10 shadow-sm" />
                    <span className="text-[9px] sm:text-[10px] font-medium text-[#795548] mt-1 block">Warm Flush</span>
                  </div>
                  <div className="text-center">
                    <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#795548] border border-black/10 shadow-sm" />
                    <span className="text-[9px] sm:text-[10px] font-medium text-[#795548] mt-1 block">Warm Mocha</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: 5 Rectangular Feature Bars + CTA + Quote (Below video on mobile, right on desktop) */}
          <div className="relative space-y-4" suppressHydrationWarning>
            {/* Feature List Cards: Compact and convenient for mobile */}
            <div className="space-y-1.5 sm:space-y-2">
              {makeupPillars.map((item) => (
                <div
                  key={item.category}
                  className="group rounded-lg sm:rounded-xl border border-[#B08A70]/30 bg-white/85 px-2.5 py-1.5 sm:px-3 sm:py-2.5 transition-all duration-200 hover:border-[#B08A70]/60 hover:bg-white hover:shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="size-2 sm:size-2.5 rounded-full shrink-0 border border-black/15 shadow-xs"
                        style={{ backgroundColor: item.swatch }}
                      />
                      <span className="text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548] shrink-0">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[8.5px] sm:text-[10px] font-medium text-[#194A49]/70 shrink-0 truncate max-w-[55%] sm:max-w-none text-right">
                      {item.shadeExample}
                    </span>
                  </div>
                  <h3 className="mt-0.5 text-[11px] sm:text-xs lg:text-sm font-semibold text-[#194A49] leading-tight">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-[10px] sm:text-[11px] lg:text-xs text-[#194A49]/70 leading-snug line-clamp-1 sm:line-clamp-2">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <div>
              <button
                type="button"
                onClick={onStart}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#194A49] shadow-sm transition hover:bg-[#cfaf86]"
              >
                <span>Get My Personalized Beauty Edit</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* Editorial Quote Card */}
            <div className="rounded-xl border border-[#B08A70]/30 bg-white/70 p-2.5 sm:p-3 text-[11px] sm:text-xs text-[#194A49]/80 leading-relaxed backdrop-blur-sm shadow-sm">
              <p className="font-semibold text-[#795548] uppercase tracking-wider text-[9px] sm:text-[10px]">
                LetStyle Beauty Philosophy
              </p>
              <p className="mt-0.5">
                “Beauty shouldn’t feel like following someone else’s viral tutorial. It’s about discovering the exact shade undertones that illuminate your natural coloring.”
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}



