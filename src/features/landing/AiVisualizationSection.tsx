'use client';
import { Wand2, Sparkles, Check, ArrowRight, Eye, RefreshCw, UserCheck } from 'lucide-react';

interface AiVisualizationSectionProps {
  onStart: () => void;
}

export function AiVisualizationSection({ onStart }: AiVisualizationSectionProps) {
  return (
    <section className="bg-[#EFE4D6] text-[#194343] py-20 lg:py-28 border-b border-[#663B1B]/20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          {/* Left Column: Visual Mockup / Side-by-Side Showcase */}
          <div className="relative order-2 lg:order-1">
            <div className="relative overflow-hidden rounded-[2.2rem] border border-[#663B1B]/30 bg-[#194343] p-2.5 shadow-2xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.8rem] bg-[#194343]/30">
                <img
                  src="/images/hero-model.jpg"
                  alt="AI style visualization demonstrating realistic fabric fall, jewellery, and makeup"
                  className="size-full object-cover object-top transition duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#194343]/90 via-transparent to-black/20" />

                {/* Overlaid Pill */}
                <div className="absolute top-4 left-4 rounded-full bg-[#194343]/85 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#D7BD9B] backdrop-blur-md border border-[#663B1B]">
                  Photorealistic Preview
                </div>

                {/* Interactive Refinement Demo Card */}
                <div className="absolute bottom-4 inset-x-4 rounded-2xl border border-[#663B1B]/60 bg-[#194343]/95 p-4 text-[#D7BD9B] backdrop-blur-md shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-[#663B1B]/30 text-[#D7BD9B]">
                      <Wand2 size={12} />
                    </span>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-[#D7BD9B]">
                      Natural Language Refinement
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-[#D7BD9B]/90 italic font-serif">
                    “Make the sleeves a little longer and show an almond loafer instead.”
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-[#663B1B]/50 pt-2.5 text-[11px] text-[#D7BD9B]/75">
                    <span>Preserves your identity</span>
                    <span className="text-[#D7BD9B] font-semibold">Regenerates in seconds</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating feature pill */}
            <div className="absolute -top-4 -left-4 rounded-2xl border border-[#663B1B]/30 bg-white p-3.5 shadow-xl hidden sm:block">
              <div className="flex items-center gap-2 text-xs font-bold text-[#194343]">
                <UserCheck size={16} className="text-[#194343]" />
                <span>Your Real Appearance Remains Center</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Feature Narrative */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#663B1B]/30 bg-[#663B1B]/10 px-3.5 py-1.5">
              <Sparkles size={14} className="text-[#663B1B]" />
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#663B1B]">
                Visual Style Generation
              </span>
            </div>

            <h2 className="mt-4 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#194343]">
              See the look <br />
              before you wear it.
            </h2>

            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194343]/75">
              Instead of static text checklists or guessing how items pair, SkinTune turns your personal styling recommendations into high-fidelity photorealistic visuals.
            </p>

            {/* 3 Value Points */}
            <div className="mt-8 space-y-5">
              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#194343] text-[#D7BD9B] shadow-sm">
                  <UserCheck size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194343]">
                    Centered on Your Identity
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194343]/75 leading-relaxed">
                    Our vision pipelines respect your real facial structure, skin undertone, and body build — showing how clothes drape on you, not a generic avatar.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#194343] text-[#D7BD9B] shadow-sm">
                  <Eye size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194343]">
                    Harmonized in Context
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194343]/75 leading-relaxed">
                    Preview the interplay of clothing fabric, metal sheen, lip shade, and hairstyle under natural light before heading out or shopping.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#194343] text-[#D7BD9B] shadow-sm">
                  <RefreshCw size={17} />
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#194343]">
                    Conversational Refinement
                  </h3>
                  <p className="mt-1 text-xs sm:text-sm text-[#194343]/75 leading-relaxed">
                    Want higher contrast, a shorter hemline, or different shoe color? Simply request changes and SkinTune regenerates the look instantly.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <button
                type="button"
                onClick={onStart}
                className="flex items-center gap-2 rounded-full bg-[#194343] px-8 py-4 text-sm font-bold text-[#D7BD9B] shadow-lg transition hover:bg-[#143838]"
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
