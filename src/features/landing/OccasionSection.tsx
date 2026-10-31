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
    <section id="occasions" className="bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 border-b border-[#B08A70]/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#795548]">
            Jewellery & Occasion Intelligence
          </p>
          <h2 className="mt-1.5 font-serif text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.1] tracking-tight text-[#194A49]">
            Complete the look.
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#194A49]/75">
            True styling doesn’t end with clothes. LetStyle considers how your jewellery metals, scale, and neckline geometries orchestrate for every specific occasion.
          </p>
        </div>

        {/* Occasion Selection Chips */}
        <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-1.5 sm:gap-2">
          {occasionList.map((occ) => {
            const active = selectedOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                onClick={() => setSelectedOccasion(occ)}
                className={`focus-ring rounded-full px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#194A49] text-[#F0E5D5] shadow-sm scale-105'
                    : 'bg-white/80 text-[#194A49]/75 hover:bg-white hover:text-[#194A49] border border-[#B08A70]/30'
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>

        {/* Feature Showcase Grid */}
        <div className="mt-6 sm:mt-8 grid gap-5 sm:gap-7 lg:grid-cols-2 items-center">
          {/* Left: Editorial Flatlay / Product Visual */}
          <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-[#B08A70]/30 bg-white/80 p-1.5 sm:p-2 shadow-sm">
            <div className="relative aspect-[16/10] sm:aspect-square w-full overflow-hidden rounded-lg sm:rounded-xl bg-[#F0E5D5]">
              <img
                src={current.image}
                alt={`${current.name} jewellery and accessories inspiration`}
                className="size-full object-cover transition duration-700 hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
            </div>
          </div>

          {/* Right: Detail Information Card */}
          <div className="rounded-xl sm:rounded-2xl border border-[#B08A70]/30 bg-white/85 p-3.5 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#B08A70]/20 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="grid size-6 sm:size-7 place-items-center rounded-lg bg-[#194A49] text-[#D9BC96]">
                  <Gem size={13} />
                </span>
                <span className="font-serif text-sm sm:text-base font-bold text-[#194A49]">
                  {current.name} Styling Protocol
                </span>
              </div>
              <span className="rounded-full bg-[#B08A70]/15 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-[#795548]">
                Curated Harmony
              </span>
            </div>

            <div className="mt-3 space-y-2.5 sm:space-y-3">
              <div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                  Recommended Metal
                </p>
                <p className="mt-0.5 text-sm sm:text-base font-serif font-semibold text-[#194A49]">
                  {current.metal}
                </p>
              </div>

              <div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                  Jewellery Strategy
                </p>
                <p className="mt-0.5 text-xs sm:text-sm font-medium text-[#194A49]/85 leading-relaxed">
                  {current.jewelleryFocus}
                </p>
              </div>

              <div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                  Neckline Compatibility
                </p>
                <p className="mt-0.5 text-xs sm:text-sm font-medium text-[#194A49]/85 leading-relaxed">
                  {current.necklineMatch}
                </p>
              </div>

              <div>
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                  Occasion Atmosphere
                </p>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/75 leading-relaxed line-clamp-2">
                  {current.vibe}
                </p>
              </div>
            </div>

            <div className="mt-3.5 pt-2.5 border-t border-[#B08A70]/20 flex flex-wrap gap-1 sm:gap-1.5">
              {current.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#B08A70]/30 bg-[#B08A70]/10 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-[#795548]"
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
              className="mt-3.5 sm:mt-4 w-full flex items-center justify-center gap-2 rounded-full bg-[#D9BC96] py-2.5 text-xs sm:text-sm font-bold text-[#194A49] transition hover:bg-[#cfaf86] shadow-sm"
            >
              <span>Get Recommendations for {current.name}</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
