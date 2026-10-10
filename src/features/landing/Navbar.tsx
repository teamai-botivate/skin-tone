'use client';
import { useState } from 'react';
import { Sparkles, Menu, X, ArrowRight, ShieldCheck, User } from 'lucide-react';

interface NavbarProps {
  onStart: () => void;
  onPrivacy: () => void;
  hasExistingProfile?: boolean;
  onGoHome?: () => void;
}

export function Navbar({ onStart, onPrivacy, hasExistingProfile, onGoHome }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#663B1B]/40 bg-[#194343]/95 backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => {
            if (hasExistingProfile && onGoHome) {
              onGoHome();
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className="group flex items-center gap-2.5 text-left focus:outline-none"
          aria-label="SkinTune Homepage"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#D7BD9B] to-[#bda17e] text-[#194343] shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Sparkles size={18} strokeWidth={2.5} />
          </span>
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#D7BD9B] transition-colors group-hover:text-[#F3E7D8]">
              SkinTune
            </span>
            <span className="text-[9px] uppercase tracking-[0.24em] text-[#D7BD9B]/70 font-semibold -mt-1">
              Personal Styling AI
            </span>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main Navigation">
          <button
            type="button"
            onClick={() => scrollToSection('categories')}
            className="text-sm font-medium text-[#D7BD9B]/80 transition-colors hover:text-[#F3E7D8]"
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('how-it-works')}
            className="text-sm font-medium text-[#D7BD9B]/80 transition-colors hover:text-[#F3E7D8]"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('looks-showcase')}
            className="text-sm font-medium text-[#D7BD9B]/80 transition-colors hover:text-[#F3E7D8]"
          >
            Styling
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('beauty-section')}
            className="text-sm font-medium text-[#D7BD9B]/80 transition-colors hover:text-[#F3E7D8]"
          >
            Beauty
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('color-palette')}
            className="text-sm font-medium text-[#D7BD9B]/80 transition-colors hover:text-[#F3E7D8]"
          >
            Color Palette
          </button>
        </nav>

        {/* Right CTA Area */}
        <div className="hidden items-center gap-4 md:flex">
          <button
            type="button"
            onClick={onPrivacy}
            data-testid="button-welcome-privacy"
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#D7BD9B]/75 transition-colors hover:text-[#D7BD9B]"
          >
            <ShieldCheck size={14} className="text-[#D7BD9B]" />
            Privacy
          </button>

          {hasExistingProfile && onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-1.5 rounded-full border border-[#663B1B] bg-[#663B1B]/40 px-4 py-2 text-xs font-bold text-[#D7BD9B] transition hover:bg-[#663B1B]"
            >
              <User size={13} />
              My Journal
            </button>
          )}

          <button
            type="button"
            onClick={onStart}
            data-testid="button-navbar-start"
            className="group flex items-center gap-2 rounded-full bg-[#D7BD9B] px-5 py-2.5 text-sm font-bold text-[#194343] shadow-[0_4px_14px_rgba(215,189,155,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#e4cdb0] hover:shadow-[0_6px_20px_rgba(215,189,155,0.35)]"
          >
            <span>Start Your Style</span>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile Menu Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="grid size-10 place-items-center rounded-lg border border-[#663B1B] text-[#D7BD9B] hover:bg-[#663B1B]/40 md:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-[#663B1B]/60 bg-[#194343] px-6 py-6 text-[#D7BD9B] md:hidden animate-rise">
          <nav className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => scrollToSection('categories')}
              className="text-left text-base font-medium text-[#D7BD9B]/90 hover:text-[#F3E7D8]"
            >
              Discover
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('how-it-works')}
              className="text-left text-base font-medium text-[#D7BD9B]/90 hover:text-[#F3E7D8]"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('looks-showcase')}
              className="text-left text-base font-medium text-[#D7BD9B]/90 hover:text-[#F3E7D8]"
            >
              Styling & Looks
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('beauty-section')}
              className="text-left text-base font-medium text-[#D7BD9B]/90 hover:text-[#F3E7D8]"
            >
              Beauty & Makeup
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('color-palette')}
              className="text-left text-base font-medium text-[#D7BD9B]/90 hover:text-[#F3E7D8]"
            >
              Color Palette
            </button>
            <div className="my-2 border-t border-[#663B1B]/60 pt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onPrivacy();
                }}
                className="flex items-center gap-2 text-left text-sm text-[#D7BD9B]/75 hover:text-[#D7BD9B]"
              >
                <ShieldCheck size={16} className="text-[#D7BD9B]" />
                Privacy & Data
              </button>
              {hasExistingProfile && onGoHome && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onGoHome();
                  }}
                  className="flex items-center justify-center gap-2 rounded-full border border-[#663B1B] py-3 text-sm font-semibold text-[#D7BD9B]"
                >
                  <User size={15} />
                  My Journal
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onStart();
                }}
                className="flex items-center justify-center gap-2 rounded-full bg-[#D7BD9B] py-3 text-sm font-bold text-[#194343]"
              >
                Start Your Style <ArrowRight size={15} />
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
