'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { useAuth } from '@/features/auth';
import { LandingPage } from '@/features/landing';
import { Home, Settings } from '@/features/settings';
import {
  NameStep,
  SingleChoiceStep,
  MultiChoiceStep,
  SectionStep,
  CustomStyleStep,
  ConsentStep,
  AppearanceStep,
  Review,
  pronounOptions,
  ageGroupOptions,
  styleOptions,
  colorLoveOptions,
  colorAvoidOptions,
  occasionOptions,
  impressionOptions,
  budgetOptions,
} from '@/features/onboarding';
import { PhotoPanel } from '@/features/photo-analysis';
import {
  Generating,
  Results,
  LookDetail,
  Feedback,
  getLookRecommendations,
  generateLookImages,
} from '@/features/recommendations';

type Screen =
  | 'welcome'
  | 'home'
  | 'name'
  | 'profile'
  | 'age'
  | 'consent'
  | 'photo'
  | 'appearance'
  | 'body-style'
  | 'custom-style'
  | 'colors-occasion'
  | 'review'
  | 'generating'
  | 'results'
  | 'detail'
  | 'feedback'
  | 'settings';

const initialProfile: SkinTuneProfile = {
  name: '',
  pronouns: '',
  ageGroup: '',
  height: '',
  photoUrl: '',
  bodyPhotoUrl: '',
  bodyBuild: '',
  appearance: { skinTone: '', undertone: '', confidence: 0, contrast: 'Medium' },
  fit: '',
  style: [],
  colorsLove: [],
  colorsAvoid: [],
  restrictions: [],
  occasion: '',
  impression: [],
  budget: '',
  customStyleNotes: '',
};

const wizardScreens: Screen[] = [
  'name',
  'profile',
  'age',
  'consent',
  'photo',
  'appearance',
  'body-style',
  'custom-style',
  'colors-occasion',
  'review',
];

export function LetStyleApp() {
  const { user, openAuthModal, refreshUser } = useAuth();
  const [screen, setScreen] = useState<Screen>('welcome');
  const [profile, setProfile] = useState<SkinTuneProfile>(initialProfile);
  const [detailId, setDetailId] = useState('look-01');
  const [savedLooks, setSavedLooks] = useState<string[]>([]);
  const [feeling, setFeeling] = useState('');
  const [changeAreas, setChangeAreas] = useState<string[]>([]);
  const [changeRequest, setChangeRequest] = useState('');
  const [generatedLooks, setGeneratedLooks] = useState<LookRecommendation[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Sync user's name to profile if not yet set
  useEffect(() => {
    if (user?.name && !profile.name) {
      setProfile((old) => ({ ...old, name: user.name }));
    }
  }, [user?.name, profile.name]);

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('letstyle-profile') || localStorage.getItem('skintune-profile');
      if (savedProfile) {
        setProfile({ ...initialProfile, ...JSON.parse(savedProfile) });
        setScreen('home');
      }
      const saved = localStorage.getItem('letstyle-saved-looks') || localStorage.getItem('skintune-saved-looks');
      if (saved) setSavedLooks(JSON.parse(saved));
    } catch {
      // Ignore parse errors
    }
    setMounted(true);
  }, []);

  const update = (patch: Partial<SkinTuneProfile>) => setProfile((old) => ({ ...old, ...patch }));
  const index = wizardScreens.indexOf(screen);
  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => {
    if (screen === 'detail' || screen === 'feedback') go('results');
    else if (index > 0) go(wizardScreens[index - 1]);
    else go(profile.name ? 'home' : 'welcome');
  };
  const saveProfile = () => {
    localStorage.setItem('letstyle-profile', JSON.stringify(profile));
    if (!user) {
      openAuthModal('signup', () => {
        go('generating');
      });
      return;
    }
    go('generating');
  };
  const openSettings = () => go(profile.name ? 'settings' : 'welcome');
  const toggleChangeArea = (v: string) =>
    setChangeAreas((old) => (old.includes(v) ? old.filter((item) => item !== v) : [...old, v]));

  useEffect(() => {
    if (screen !== 'generating') return;
    let active = true;
    setGenerationError(null);
    getLookRecommendations(profile)
      .then((recommendations) => {
        refreshUser();
        return generateLookImages(recommendations, profile, {
          occasion: profile.occasion,
          details: profile.customStyleNotes || '',
        });
      })
      .then((result) => {
        if (active) {
          refreshUser();
          setGeneratedLooks(result);
          go('results');
        }
      })
      .catch((err) => {
        if (active) {
          refreshUser();
          console.error('Styling recommendation failed:', err);
          setGenerationError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);


  useEffect(() => {
    if (mounted) {
      localStorage.setItem('letstyle-saved-looks', JSON.stringify(savedLooks));
    }
  }, [savedLooks, mounted]);

  const currentLook = useMemo(
    () => generatedLooks.find((item) => item.id === detailId) || generatedLooks[0],
    [generatedLooks, detailId],
  );

  if (screen === 'welcome') {
    return (
      <LandingPage
        onStart={() => go('name')}
        onPrivacy={() => go('settings')}
        onQuickStart={(occasion) => {
          update({ occasion });
          go(profile.name ? 'colors-occasion' : 'name');
        }}
        hasExistingProfile={Boolean(profile.name)}
        onGoHome={() => go('home')}
      />
    );
  }

  if (screen === 'home') {
    return (
      <Home
        profile={profile}
        savedLooks={savedLooks}
        generatedLooks={generatedLooks}
        onNew={() => {
          update({ photoUrl: '' });
          go('name');
        }}
        onResults={() => go(generatedLooks.length ? 'results' : 'generating')}
        onSettings={openSettings}
        onLook={(id) => {
          setDetailId(id);
          go('detail');
        }}
        onQuickStart={(occasion) => {
          update({ occasion });
          go('colors-occasion');
        }}
        onDiscover={() => go('welcome')}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <Settings
        profile={profile}
        deletedNotice={deletedNotice}
        onBack={() => go(profile.name ? 'home' : 'welcome')}
        onDelete={() => {
          localStorage.removeItem('letstyle-profile');
          localStorage.removeItem('letstyle-saved-looks');
          localStorage.removeItem('letstyle-feedback');
          localStorage.removeItem('skintune-profile');
          localStorage.removeItem('skintune-saved-looks');
          localStorage.removeItem('skintune-feedback');
          setProfile(initialProfile);
          setDeletedNotice(true);
          setTimeout(() => go('welcome'), 900);
        }}
      />
    );
  }

  if (screen === 'photo') {
    return <PhotoPanel profile={profile} update={update} onContinue={() => go('appearance')} onBack={back} />;
  }

  if (screen === 'results') {
    return (
      <Results
        profile={profile}
        looks={generatedLooks}
        savedLooks={savedLooks}
        onSave={(id) =>
          setSavedLooks((old) => (old.includes(id) ? old.filter((item) => item !== id) : [...old, id]))
        }
        onLook={(id) => {
          setDetailId(id);
          go('detail');
        }}
        onFeedback={() => go('feedback')}
        onBack={() => go('home')}
      />
    );
  }

  if (screen === 'detail' && currentLook) {
    return (
      <LookDetail
        look={currentLook}
        profile={profile}
        saved={savedLooks.includes(currentLook.id)}
        onSave={() =>
          setSavedLooks((old) =>
            old.includes(currentLook.id) ? old.filter((item) => item !== currentLook.id) : [...old, currentLook.id],
          )
        }
        onBack={back}
        onFeedback={() => go('feedback')}
        onRefined={(refined) =>
          setGeneratedLooks((old) => old.map((item) => (item.id === refined.id ? refined : item)))
        }
      />
    );
  }

  if (screen === 'feedback') {
    return (
      <Feedback
        feeling={feeling}
        setFeeling={setFeeling}
        changeAreas={changeAreas}
        toggleChangeArea={toggleChangeArea}
        request={changeRequest}
        setRequest={setChangeRequest}
        onBack={back}
        onDone={() => {
          localStorage.setItem(
            'letstyle-feedback',
            JSON.stringify({ feeling, changeAreas, changeRequest }),
          );
          if (feeling === 'Not my style') {
            setFeeling('');
            setChangeAreas([]);
            setChangeRequest('');
            go('generating');
          } else {
            go('results');
          }
        }}
      />
    );
  }

  if (screen === 'generating') {
    return (
      <Generating
        error={generationError}
        onRetry={() => {
          setGenerationError(null);
          setScreen('review');
          setTimeout(() => setScreen('generating'), 20);
        }}
        onBack={() => {
          setGenerationError(null);
          go(profile.name ? 'home' : 'welcome');
        }}
      />
    );
  }


  const screenContent: Record<string, ReactNode> = {
    name: <NameStep profile={profile} update={update} onNext={() => go('profile')} onBack={back} />,
    profile: (
      <SingleChoiceStep
        profile={profile}
        update={update}
        field="pronouns"
        step={2}
        eyebrow="02 / a little context"
        title="How should we write your styling advice?"
        body="Choose the language and point of view that feels most like you."
        options={pronounOptions}
        allowOther={true}
        otherPlaceholder="Type your preferred styling perspective..."
        onNext={() => go('age')}
        onBack={back}
      />
    ),
    age: (
      <SingleChoiceStep
        profile={profile}
        update={update}
        field="ageGroup"
        step={3}
        eyebrow="03 / a little context"
        title="Which age range feels right?"
        body="This helps us tune proportions and references. There's no wrong answer."
        options={ageGroupOptions}
        allowOther={true}
        otherPlaceholder="Type your age preference..."
        onNext={() => go('consent')}
        onBack={back}
      />
    ),
    consent: (
      <ConsentStep
        profile={profile}
        onNext={() => go('photo')}
        onBack={back}
        step={4}
      />
    ),
    appearance: (
      <AppearanceStep
        profile={profile}
        onNext={() => go('body-style')}
        onPhoto={() => go('photo')}
        onBack={() => go('photo')}
        step={6}
      />
    ),
    'body-style': (
      <SectionStep
        profile={profile}
        update={update}
        step={7}
        eyebrow="07 / your canvas"
        title="Which style worlds pull you in?"
        body="Choose the aesthetics, cuts, and vibes that inspire you — pick as many as you like, or type your own."
        fields={[
          {
            kind: 'multi',
            field: 'style',
            label: 'Which style worlds pull you in?',
            hint: 'Choose as many as you like.',
            options: styleOptions,
            allowOther: true,
            otherPlaceholder: 'Type your custom style (e.g. Cottagecore, Dark Academia, Cyberpunk)...',
            compact: true,
          },
        ]}
        onNext={() => go('custom-style')}
        onBack={back}
      />
    ),
    'custom-style': (
      <CustomStyleStep
        profile={profile}
        update={update}
        step={8}
        total={10}
        onNext={() => go('colors-occasion')}
        onBack={back}
      />
    ),
    'colors-occasion': (
      <SectionStep
        profile={profile}
        update={update}
        step={9}
        eyebrow="09 / colours, occasion & budget"
        title="Colour, comfort, occasion, and your budget."
        body="Everything you need for this look, in one go."
        fields={[
          { kind: 'multi', field: 'colorsLove', label: 'Which colors do you reach for?', options: colorLoveOptions, max: 5, allowOther: true, otherPlaceholder: 'Type custom color (e.g. Emerald teal, powder blue)...' },
          { kind: 'multi', field: 'colorsAvoid', label: 'Anything you tend to avoid?', options: colorAvoidOptions, required: false, allowOther: true, otherPlaceholder: 'Type custom color to avoid (e.g. Mustard, neon yellow)...' },
          { kind: 'single', field: 'occasion', label: 'Where are you getting dressed for?', options: occasionOptions, allowOther: true, otherPlaceholder: 'Type custom occasion (e.g. Concert, art opening, graduation)...' },
          { kind: 'single', field: 'budget', label: 'What feels comfortable for your budget?', options: budgetOptions, allowOther: true, otherPlaceholder: 'Type custom budget or range...' },
        ]}
        continueLabel="Review my edit"
        onNext={() => go('review')}
        onBack={back}
      />
    ),
    review: <Review profile={profile} onEdit={(target) => go(target as Screen)} onSave={saveProfile} onBack={back} />,
  };

  return <>{screenContent[screen]}</>;
}

export const SkinTuneApp = LetStyleApp;
