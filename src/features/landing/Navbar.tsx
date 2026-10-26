'use client';
import { useState } from 'react';
import { Sparkles, Menu, X, ArrowRight, ShieldCheck, User } from 'lucide-react';
import { UserMenu } from '@/features/auth';

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
    <header className="sticky top-0 z-40 w-full border-b border-[#B08A70]/30 bg-[#F0E5D5]/95 backdrop-blur-md transition-colors duration-200">
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
          aria-label="LetStyle Homepage"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#D9BC96] to-[#B08A70] text-[#194A49] shadow-sm transition-transform duration-200 group-hover:scale-105">
            <Sparkles size={18} strokeWidth={2.5} />
          </span>
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-bold tracking-tight text-[#194A49] transition-colors group-hover:text-[#194A49]/80">
              LetStyle
            </span>
            <span className="text-[9px] uppercase tracking-[0.24em] text-[#795548] font-semibold -mt-1">
              Personal Styling AI
            </span>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main Navigation">
          <button
            type="button"
            onClick={() => scrollToSection('categories')}
            className="text-sm font-medium text-[#194A49]/80 transition-colors hover:text-[#194A49]"
          >
            Discover
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('how-it-works')}
            className="text-sm font-medium text-[#194A49]/80 transition-colors hover:text-[#194A49]"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('looks-showcase')}
            className="text-sm font-medium text-[#194A49]/80 transition-colors hover:text-[#194A49]"
          >
            Styling
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('beauty-section')}
            className="text-sm font-medium text-[#194A49]/80 transition-colors hover:text-[#194A49]"
          >
            Beauty
          </button>
        </nav>

        {/* Right CTA Area */}
        <div className="hidden items-center gap-4 md:flex">
          <UserMenu />

          <button
            type="button"
            onClick={onPrivacy}
            data-testid="button-welcome-privacy"
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#795548] transition-colors hover:text-[#194A49]"
          >
            <ShieldCheck size={14} className="text-[#795548]" />
            Privacy
          </button>

          {hasExistingProfile && onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="flex items-center gap-1.5 rounded-full border border-[#B08A70]/50 bg-[#B08A70]/15 px-4 py-2 text-xs font-bold text-[#194A49] transition hover:bg-[#B08A70]/25"
            >
              <User size={13} />
              My Journal
            </button>
          )}

          <button
            type="button"
            onClick={onStart}
            data-testid="button-navbar-start"
            className="group flex items-center gap-2 rounded-full bg-[#D9BC96] px-5 py-2.5 text-sm font-bold text-[#194A49] shadow-[0_4px_14px_rgba(217,188,150,0.35)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#cfaf86] hover:shadow-[0_6px_20px_rgba(217,188,150,0.45)]"
          >
            <span>Style Your Way</span>
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile Menu Hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="grid size-10 place-items-center rounded-lg border border-[#B08A70]/50 text-[#194A49] hover:bg-[#B08A70]/20 md:hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-b border-[#B08A70]/30 bg-[#F0E5D5] px-6 py-6 text-[#194A49] md:hidden animate-rise">
          <nav className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => scrollToSection('categories')}
              className="text-left text-base font-medium text-[#194A49]/90 hover:text-[#194A49]"
            >
              Discover
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('how-it-works')}
              className="text-left text-base font-medium text-[#194A49]/90 hover:text-[#194A49]"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('looks-showcase')}
              className="text-left text-base font-medium text-[#194A49]/90 hover:text-[#194A49]"
            >
              Styling & Looks
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('beauty-section')}
              className="text-left text-base font-medium text-[#194A49]/90 hover:text-[#194A49]"
            >
              Beauty & Makeup
            </button>
            <div className="my-2 border-t border-[#B08A70]/30 pt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-bold text-[#194A49]">Account</span>
                <UserMenu />
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onPrivacy();
                }}
                className="flex items-center gap-2 text-left text-sm text-[#795548] hover:text-[#194A49]"
              >
                <ShieldCheck size={16} className="text-[#795548]" />
                Privacy & Data
              </button>
              {hasExistingProfile && onGoHome && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onGoHome();
                  }}
                  className="flex items-center justify-center gap-2 rounded-full border border-[#B08A70]/50 bg-[#B08A70]/15 py-3 text-sm font-semibold text-[#194A49]"
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
                className="flex items-center justify-center gap-2 rounded-full bg-[#D9BC96] py-3 text-sm font-bold text-[#194A49] shadow-sm hover:bg-[#cfaf86]"
              >
                Style Your Way <ArrowRight size={15} />
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
