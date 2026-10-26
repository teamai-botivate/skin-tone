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
    <section id="beauty-section" className="relative bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 overflow-hidden border-b border-[#B08A70]/30">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute left-0 top-1/3 size-72 sm:size-96 rounded-full bg-[#D9BC96]/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 bottom-10 size-60 sm:size-80 rounded-full bg-[#B08A70]/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          {/* Left Column: Copy & Breakdown Cards */}
          <div>
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

            {/* Feature List Cards */}
            <div className="mt-4 sm:mt-6 space-y-2">
              {makeupPillars.map((item) => (
                <div
                  key={item.category}
                  className="group rounded-xl border border-[#B08A70]/30 bg-white/85 p-2.5 sm:p-3 transition-all duration-200 hover:border-[#B08A70]/60 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 sm:size-3 rounded-full border border-black/15 shadow-sm"
                        style={{ backgroundColor: item.swatch }}
                      />
                      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-medium text-[#194A49]/70">
                      {item.shadeExample}
                    </span>
                  </div>
                  <h3 className="mt-1 text-xs sm:text-sm font-semibold text-[#194A49]">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/70 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 sm:mt-5">
              <button
                type="button"
                onClick={onStart}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#194A49] shadow-sm transition hover:bg-[#cfaf86]"
              >
                <span>Get My Personalized Beauty Edit</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Right Column: Editorial Visual & Swatch Showcase */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            {/* Visual Frame */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-[2rem] border border-[#B08A70]/30 bg-white/80 p-1.5 sm:p-2 shadow-lg">
              <div className="relative aspect-[4/3] sm:aspect-[4/5] w-full overflow-hidden rounded-xl sm:rounded-[1.6rem] bg-[#F0E5D5]">
                <img
                  src="/images/cat-women.jpg"
                  alt="Editorial beauty portrait showcasing glowing complexion and harmonious makeup"
                  className="size-full object-cover transition duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#194A49]/70 via-transparent to-black/10" />

                {/* Overlaid Badge */}
                <div className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-0.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/50">
                  Personalized Shade Harmony
                </div>

                {/* Overlaid Palette Swatches */}
                <div className="absolute bottom-3 inset-x-3 sm:bottom-4 sm:inset-x-4 rounded-xl sm:rounded-2xl border border-[#B08A70]/40 bg-white/95 p-3 sm:p-3.5 backdrop-blur-md shadow-lg text-[#194A49]">
                  <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                    Detected Undertone Compatibility
                  </p>
                  <p className="font-serif text-sm sm:text-base font-semibold text-[#194A49] mt-0.5">
                    Warm Olive & Golden Balance
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-2 pt-2 border-t border-[#B08A70]/30">
                    <div className="text-center">
                      <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#D5A478] border border-black/10 shadow-sm" />
                      <span className="text-[9px] sm:text-[10px] text-[#795548] mt-0.5 block">Base Tint</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#C26A51] border border-black/10 shadow-sm" />
                      <span className="text-[9px] sm:text-[10px] text-[#795548] mt-0.5 block">Terracotta</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#D97D64] border border-black/10 shadow-sm" />
                      <span className="text-[9px] sm:text-[10px] text-[#795548] mt-0.5 block">Warm Flush</span>
                    </div>
                    <div className="text-center">
                      <span className="mx-auto block size-5 sm:size-6 rounded-full bg-[#795548] border border-black/10 shadow-sm" />
                      <span className="text-[9px] sm:text-[10px] text-[#795548] mt-0.5 block">Warm Mocha</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Editorial Quote Card */}
            <div className="mt-3 sm:mt-5 rounded-xl border border-[#B08A70]/30 bg-white/70 p-3 sm:p-4 text-[11px] sm:text-xs text-[#194A49]/80 leading-relaxed backdrop-blur-sm shadow-sm">
              <p className="font-semibold text-[#795548] uppercase tracking-wider text-[10px]">
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
