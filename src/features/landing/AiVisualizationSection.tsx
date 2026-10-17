'use client';
import { Wand2, Sparkles, Check, ArrowRight, Eye, RefreshCw, UserCheck } from 'lucide-react';

interface AiVisualizationSectionProps {
  onStart: () => void;
}

export function AiVisualizationSection({ onStart }: AiVisualizationSectionProps) {
  return (
    <section className="bg-[#F0E5D5] text-[#194A49] py-20 lg:py-28 border-b border-[#B08A70]/30">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          {/* Left Column: Visual Mockup / Side-by-Side Showcase */}
          <div className="relative order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-[2.2rem] border border-[#B08A70]/30 bg-white/90 p-2.5 shadow-xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.8rem] bg-[#FAF5EE]">
                <img
                  src="/images/hero-model.jpg"
                  alt="AI style visualization demonstrating realistic fabric fall, jewellery, and makeup"
                  className="size-full object-cover object-top transition duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#194A49]/80 via-transparent to-black/15" />

                {/* Overlaid Pill */}
                <div className="absolute top-4 left-4 rounded-full bg-[#FAF5EE]/95 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/40 shadow-sm">
                  Photorealistic Preview
                </div>

                {/* Interactive Refinement Demo Card */}
                <div className="absolute bottom-4 inset-x-4 rounded-2xl border border-[#B08A70]/40 bg-[#FAF5EE]/95 p-4 text-[#194A49] backdrop-blur-md shadow-xl">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-[#D9BC96]/40 text-[#194A49]">
                      <Wand2 size={12} />
                    </span>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-[#795548]">
                      Natural Language Refinement
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-[#194A49] italic font-serif">
                    “Make the sleeves a little longer and show an almond loafer instead.”
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[#B08A70]/30 pt-2.5 text-[11px] text-[#795548]">
                    <span>Preserves your identity</span>
                    <span className="text-[#194A49] font-semibold">Regenerates in seconds</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating feature pill */}
            <div className="absolute -top-4 -left-4 rounded-2xl border border-[#B08A70]/30 bg-white p-3.5 shadow-xl hidden sm:block">
              <div className="flex items-center gap-2 text-xs font-bold text-[#194A49]">
                <UserCheck size={16} className="text-[#194A49]" />
                <span>Your Real Appearance Remains Center</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Feature Narrative */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-[#FAF5EE] px-3.5 py-1.5 shadow-sm">
              <Sparkles size={14} className="text-[#795548]" />
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#795548]">
                Visual Style Generation
              </span>
            </div>

            <h2 className="mt-4 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#194A49]">
              See the look <br />
              before you wear it.
            </h2>

            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194A49]/75">
              Instead of static text checklists or guessing how items pair, SkinTune turns your personal styling recommendations into high-fidelity photorealistic visuals.
            </p>

            {/* 3 Value Points */}
            <div className="mt-8 space-y-5">
              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <UserCheck size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194A49]">
                    Centered on Your Identity
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194A49]/75 leading-relaxed">
                    Our vision pipelines respect your real facial structure, skin undertone, and body build — showing how clothes drape on you, not a generic avatar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <Eye size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194A49]">
                    Harmonized in Context
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194A49]/75 leading-relaxed">
                    Preview the interplay of clothing fabric, metal sheen, lip shade, and hairstyle under natural light before heading out or shopping.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white border border-[#B08A70]/30 text-[#194A49] shadow-sm">
                  <RefreshCw size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194A49]">
                    Conversational Refinement
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194A49]/75 leading-relaxed">
                    Want higher contrast, a shorter hemline, or different shoe color? Simply request changes and SkinTune regenerates the look instantly.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <button
                type="button"
                onClick={onStart}
                className="flex items-center gap-2 rounded-full bg-[#D9BC96] px-8 py-4 text-sm font-bold text-[#194A49] shadow-md transition hover:bg-[#cfaf86]"
              >
                <span>Generate Your Visual Edit</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
