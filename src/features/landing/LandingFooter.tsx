'use client';
import { Sparkles, ArrowUpRight } from 'lucide-react';

interface LandingFooterProps {
  onStart: () => void;
  onPrivacy: () => void;
}

export function LandingFooter({ onStart, onPrivacy }: LandingFooterProps) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <footer className="border-t border-[#663B1B]/40 bg-[#194343] text-[#D7BD9B] py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand Col */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#D7BD9B] text-[#194343]">
                <Sparkles size={18} strokeWidth={2.5} />
              </span>
              <span className="font-serif text-2xl font-bold tracking-tight text-[#D7BD9B]">
                SkinTune
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#D7BD9B]/75">
              AI-powered personal styling and beauty intelligence platform. Discover the makeup, outfits, jewellery, hairstyles, and color palettes that complement your natural self.
            </p>
            <p className="mt-4 text-xs text-[#D7BD9B]/60">
              Made for getting dressed, not getting judged.
            </p>
          </div>

          {/* Navigation Col */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D7BD9B]">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#D7BD9B]/75">
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('categories')}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  Styling Capabilities
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('how-it-works')}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('looks-showcase')}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  Look Possibilities
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('beauty-section')}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  Beauty & Makeup
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('color-palette')}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  Color Palette System
                </button>
              </li>
            </ul>
          </div>

          {/* Product & Legal Col */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D7BD9B]">
              Platform & Trust
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#D7BD9B]/75">
              <li>
                <button
                  type="button"
                  onClick={onStart}
                  className="hover:text-[#F3E7D8] transition-colors inline-flex items-center gap-1"
                >
                  Start Your Style <ArrowUpRight size={13} />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onPrivacy}
                  className="hover:text-[#F3E7D8] transition-colors"
                >
                  Privacy, Plainly
                </button>
              </li>
              <li>
                <span className="text-[#D7BD9B]/70 text-xs block mt-2">
                  In-browser prototype. Photos and styling profiles are kept strictly on your local device.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[#663B1B]/40 pt-8 text-xs text-[#D7BD9B]/70 sm:flex-row">
          <span>© 2025 SkinTune. All rights reserved.</span>
          <span>Teal · Mocha · Linen</span>
        </div>
      </div>
    </footer>
  );
}
