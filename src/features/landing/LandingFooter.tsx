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
    <footer className="border-t border-[#B08A70]/30 bg-[#F0E5D5] text-[#194A49] py-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand Col */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-[#D9BC96] text-[#194A49] shadow-sm">
                <Sparkles size={18} strokeWidth={2.5} />
              </span>
              <span className="font-serif text-2xl font-bold tracking-tight text-[#194A49]">
                LetStyle
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#194A49]/75">
              AI-powered personal styling and beauty intelligence platform. Discover the makeup, outfits, jewellery, hairstyles, and color palettes that complement your natural self.
            </p>
            <p className="mt-4 text-xs text-[#795548]">
              Made for getting dressed, not getting judged.
            </p>
          </div>

          {/* Navigation Col */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#795548]">
              Explore
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#194A49]/75">
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('categories')}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  Styling Capabilities
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('how-it-works')}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('looks-showcase')}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  Look Possibilities
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('beauty-section')}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  Beauty & Makeup
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollTo('color-palette')}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  Color Palette System
                </button>
              </li>
            </ul>
          </div>

          {/* Product & Legal Col */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#795548]">
              Platform & Trust
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#194A49]/75">
              <li>
                <button
                  type="button"
                  onClick={onStart}
                  className="hover:text-[#194A49] font-medium transition-colors inline-flex items-center gap-1"
                >
                  Style Your Way <ArrowUpRight size={13} />
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onPrivacy}
                  className="hover:text-[#194A49] hover:underline underline-offset-4 transition-colors"
                >
                  Privacy, Plainly
                </button>
              </li>
              <li>
                <span className="text-[#795548] text-xs block mt-2">
                  In-browser prototype. Photos and styling profiles are kept strictly on your local device.
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[#B08A70]/30 pt-8 text-xs text-[#795548] sm:flex-row">
          <span>© 2025 LetStyle. All rights reserved.</span>
          <span>Teal · Mocha · Linen</span>
        </div>
      </div>
    </footer>
  );
}
