'use client';
import { Sparkles, Check, ArrowRight, Eye, Heart, Palette, Wand2 } from 'lucide-react';

interface BeautySectionProps {
  onStart: () => void;
}

export function BeautySection({ onStart }: BeautySectionProps) {
  const makeupPillars = [
    {
      category: 'BASE',
      title: 'Skin-Identical Coverage & Finish',
      description: 'Whether your undertone calls for a dewy luminous skin tint or a velvet satin veil, SkinTune matches finish and coverage to your skin tone and event lighting.',
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
      description: 'Your makeup is never designed in a vacuum. SkinTune balances makeup intensity with your clothing neckline, fabric weight, and jewellery reflectivity.',
      shadeExample: 'Quiet Luxury Day-to-Evening Transition',
      swatch: '#194343',
    },
  ];

  return (
    <section id="beauty-section" className="relative bg-[#194343] text-[#D7BD9B] py-20 lg:py-28 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute left-0 top-1/3 size-96 rounded-full bg-[#194343]/40 blur-[130px]" />
      <div className="pointer-events-none absolute right-0 bottom-10 size-80 rounded-full bg-[#663B1B]/25 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          {/* Left Column: Copy & Breakdown Cards */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#663B1B]/60 bg-[#663B1B]/30 px-3.5 py-1.5">
              <Sparkles size={14} className="text-[#D7BD9B]" />
              <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#D7BD9B]">
                Dedicated Beauty Intelligence
              </span>
            </div>

            <h2 className="mt-4 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#D7BD9B]">
              Makeup that works <br />
              with <span className="italic text-[#D7BD9B]">YOU.</span>
            </h2>

            <p className="mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-[#D7BD9B]/75">
              SkinTune is far more than an outfit picker. We calculate the exact makeup shades, finishes, and techniques that harmonize with your natural complexion.
            </p>

            {/* Feature List Cards */}
            <div className="mt-10 space-y-3.5">
              {makeupPillars.map((item) => (
                <div
                  key={item.category}
                  className="group rounded-2xl border border-[#663B1B]/50 bg-[#194343] p-4.5 transition-all duration-200 hover:border-[#D7BD9B]/60 hover:bg-[#143838]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-3.5 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: item.swatch }}
                      />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#D7BD9B]">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-[#D7BD9B]/75">
                      {item.shadeExample}
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-[#D7BD9B]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm text-[#D7BD9B]/70 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={onStart}
                className="flex items-center gap-2 rounded-full bg-[#D7BD9B] px-7 py-3.5 text-sm font-bold text-[#194343] shadow-lg transition hover:bg-[#e4cdb0]"
              >
                <span>Get My Personalized Beauty Edit</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Right Column: Editorial Visual & Swatch Showcase */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {/* Visual Frame */}
            <div className="relative overflow-hidden rounded-[2.2rem] border border-[#663B1B]/50 bg-[#194343] p-2.5 shadow-2xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[1.8rem] bg-[#194343]/30">
                <img
                  src="/images/cat-women.jpg"
                  alt="Editorial beauty portrait showcasing glowing complexion and harmonious makeup"
                  className="size-full object-cover transition duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#194343]/90 via-transparent to-black/20" />

                {/* Overlaid Badge */}
                <div className="absolute top-4 left-4 rounded-full bg-[#194343]/85 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[#D7BD9B] backdrop-blur-md border border-[#663B1B]">
                  Personalized Shade Harmony
                </div>

                {/* Overlaid Palette Swatches */}
                <div className="absolute bottom-4 inset-x-4 rounded-2xl border border-[#663B1B]/60 bg-[#194343]/90 p-4 backdrop-blur-md">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#D7BD9B]/75">
                    Detected Undertone Compatibility
                  </p>
                  <p className="font-serif text-lg font-semibold text-[#D7BD9B] mt-1">
                    Warm Olive & Golden Balance
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-2 pt-2 border-t border-[#663B1B]/50">
                    <div className="text-center">
                      <span className="mx-auto block size-6 rounded-full bg-[#D5A478] border border-white/20 shadow-sm" />
                      <span className="text-[10px] text-[#D7BD9B]/70 mt-1 block">Base Tint</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-6 rounded-full bg-[#C26A51] border border-white/20 shadow-sm" />
                      <span className="text-[10px] text-[#D7BD9B]/70 mt-1 block">Terracotta</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-6 rounded-full bg-[#D97D64] border border-white/20 shadow-sm" />
                      <span className="text-[10px] text-[#D7BD9B]/70 mt-1 block">Warm Flush</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-6 rounded-full bg-[#663B1B] border border-white/20 shadow-sm" />
                      <span className="text-[10px] text-[#D7BD9B]/70 mt-1 block">Warm Mocha</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Editorial Quote Card */}
            <div className="mt-6 rounded-2xl border border-[#663B1B]/50 bg-[#663B1B]/20 p-5 text-xs text-[#D7BD9B]/80 leading-relaxed backdrop-blur-sm">
              <p className="font-semibold text-[#D7BD9B] uppercase tracking-wider">
                SkinTune Beauty Philosophy
              </p>
              <p className="mt-1">
                “Beauty shouldn’t feel like following someone else’s viral tutorial. It’s about discovering the exact shade undertones that illuminate your natural coloring.”
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
