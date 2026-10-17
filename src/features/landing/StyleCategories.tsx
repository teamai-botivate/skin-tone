'use client';
import { Sparkles, Shirt, Gem, Scissors, Palette, Calendar, ArrowUpRight } from 'lucide-react';

interface StyleCategoriesProps {
  onSelectCategory?: (category: string) => void;
  onStart: () => void;
}

export function StyleCategories({ onSelectCategory, onStart }: StyleCategoriesProps) {
  const categories = [
    {
      id: 'makeup',
      title: 'MAKEUP',
      headline: 'Find shades, styles and looks that complement you.',
      description: 'Personalized recommendations for base finishes, flattering lip tones, complementary eye definitions, and blush placement calibrated to your natural undertone.',
      icon: Sparkles,
      tag: 'Beauty Intelligence',
      highlights: ['Base & Skin Tint', 'Lip Shades', 'Eye Depth', 'Blush Sculpting'],
      badgeColor: 'border-[#B08A70]/50 text-[#795548]',
      accentBg: 'bg-[#B08A70]/10',
    },
    {
      id: 'outfits',
      title: 'OUTFITS',
      headline: 'Discover OOTDs built around your body, preferences and occasion.',
      description: 'Proportion-first styling recommendations that respect your build, comfort level, and aesthetic preferences without forcing trend-driven silhouettes.',
      icon: Shirt,
      tag: 'Wardrobe & Fit',
      highlights: ['Body Proportions', 'Fabric Drape', 'Layering Guides', 'Shoe Pairings'],
      badgeColor: 'border-[#194A49]/40 text-[#194A49]',
      accentBg: 'bg-[#194A49]/10',
    },
    {
      id: 'jewellery',
      title: 'JEWELLERY',
      headline: 'Find jewellery that works with your features and outfit.',
      description: 'Strategic metal selection (antique gold, champagne, silver) and gemstone pairings matched to your neckline, face shape, and occasion energy.',
      icon: Gem,
      tag: 'Finishing Touches',
      highlights: ['Warm vs Cool Metals', 'Earring Scale', 'Necklace Harmony', 'Curated Stones'],
      badgeColor: 'border-[#B08A70]/50 text-[#795548]',
      accentBg: 'bg-[#B08A70]/10',
    },
    {
      id: 'hair',
      title: 'HAIRSTYLE',
      headline: 'Explore hairstyles that complete your look.',
      description: 'Textures, cuts, and occasion-specific variations that frame your bone structure and balance your outfit’s neckline and volume.',
      icon: Scissors,
      tag: 'Hair & Structure',
      highlights: ['Face-Framing Cuts', 'Texture Pairing', 'Occasion Updos', 'Parting Balance'],
      badgeColor: 'border-[#B08A70]/50 text-[#795548]',
      accentBg: 'bg-[#B08A70]/10',
    },
    {
      id: 'colors',
      title: 'COLORS',
      headline: 'Discover the shades that bring your features to life.',
      description: 'Skin tone and undertone-based color harmony. Uncover the exact hues that illuminate your complexion and the shades best kept away from your face.',
      icon: Palette,
      tag: 'Complexion Harmony',
      highlights: ['Undertone Analysis', 'Contrast Levels', 'Signature Palette', 'Colors to Avoid'],
      badgeColor: 'border-[#194A49]/40 text-[#194A49]',
      accentBg: 'bg-[#194A49]/10',
    },
    {
      id: 'occasions',
      title: 'OCCASIONS',
      headline: 'Get styling ideas for work, dates, parties, weddings and more.',
      description: 'Context-driven styling that understands the unspoken dress code of every moment — from relaxed coffee runs to elevated festive celebrations.',
      icon: Calendar,
      tag: 'Moment-Driven',
      highlights: ['Everyday Casual', 'Office Polish', 'Romantic Dates', 'Festive & Weddings'],
      badgeColor: 'border-[#B08A70]/50 text-[#795548]',
      accentBg: 'bg-[#B08A70]/10',
    },
  ];

  return (
    <section id="categories" className="bg-[#F0E5D5] text-[#194A49] py-20 lg:py-28 border-b border-[#B08A70]/30">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#795548]">
            Comprehensive Appearance Intelligence
          </p>
          <h2 className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,4rem)] leading-[1.05] tracking-tight text-[#194A49]">
            Your complete personal <br className="hidden sm:inline" />
            styling guide.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194A49]/75">
            SkinTune brings beauty and fashion intelligence together in one seamless experience.
            Rather than generic trends, we harmonize what suits your specific coloring, build, and lifestyle.
          </p>
        </div>

        {/* 6 Grid Cards */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.id}
                className="group relative flex flex-col justify-between rounded-3xl border border-[#B08A70]/30 bg-white/80 p-7 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#B08A70]/60 hover:bg-white hover:shadow-xl"
              >
                <div>
                  {/* Card Top: Icon & Badge */}
                  <div className="flex items-center justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-[#194A49] text-[#D9BC96] shadow-sm transition-transform duration-300 group-hover:scale-110">
                      <Icon size={22} strokeWidth={2} />
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${cat.badgeColor}`}>
                      {cat.tag}
                    </span>
                  </div>

                  {/* Card Title & Headline */}
                  <h3 className="mt-6 font-serif text-2xl font-bold tracking-tight text-[#194A49]">
                    {cat.title}
                  </h3>
                  <p className="mt-2 text-base font-semibold leading-snug text-[#795548]">
                    {cat.headline}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-[#194A49]/70">
                    {cat.description}
                  </p>
                </div>

                {/* Highlights tags */}
                <div className="mt-6 border-t border-[#B08A70]/20 pt-5">
                  <div className="flex flex-wrap gap-1.5">
                    {cat.highlights.map((item) => (
                      <span
                        key={item}
                        className="rounded-lg bg-[#194A49]/8 px-2.5 py-1 text-[11px] font-medium text-[#194A49]/80"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  {/* Action Link */}
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectCategory) {
                        onSelectCategory(cat.id);
                      }
                      onStart();
                    }}
                    className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#194A49] transition-colors group-hover:text-[#795548]"
                  >
                    <span>Explore {cat.title}</span>
                    <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
