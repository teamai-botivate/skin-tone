'use client';
import { Navbar } from './Navbar';
import { HeroSection } from './HeroSection';
import { StyleCategories } from './StyleCategories';
import { HowItWorks } from './HowItWorks';
import { LookShowcase } from './LookShowcase';
import { BeautySection } from './BeautySection';
import { OccasionSection } from './OccasionSection';
import { ColorPaletteSection } from './ColorPaletteSection';
import { AiVisualizationSection } from './AiVisualizationSection';
import { FinalCTA } from './FinalCTA';
import { LandingFooter } from './LandingFooter';

export interface LandingPageProps {
  onStart: () => void;
  onPrivacy: () => void;
  onQuickStart?: (occasion: string) => void;
  hasExistingProfile?: boolean;
  onGoHome?: () => void;
}

export function LandingPage({
  onStart,
  onPrivacy,
  onQuickStart,
  hasExistingProfile,
  onGoHome,
}: LandingPageProps) {
  const scrollToCategories = () => {
    const el = document.getElementById('categories');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#194343] text-[#D7BD9B] selection:bg-[#663B1B] selection:text-[#D7BD9B]">
      {/* 1. Navbar */}
      <Navbar
        onStart={onStart}
        onPrivacy={onPrivacy}
        hasExistingProfile={hasExistingProfile}
        onGoHome={onGoHome}
      />

      {/* 2. Hero Section */}
      <HeroSection
        onStart={onStart}
        onExplore={scrollToCategories}
      />

      {/* 3. What can SkinTune style for you? (Categories) */}
      <StyleCategories
        onStart={onStart}
      />

      {/* 4. How It Works (3 Steps) */}
      <HowItWorks
        onStart={onStart}
      />

      {/* 5. Personalized Look / OOTD Showcase */}
      <LookShowcase
        onStart={onStart}
        onQuickStart={onQuickStart}
      />

      {/* 6. Beauty + Makeup Section */}
      <BeautySection
        onStart={onStart}
      />

      {/* 7. Jewellery + Occasion Section */}
      <OccasionSection
        onStart={onStart}
        onQuickStart={onQuickStart}
      />

      {/* 8. Personal Color Palette */}
      <ColorPaletteSection
        onStart={onStart}
      />

      {/* 9. AI-Generated Looks / Visualizations */}
      <AiVisualizationSection
        onStart={onStart}
      />

      {/* 10. Final CTA */}
      <FinalCTA
        onStart={onStart}
      />

      {/* 11. Footer */}
      <LandingFooter
        onStart={onStart}
        onPrivacy={onPrivacy}
      />
    </div>
  );
}
