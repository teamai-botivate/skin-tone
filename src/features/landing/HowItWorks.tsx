'use client';
import { UserCheck, Sparkles, Wand2, ArrowRight } from 'lucide-react';

interface HowItWorksProps {
  onStart: () => void;
}

export function HowItWorks({ onStart }: HowItWorksProps) {
  const steps = [
    {
      step: '01',
      title: 'Tell us about you',
      subtitle: 'Preferences & Context',
      description:
        'Share your build, fit preferences, colors you love or avoid, and the occasion you are getting dressed for. You can optionally include a natural selfie to help us understand skin undertone and natural contrast.',
      icon: UserCheck,
      details: ['Natural photo check', 'Build & fit comfort', 'Occasion & budget'],
    },
    {
      step: '02',
      title: 'Let AI understand your style',
      subtitle: 'Harmony & Proportions',
      description:
        'LetStyle analyzes visible styling harmony — matching undertones with color palettes, neckline cuts with jewellery proportions, and facial framing with flattering hairstyles and makeup.',
      icon: Sparkles,
      details: ['Undertone calibration', 'Silhouette balancing', 'Jewellery & makeup pairing'],
    },
    {
      step: '03',
      title: 'Get your personalized look',
      subtitle: '5 Complete Look Strategies',
      description:
        'Receive 5 curated look strategies complete with outfits, jewellery, makeup, hair, and accessories — rendered visually so you can preview exactly how the look comes together before you wear it.',
      icon: Wand2,
      details: ['Full piece-by-piece breakdown', 'Visual style rendering', 'Interactive refinements'],
    },
  ];

  return (
    <section id="how-it-works" className="relative bg-[#F0E5D5] text-[#194A49] py-7 sm:py-10 lg:py-14 overflow-hidden border-b border-[#B08A70]/30">
      {/* Background glow */}
      <div className="pointer-events-none absolute right-0 top-1/2 size-72 sm:size-96 rounded-full bg-[#D9BC96]/20 blur-[140px]" />
      <div className="pointer-events-none absolute left-0 bottom-0 size-60 sm:size-80 rounded-full bg-[#B08A70]/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-xl">
          <p className="text-[9px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#795548]">
            The Experience
          </p>
          <h2 className="mt-1.5 font-serif text-[clamp(1.4rem,3vw,2.4rem)] leading-[1.1] tracking-tight text-[#194A49]">
            Personal styling in <br className="hidden sm:inline" />
            three thoughtful steps.
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#194A49]/75">
            Designed for getting dressed with calm confidence — without subscription traps or judgmental scores.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="mt-5 sm:mt-7 grid gap-3 sm:gap-4 lg:grid-cols-3">
          {steps.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="group relative flex flex-col justify-between rounded-xl sm:rounded-2xl border border-[#B08A70]/30 bg-white/85 p-3.5 sm:p-4.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#B08A70]/60 hover:bg-white hover:shadow-md"
              >
                <div>
                  {/* Step Number & Icon */}
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#194A49]">
                      {item.step}
                    </span>
                    <span className="grid size-7 sm:size-8 place-items-center rounded-lg border border-[#B08A70]/40 bg-[#B08A70]/15 text-[#194A49] transition-transform duration-300 group-hover:scale-105">
                      <Icon size={14} />
                    </span>
                  </div>

                  {/* Step Title & Subtitle */}
                  <p className="mt-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#795548]">
                    {item.subtitle}
                  </p>
                  <h3 className="mt-0.5 font-serif text-sm sm:text-base font-bold text-[#194A49]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-[#194A49]/75 line-clamp-2 sm:line-clamp-3">
                    {item.description}
                  </p>
                </div>

                {/* Step Details List */}
                <div className="mt-2.5 border-t border-[#B08A70]/20 pt-2">
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 sm:block sm:space-y-1">
                    {item.details.map((detail) => (
                      <li key={detail} className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#194A49]/80">
                        <span className="size-1 rounded-full bg-[#795548]" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA Banner */}
        <div className="mt-5 sm:mt-8 flex flex-col items-start sm:items-center justify-between gap-3 rounded-xl border border-[#B08A70]/40 bg-white/70 p-3 sm:px-5 sm:py-3.5 backdrop-blur-md sm:flex-row shadow-sm">
          <div>
            <p className="font-serif text-xs sm:text-sm font-semibold text-[#194A49]">
              Ready to experience personal styling tuned to you?
            </p>
            <p className="text-[10px] sm:text-[11px] text-[#795548] mt-0.5">
              Takes approximately 3 minutes. Your data stays in your browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#D9BC96] px-4 py-2 text-xs sm:text-sm font-bold text-[#194A49] transition-all hover:bg-[#cfaf86] hover:shadow-md shadow-sm shrink-0"
          >
            Style Your Way <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </section>
  );
}
