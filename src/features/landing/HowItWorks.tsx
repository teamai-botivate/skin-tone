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
    <section id="how-it-works" className="relative bg-[#F0E5D5] text-[#194A49] py-20 lg:py-28 overflow-hidden border-b border-[#B08A70]/30">
      {/* Background glow */}
      <div className="pointer-events-none absolute right-0 top-1/2 size-96 rounded-full bg-[#D9BC96]/25 blur-[140px]" />
      <div className="pointer-events-none absolute left-0 bottom-0 size-80 rounded-full bg-[#B08A70]/15 blur-[120px]" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Section Header */}
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#795548]">
            The Experience
          </p>
          <h2 className="mt-3 font-serif text-[clamp(2.25rem,4.5vw,3.8rem)] leading-[1.05] tracking-tight text-[#194A49]">
            Personal styling in <br />
            three thoughtful steps.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-[#194A49]/75">
            Designed for getting dressed with calm confidence — without subscription traps or judgmental scores.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="group relative flex flex-col justify-between rounded-3xl border border-[#B08A70]/30 bg-white/80 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-[#B08A70]/60 hover:bg-white hover:shadow-xl"
              >
                <div>
                  {/* Step Number & Icon */}
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-4xl font-bold tracking-tight text-[#194A49]">
                      {item.step}
                    </span>
                    <span className="grid size-11 place-items-center rounded-2xl border border-[#B08A70]/40 bg-[#B08A70]/15 text-[#194A49] transition-transform duration-300 group-hover:scale-110">
                      <Icon size={20} />
                    </span>
                  </div>

                  {/* Step Title & Subtitle */}
                  <p className="mt-6 text-xs font-bold uppercase tracking-widest text-[#795548]">
                    {item.subtitle}
                  </p>
                  <h3 className="mt-1 font-serif text-2xl font-bold text-[#194A49]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#194A49]/75">
                    {item.description}
                  </p>
                </div>

                {/* Step Details List */}
                <div className="mt-8 border-t border-[#B08A70]/20 pt-5">
                  <ul className="space-y-2">
                    {item.details.map((detail) => (
                      <li key={detail} className="flex items-center gap-2 text-xs text-[#194A49]/80">
                        <span className="size-1.5 rounded-full bg-[#795548]" />
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
        <div className="mt-14 flex flex-col items-center justify-between gap-6 rounded-2xl border border-[#B08A70]/40 bg-white/70 px-8 py-6 backdrop-blur-md sm:flex-row shadow-sm">
          <div>
            <p className="font-serif text-xl font-semibold text-[#194A49]">
              Ready to experience personal styling tuned to you?
            </p>
            <p className="text-xs text-[#795548] mt-0.5">
              Takes approximately 3 minutes. Your data stays in your browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-[#D9BC96] px-6 py-3 text-sm font-bold text-[#194A49] transition-all hover:bg-[#cfaf86] hover:shadow-lg shadow-sm"
          >
            Start Your Style <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
