'use client';
import { Navbar } from './Navbar';
import { HeroSection } from './HeroSection';
import { OccasionSection } from './OccasionSection';
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
  const scrollToOccasions = () => {
    const el = document.getElementById('occasions');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[#F0E5D5] text-[#194A49] selection:bg-[#D9BC96] selection:text-[#194A49]">
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
        onExplore={scrollToOccasions}
      />

      {/* 3. Jewellery + Occasion Section */}
      <OccasionSection
        onStart={onStart}
        onQuickStart={onQuickStart}
      />

      {/* 4. AI-Generated Looks / Visualizations */}
      <AiVisualizationSection
        onStart={onStart}
      />

      {/* 5. Final CTA */}
      <FinalCTA
        onStart={onStart}
      />

      {/* 6. Footer */}
      <LandingFooter
        onStart={onStart}
        onPrivacy={onPrivacy}
      />
    </div>
  );
}
