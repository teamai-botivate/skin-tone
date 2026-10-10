'use client';
import { useState } from 'react';
import { Sparkles, Check, ArrowRight, Heart, Gem, Scissors, Shirt, Palette } from 'lucide-react';

interface LookShowcaseProps {
  onStart: () => void;
  onQuickStart?: (occasion: string) => void;
}

interface ShowcaseLook {
  id: string;
  occasion: string;
  title: string;
  tagline: string;
  image?: string;
  palette: string[];
  confidence: number;
  outfit: string;
  jewellery: string;
  hair: string;
  makeup: string;
  footwear: string;
  reasoning: string;
}

export function LookShowcase({ onStart, onQuickStart }: LookShowcaseProps) {
  const [activeOccasion, setActiveOccasion] = useState<string>('Casual');

  const looks: Record<string, ShowcaseLook> = {
    Casual: {
      id: 'look-casual',
      occasion: 'Casual',
      title: 'Quietly Magnetic',
      tagline: 'Soft structure, warm earthy contrast, effortless everyday polish.',
      image: '/images/hero-model.jpg',
      palette: ['#194343', '#663B1B', '#D7BD9B', '#F2EBDD'],
      confidence: 96,
      outfit: 'Sage linen tiered midi dress with structured waist tie and soft shoulder volume.',
      jewellery: 'Brushed gold huggie earrings and delicate double-layer paperclip chain.',
      hair: 'Soft textured bun with face-framing tendrils.',
      makeup: 'Hydrated skin tint, soft terracotta lip balm, and peach cheek flush.',
      footwear: 'Woven leather slide or almond-toe mule.',
      reasoning: 'Grounded sage and antique gold harmonize with warm undertones while keeping movement effortless.',
    },
    Work: {
      id: 'look-work',
      occasion: 'Work',
      title: 'Tailored Precision',
      tagline: 'Quiet architectural lines with composed, confident presence.',
      image: '/images/cat-women.jpg',
      palette: ['#194343', '#663B1B', '#D7BD9B', '#E4DCD3'],
      confidence: 94,
      outfit: 'Fluid forest blazer layered over an ivory ribbed silk knit and tailored charcoal trouser.',
      jewellery: 'Slim geometric gold signet ring and minimalist sculptural dome earrings.',
      hair: 'Sleek low ponytail with clean center part.',
      makeup: 'Velvet-satin base, defined brow architecture, and warm nude-rose lip.',
      footwear: 'Polished almond loafer or block-heel slingback.',
      reasoning: 'Deep forest creates executive grounding while gold accents bring warmth to boardroom lighting.',
    },
    'Date Night': {
      id: 'look-date',
      occasion: 'Date Night',
      title: 'The Considered Entrance',
      tagline: 'Sensory drape, rich tones, and magnetic candlelit glow.',
      image: '/images/cat-accessories.jpg',
      palette: ['#194343', '#663B1B', '#4A2825', '#D7BD9B'],
      confidence: 95,
      outfit: 'Fluid silk slip dress in deep emerald layered with a soft cashmere wrap.',
      jewellery: 'Layered antique gold crescent necklace and faceted emerald pendant.',
      hair: 'Lived-in soft waves with subtle shine gloss.',
      makeup: 'Soft smoked eye pencil, illuminated high points, and rich berry-tinted gloss.',
      footwear: 'Strappy metallic kitten heel.',
      reasoning: 'Rich jewel tones catch evening light and draw attention to facial warmth and neckline.',
    },
    Festive: {
      id: 'look-festive',
      occasion: 'Festive',
      title: 'Radiant Festive',
      tagline: 'Luxe heritage textures, heirloom warmth, and celebration elegance.',
      image: '/images/occasion-festive.jpg',
      palette: ['#194343', '#663B1B', '#8A2B3D', '#D7BD9B'],
      confidence: 98,
      outfit: 'Raw silk ensemble in ivory and antique gold borders with subtle emerald embroidery.',
      jewellery: 'Statement kundan or filigree gold choker with matching jhumkas.',
      hair: 'Floral-pinned low updo or classic blowout.',
      makeup: 'Luminous high-definition base, warm gold shimmer lid wash, and cinnamon-rose lip.',
      footwear: 'Embroidered jutti or metallic block heel.',
      reasoning: 'Celebrates cultural richness with balanced jewelry proportions that complement, not overwhelm.',
    },
    Party: {
      id: 'look-party',
      occasion: 'Party',
      title: 'Low-Light Polish',
      tagline: 'High-contrast impact with clean lines and midnight edge.',
      image: '/images/occasion-party.jpg',
      palette: ['#194343', '#663B1B', '#D7BD9B', '#242426'],
      confidence: 92,
      outfit: 'Asymmetric satin top in deep olive paired with fluid wide-leg trouser.',
      jewellery: 'Chunky brushed gold collar and statement ear cuffs.',
      hair: 'High polished ponytail with sleek edges.',
      makeup: 'Sharply defined feline eye, glassy highlighter, and deep spiced-nude lip.',
      footwear: 'Architectural pointed heel.',
      reasoning: 'Statement silhouette and metallic focus designed specifically for dynamic party lighting.',
    },
  };

  const current = looks[activeOccasion] || looks['Casual'];

  const occasionsList = ['Casual', 'Work', 'Date Night', 'Festive', 'Party'];

  return (
    <section id="looks-showcase" className="bg-[#EFE4D6] text-[#194343] py-20 lg:py-28 border-b border-[#663B1B]/20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#663B1B]">
              Personalized Looks & OOTDs
            </p>
            <h2 className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#194343]">
              One person. <br />
              Different possibilities.
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194343]/75">
              Notice how the outfit, jewellery metals, makeup intensity, and color balance seamlessly adapt across moments — while keeping your personal identity front and center.
            </p>
          </div>

          {/* Start style button */}
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-[#194343] px-6 py-3 text-sm font-bold text-[#D7BD9B] shadow-md transition hover:bg-[#663B1B]"
          >
            Create My 5 Looks <ArrowRight size={15} />
          </button>
        </div>

        {/* Occasion Filter Tabs */}
        <div className="mt-12 flex flex-wrap gap-2.5 border-b border-[#663B1B]/20 pb-4">
          {occasionsList.map((occ) => {
            const active = activeOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                onClick={() => setActiveOccasion(occ)}
                className={`focus-ring rounded-full px-5 py-2.5 text-sm font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#194343] text-[#D7BD9B] shadow-md scale-105'
                    : 'bg-white/80 text-[#194343]/70 hover:bg-white hover:text-[#194343]'
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>

        {/* Detailed Look Feature Layout */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          {/* Visual Showcase Card */}
          <div className="group relative overflow-hidden rounded-[2rem] border border-[#663B1B]/30 bg-[#194343] p-2 shadow-xl">
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.6rem] bg-[#194343]/30">
              {current.image ? (
                <img
                  src={current.image}
                  alt={`${current.title} visual demonstration`}
                  className="size-full object-cover object-center transition duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-[#194343]">
                  <Sparkles size={40} className="text-[#D7BD9B]" />
                </div>
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#194343]/95 via-black/10 to-transparent" />

              {/* Floating occasion pill */}
              <div className="absolute top-4 left-4 rounded-full bg-[#194343]/85 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#D7BD9B] backdrop-blur-md border border-[#663B1B]">
                {current.occasion} Look
              </div>

              {/* Confidence Match Badge */}
              <div className="absolute top-4 right-4 rounded-full bg-[#663B1B]/90 px-3 py-1 text-xs font-bold text-[#D7BD9B] backdrop-blur-md">
                {current.confidence}% Confidence
              </div>

              {/* Bottom Card Summary */}
              <div className="absolute bottom-4 inset-x-4 rounded-2xl border border-[#663B1B]/50 bg-[#194343]/95 p-4 backdrop-blur-md text-[#D7BD9B]">
                <p className="font-serif text-2xl font-bold text-[#D7BD9B]">{current.title}</p>
                <p className="text-xs text-[#D7BD9B]/70 mt-1">{current.tagline}</p>
                <div className="mt-3 flex items-center justify-between border-t border-[#663B1B]/60 pt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#D7BD9B]/75">Palette:</span>
                    {current.palette.map((color, idx) => (
                      <span
                        key={`${color}-${idx}`}
                        className="size-4 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold text-[#D7BD9B]">Harmonized Formula</span>
                </div>
              </div>
            </div>
          </div>

          {/* Structured Look Details Grid */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#663B1B]">
                <Sparkles size={14} className="text-[#663B1B]" />
                <span>Pillar Breakdown</span>
              </div>
              <h3 className="mt-2 font-serif text-3xl font-bold tracking-tight text-[#194343]">
                {current.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#194343]/80">
                {current.tagline}
              </p>

              {/* 4 Category Spec Cards */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {/* Outfit */}
                <div className="rounded-2xl border border-[#663B1B]/20 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#194343]/15 text-[#194343]">
                      <Shirt size={14} />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#194343]/60">Outfit & Fit</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#194343] leading-snug">
                    {current.outfit}
                  </p>
                </div>

                {/* Jewellery */}
                <div className="rounded-2xl border border-[#663B1B]/20 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#663B1B]/20 text-[#663B1B]">
                      <Gem size={14} />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#194343]/60">Jewellery</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#194343] leading-snug">
                    {current.jewellery}
                  </p>
                </div>

                {/* Makeup */}
                <div className="rounded-2xl border border-[#663B1B]/20 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#663B1B]/20 text-[#663B1B]">
                      <Sparkles size={14} />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#194343]/60">Makeup Formula</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#194343] leading-snug">
                    {current.makeup}
                  </p>
                </div>

                {/* Hairstyle */}
                <div className="rounded-2xl border border-[#663B1B]/20 bg-white/75 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-[#194343]/15 text-[#194343]">
                      <Scissors size={14} />
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#194343]/60">Hairstyle</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[#194343] leading-snug">
                    {current.hair}
                  </p>
                </div>
              </div>

              {/* Reasoning Box */}
              <div className="mt-5 rounded-2xl border border-[#663B1B]/30 bg-[#663B1B]/10 p-4.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#663B1B]">
                  Why SkinTune Chose This
                </p>
                <p className="mt-1.5 text-sm text-[#194343]/85 leading-relaxed">
                  {current.reasoning}
                </p>
              </div>
            </div>

            {/* Quick Action Button for this occasion */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  if (onQuickStart) {
                    onQuickStart(current.occasion);
                  } else {
                    onStart();
                  }
                }}
                className="flex items-center gap-2 rounded-full bg-[#663B1B] px-6 py-3 text-sm font-bold text-[#D7BD9B] transition hover:bg-[#522f15]"
              >
                <span>Style Me for {current.occasion}</span>
                <ArrowRight size={15} />
              </button>
              <span className="text-xs text-[#194343]/60">
                Adapts instantly to your personal build & coloring
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
