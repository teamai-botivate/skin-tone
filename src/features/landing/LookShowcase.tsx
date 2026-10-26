'use client';
import { useState, useRef, useEffect } from 'react';
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
  }, [mounted, videoError, activeOccasion]);

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
    <section id="looks-showcase" className="bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 border-b border-[#B08A70]/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#795548]">
              Personalized Looks & OOTDs
            </p>
            <h2 className="mt-1.5 font-serif text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.1] tracking-tight text-[#194A49]">
              One person. <br />
              Different possibilities.
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#194A49]/75">
              Notice how the outfit, jewellery metals, makeup intensity, and color balance seamlessly adapt across moments — while keeping your personal identity front and center.
            </p>
          </div>

          {/* Start style button */}
          <button
            type="button"
            onClick={onStart}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-[#194A49] shadow-sm transition hover:bg-[#cfaf86] shrink-0"
          >
            Create My 5 Looks <ArrowRight size={13} />
          </button>
        </div>

        {/* Occasion Filter Tabs */}
        <div className="mt-4 sm:mt-6 flex flex-wrap gap-1.5 sm:gap-2 border-b border-[#B08A70]/20 pb-2.5">
          {occasionsList.map((occ) => {
            const active = activeOccasion === occ;
            return (
              <button
                key={occ}
                type="button"
                onClick={() => setActiveOccasion(occ)}
                className={`focus-ring rounded-full px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-bold transition-all duration-200 ${
                  active
                    ? 'bg-[#194A49] text-[#F0E5D5] shadow-sm scale-105'
                    : 'bg-white/80 text-[#194A49]/70 hover:bg-white hover:text-[#194A49] border border-[#B08A70]/30'
                }`}
              >
                {occ}
              </button>
            );
          })}
        </div>

        {/* Detailed Look Feature Layout */}
        <div className="mt-5 sm:mt-7 grid gap-5 sm:gap-7 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          {/* Visual Showcase Card with Horizontal Video */}
          <div className="group relative overflow-hidden rounded-xl sm:rounded-[2rem] border border-[#B08A70]/30 bg-white/85 p-1.5 sm:p-2 shadow-lg">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg sm:rounded-[1.6rem] bg-[#F0E5D5]">
              {mounted && !videoError ? (
                <video
                  ref={videoRef}
                  poster={current.image || '/images/hero-model.jpg'}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  onError={() => setVideoError(true)}
                  className="size-full object-cover object-center transition duration-500 group-hover:scale-105"
                >
                  <source src="/model-video2.mp4" type="video/mp4" onError={() => setVideoError(true)} />
                </video>
              ) : (
                <img
                  src={current.image || '/images/hero-model.jpg'}
                  alt={`${current.title} visual demonstration`}
                  className="size-full object-cover object-center transition duration-500 group-hover:scale-105"
                />
              )}
              {/* Ambient vignette overlay */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />

              {/* Floating occasion pill */}
              <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 rounded-full bg-white/90 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#194A49] backdrop-blur-md border border-[#B08A70]/50 shadow-sm">
                {current.occasion} Look
              </div>

              {/* Confidence Match Badge */}
              <div className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 rounded-full bg-[#194A49] px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-[#F0E5D5] backdrop-blur-md shadow-sm">
                {current.confidence}% Confidence
              </div>

              {/* Sleek bottom summary strip */}
              <div className="absolute bottom-2 inset-x-2 sm:bottom-3 sm:inset-x-3 rounded-lg sm:rounded-xl border border-[#B08A70]/30 bg-white/90 px-3 py-1.5 sm:px-3.5 sm:py-2 backdrop-blur-md text-[#194A49] shadow-md flex items-center justify-between">
                <div>
                  <p className="font-serif text-xs sm:text-sm font-bold text-[#194A49]">{current.title}</p>
                  <p className="text-[10px] text-[#795548] line-clamp-1">{current.tagline}</p>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 pl-2">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#795548] hidden sm:inline">Palette:</span>
                  {current.palette.map((color, idx) => (
                    <span
                      key={`${color}-${idx}`}
                      className="size-3 sm:size-3.5 rounded-full border border-black/15 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Structured Look Details Grid */}
          <div className="flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#795548]">
                <Sparkles size={13} className="text-[#795548]" />
                <span>Pillar Breakdown</span>
              </div>
              <h3 className="mt-1 font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#194A49]">
                {current.title}
              </h3>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[#194A49]/80">
                {current.tagline}
              </p>

              {/* 4 Category Spec Cards */}
              <div className="mt-4 sm:mt-5 grid gap-2.5 sm:grid-cols-2">
                {/* Outfit */}
                <div className="rounded-xl border border-[#B08A70]/30 bg-white/85 p-2.5 sm:p-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="grid size-6 sm:size-7 place-items-center rounded-lg bg-[#B08A70]/15 text-[#194A49]">
                      <Shirt size={13} />
                    </span>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#795548]">Outfit & Fit</p>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-[#194A49] leading-snug">
                    {current.outfit}
                  </p>
                </div>

                {/* Jewellery */}
                <div className="rounded-xl border border-[#B08A70]/30 bg-white/85 p-2.5 sm:p-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="grid size-6 sm:size-7 place-items-center rounded-lg bg-[#B08A70]/15 text-[#194A49]">
                      <Gem size={13} />
                    </span>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#795548]">Jewellery</p>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-[#194A49] leading-snug">
                    {current.jewellery}
                  </p>
                </div>

                {/* Makeup */}
                <div className="rounded-xl border border-[#B08A70]/30 bg-white/85 p-2.5 sm:p-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="grid size-6 sm:size-7 place-items-center rounded-lg bg-[#B08A70]/15 text-[#194A49]">
                      <Sparkles size={13} />
                    </span>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#795548]">Makeup Formula</p>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-[#194A49] leading-snug">
                    {current.makeup}
                  </p>
                </div>

                {/* Hairstyle */}
                <div className="rounded-xl border border-[#B08A70]/30 bg-white/85 p-2.5 sm:p-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="grid size-6 sm:size-7 place-items-center rounded-lg bg-[#B08A70]/15 text-[#194A49]">
                      <Scissors size={13} />
                    </span>
                    <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#795548]">Hairstyle</p>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm font-semibold text-[#194A49] leading-snug">
                    {current.hair}
                  </p>
                </div>
              </div>

              {/* Reasoning Box */}
              <div className="mt-3 rounded-xl border border-[#B08A70]/30 bg-[#B08A70]/10 p-3 text-[#194A49]">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                  Why LetStyle Chose This
                </p>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#194A49]/85 leading-relaxed">
                  {current.reasoning}
                </p>
              </div>
            </div>

            {/* Quick Action Button for this occasion */}
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3.5">
              <button
                type="button"
                onClick={() => {
                  if (onQuickStart) {
                    onQuickStart(current.occasion);
                  } else {
                    onStart();
                  }
                }}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-[#194A49] transition hover:bg-[#cfaf86] shadow-sm"
              >
                <span>Style Me for {current.occasion}</span>
                <ArrowRight size={13} />
              </button>
              <span className="text-[10px] sm:text-xs text-[#795548]">
                Adapts instantly to your personal build & coloring
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
