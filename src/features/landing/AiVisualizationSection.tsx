'use client';
import { useState, useRef, useEffect } from 'react';
import { Wand2, Sparkles, Check, ArrowRight, Eye, RefreshCw, UserCheck } from 'lucide-react';

interface AiVisualizationSectionProps {
  onStart: () => void;
}

export function AiVisualizationSection({ onStart }: AiVisualizationSectionProps) {
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
    <section className="bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 border-b border-[#B08A70]/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* Left Column: Visual Mockup / Side-by-Side Showcase */}
          <div className="relative order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-xl sm:rounded-[2rem] border border-[#B08A70]/30 bg-white/90 p-1.5 sm:p-2 shadow-sm">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg sm:rounded-[1.6rem] bg-[#FAF5EE]">
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
                    <source src="/model-video3.mp4" type="video/mp4" onError={() => setVideoError(true)} />
                  </video>
                ) : (
                  <img
                    src="/images/hero-model.jpg"
                    alt="AI style visualization demonstrating realistic fabric fall, jewellery, and makeup"
                    className="size-full object-cover object-top transition duration-700 hover:scale-105"
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

                {/* Overlaid Pill */}
                <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 rounded-full bg-[#FAF5EE]/95 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/40 shadow-sm">
                  Photorealistic Preview
                </div>

                {/* Interactive Refinement Demo Card */}
                <div className="absolute bottom-2 inset-x-2 sm:bottom-3 sm:inset-x-3 rounded-lg sm:rounded-xl border border-[#B08A70]/40 bg-[#FAF5EE]/95 p-2 sm:p-3 text-[#194A49] backdrop-blur-md shadow-md">
                  <div className="flex items-center gap-1.5">
                    <span className="grid size-4 sm:size-5 place-items-center rounded-full bg-[#D9BC96]/40 text-[#194A49]">
                      <Wand2 size={10} />
                    </span>
                    <p className="text-[8px] sm:text-[9px] uppercase font-bold tracking-wider text-[#795548]">
                      Natural Language Refinement
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] sm:text-xs text-[#194A49] italic font-serif">
                    “Make the sleeves a little longer and show an almond loafer instead.”
                  </p>
                  <div className="mt-1 flex items-center justify-between border-t border-[#B08A70]/30 pt-1 text-[8px] sm:text-[10px] text-[#795548]">
                    <span>Preserves your identity</span>
                    <span className="text-[#194A49] font-semibold">Regenerates in seconds</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating feature pill */}
            <div className="absolute -top-3 -left-3 rounded-xl border border-[#B08A70]/30 bg-white p-2 sm:p-2.5 shadow-md hidden sm:block">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#194A49]">
                <UserCheck size={14} className="text-[#194A49]" />
                <span>Your Real Appearance Remains Center</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Feature Narrative */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#FAF5EE] px-2.5 py-0.5 sm:px-3 sm:py-1 shadow-sm">
              <Sparkles size={13} className="text-[#795548]" />
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#795548]">
                Visual Style Generation
              </span>
            </div>

            <h2 className="mt-2 font-serif text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.1] tracking-tight text-[#194A49]">
              See the look <br />
              before you wear it.
            </h2>

            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#194A49]/75">
              Instead of static text checklists or guessing how items pair, LetStyle turns your personal styling recommendations into high-fidelity photorealistic visuals.
            </p>

            {/* 3 Value Points */}
            <div className="mt-4 sm:mt-5 space-y-2.5 sm:space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="grid size-6 sm:size-7 shrink-0 place-items-center rounded-lg bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <UserCheck size={13} />
                </span>
                <div>
                  <h3 className="font-serif text-xs sm:text-sm font-bold text-[#194A49]">
                    Centered on Your Identity
                  </h3>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/75 leading-relaxed">
                    Our vision pipelines respect your real facial structure, skin undertone, and body build — showing how clothes drape on you, not a generic avatar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="grid size-6 sm:size-7 shrink-0 place-items-center rounded-lg bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <Eye size={13} />
                </span>
                <div>
                  <h3 className="font-serif text-xs sm:text-sm font-bold text-[#194A49]">
                    Harmonized in Context
                  </h3>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/75 leading-relaxed">
                    Preview the interplay of clothing fabric, metal sheen, lip shade, and hairstyle under natural light before heading out or shopping.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="grid size-6 sm:size-7 shrink-0 place-items-center rounded-lg bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <RefreshCw size={13} />
                </span>
                <div>
                  <h3 className="font-serif text-xs sm:text-sm font-bold text-[#194A49]">
                    Conversational Refinement
                  </h3>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/75 leading-relaxed">
                    Want higher contrast, a shorter hemline, or different shoe color? Simply request changes and LetStyle regenerates the look instantly.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 sm:mt-5">
              <button
                type="button"
                onClick={onStart}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#194A49] shadow-sm transition hover:bg-[#cfaf86]"
              >
                <span>Generate Your Visual Edit</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
