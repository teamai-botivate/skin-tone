'use client';
import { useState } from 'react';
import { Gem, Sparkles, ArrowRight, Check } from 'lucide-react';

interface OccasionSectionProps {
  onStart: () => void;
  onQuickStart?: (occasion: string) => void;
}

interface OccasionData {
  name: string;
  metal: string;
  jewelleryFocus: string;
  necklineMatch: string;
  vibe: string;
  image: string;
  tags: string[];
}

export function OccasionSection({ onStart, onQuickStart }: OccasionSectionProps) {
  const [selectedOccasion, setSelectedOccasion] = useState<string>('Wedding');

  const occasions: Record<string, OccasionData> = {
    Everyday: {
      name: 'Everyday',
      metal: 'Brushed Antique Gold',
      jewelleryFocus: 'Delicate paperclip chain, subtle 14mm huggies, one slim stacking ring.',
      necklineMatch: 'Crewnecks, ribbed tees, open shirts.',
      vibe: 'Effortless, tactile, doesn’t snag or distract.',
      image: '/images/spring-sale.jpg',
      tags: ['Lightweight', 'Skin-Safe Metals', 'Stackable'],
    },
    Work: {
      name: 'Work',
      metal: 'Warm Champagne Gold or Polished Brass',
      jewelleryFocus: 'Architectural signet ring, clean geometric hoops, sleek leather strap timepiece.',
      necklineMatch: 'Collared shirts, tailored blazer lapels, boat necks.',
      vibe: 'Composed, authoritative, quietly luxurious.',
      image: '/images/occasion-work.jpg',
      tags: ['Boardroom Ready', 'Architectural', 'Non-distracting'],
    },
    'Date Night': {
      name: 'Date Night',
      metal: 'Antique Gold with Faceted Gems',
      jewelleryFocus: 'Layered crescent chain with deep emerald drop pendant and delicate ear climbers.',
      necklineMatch: 'V-necks, sweetheart cuts, off-shoulder knits.',
      vibe: 'Sensory, candlelit shimmer, draws attention to collarbone.',
      image: '/images/cat-accessories.jpg',
      tags: ['Candlelit Luster', 'Collarbone Focus', 'Emerald Accents'],
    },
    Wedding: {
      name: 'Wedding',
      metal: 'Heavy Heritage Antique Gold & Kundan',
      jewelleryFocus: 'Heirloom choker necklace, dramatic statement drops, ornate wrist cuff.',
      necklineMatch: 'Square neckline, sweetheart corset, deep scoop blouses.',
      vibe: 'Celebratory grandeur, regal balance without overcrowding the neckline.',
      image: '/images/occasion-wedding.jpg',
      tags: ['Heirloom Craft', 'Drop Earrings', 'Statement Choker'],
    },
    Festive: {
      name: 'Festive',
      metal: 'Warm Gold & Raw Emerald / Ruby Accents',
      jewelleryFocus: 'Filigree jhumkas, stacked temple bangles, and delicate maang tikka / pendant.',
      necklineMatch: 'Silk kurtas, saree necklines, lehenga blouses.',
      vibe: 'Rich heritage warmth, festive radiance in natural daylight.',
      image: '/images/occasion-festive.jpg',
      tags: ['Traditional Filigree', 'Stacked Bangles', 'Rich Stones'],
    },
    Party: {
      name: 'Party',
      metal: 'High-Polish Gold & Midnight Enamel',
      jewelleryFocus: 'Sculptural collar necklace, oversized molten hoops, chunky modernist cuff.',
      necklineMatch: 'Asymmetrical tops, halter necks, strapless bodices.',
      vibe: 'Bold, graphic impact under low club or cocktail lighting.',
      image: '/images/occasion-party.jpg',
      tags: ['High Voltage', 'Sculptural', 'Modern Edge'],
    },
  };

  const current = occasions[selectedOccasion] || occasions['Wedding'];
  const occasionList = ['Everyday', 'Work', 'Date Night', 'Wedding', 'Festive', 'Party'];

  return (
    <section className="bg-[#EFE4D6] text-[#194343] py-20 lg:py-28 border-b border-[#663B1B]/20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#663B1B]">
            Jewellery & Occasion Intelligence
          </p>
          <h2 className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#194343]">
            Complete the look.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194343]/75">
            True styling doesn’t end with clothes. SkinTune considers how your jewellery metals, scale, and neckline geometries orchestrate for every specific occasion.
          </p>
        </div>

        {/* Occasion Selection Chips */}
        <div className="mt-12 flex flex-wrap justify-center gap-2.5">
          {occasionList.map((occ) => {
            const active = selectedOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                onClick={() => setSelectedOccasion(occ)}
                className={`focus-ring rounded-full px-6 py-2.5 text-sm font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#194343] text-[#D7BD9B] shadow-md scale-105'
                    : 'bg-white/80 text-[#194343]/75 hover:bg-white hover:text-[#194343]'
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>

        {/* Feature Showcase Grid */}
        <div className="mt-12 grid gap-10 lg:grid-cols-2 items-center">
          {/* Left: Detail Information Card */}
          <div className="rounded-3xl border border-[#663B1B]/20 bg-white/75 p-8 sm:p-10 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#663B1B]/15 pb-4">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-[#194343] text-[#D7BD9B]">
                  <Gem size={16} />
                </span>
                <span className="font-serif text-xl font-bold text-[#194343]">
                  {current.name} Styling Protocol
                </span>
              </div>
              <span className="rounded-full bg-[#663B1B]/15 px-3 py-1 text-xs font-bold text-[#663B1B]">
                Curated Harmony
              </span>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#663B1B]">
                  Recommended Metal
                </p>
                <p className="mt-1 text-lg font-serif font-semibold text-[#194343]">
                  {current.metal}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#663B1B]">
                  Jewellery Strategy
                </p>
                <p className="mt-1 text-sm font-medium text-[#194343]/85 leading-relaxed">
                  {current.jewelleryFocus}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#663B1B]">
                  Neckline Compatibility
                </p>
                <p className="mt-1 text-sm font-medium text-[#194343]/85 leading-relaxed">
                  {current.necklineMatch}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#663B1B]">
                  Occasion Atmosphere
                </p>
                <p className="mt-1 text-sm text-[#194343]/75 leading-relaxed">
                  {current.vibe}
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#663B1B]/15 flex flex-wrap gap-2">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#663B1B]/20 bg-[#663B1B]/10 px-3 py-1 text-xs font-semibold text-[#663B1B]"
                >
                  ✓ {tag}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                if (onQuickStart) {
                  onQuickStart(current.name);
                } else {
                  onStart();
                }
              }}
              className="mt-8 w-full flex items-center justify-center gap-2 rounded-full bg-[#194343] py-3.5 text-sm font-bold text-[#D7BD9B] transition hover:bg-[#143838]"
            >
              <span>Get Recommendations for {current.name}</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Right: Editorial Flatlay / Product Visual */}
          <div className="relative overflow-hidden rounded-3xl border border-[#663B1B]/30 bg-[#194343] p-2 shadow-2xl">
            <div className="relative aspect-[4/3] sm:aspect-square w-full overflow-hidden rounded-[1.6rem] bg-[#194343]">
              <img
                src={current.image}
                alt={`${current.name} jewellery and accessories inspiration`}
                className="size-full object-cover transition duration-700 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#194343]/80 via-transparent to-transparent" />

              <div className="absolute bottom-5 inset-x-5 rounded-2xl border border-[#663B1B]/60 bg-[#194343]/95 p-4 text-[#D7BD9B] backdrop-blur-md">
                <p className="text-[10px] uppercase font-bold tracking-widest text-[#D7BD9B]">
                  Occasion-Synchronized
                </p>
                <p className="font-serif text-lg font-semibold mt-0.5 text-[#D7BD9B]">
                  Complete {current.name} Ensemble
                </p>
                <p className="text-xs text-[#D7BD9B]/75 mt-1">
                  Coordinated metals, bag proportions, and footwear heights.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
