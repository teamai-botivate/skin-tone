'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { LandingPage } from '@/features/landing';
import { Home, Settings } from '@/features/settings';
import {
  NameStep,
  HeightStep,
  SingleChoiceStep,
  MultiChoiceStep,
  SectionStep,
  ConsentStep,
  AppearanceStep,
  Review,
  pronounOptions,
  ageGroupOptions,
  bodyBuildOptions,
  fitOptions,
  styleOptions,
  colorLoveOptions,
  colorAvoidOptions,
  restrictionOptions,
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
  | 'height'
  | 'consent'
  | 'photo'
  | 'appearance'
  | 'body-style'
  | 'colors-occasion'
  | 'final-prefs'
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
};

const wizardScreens: Screen[] = [
  'name',
  'profile',
  'age',
  'height',
  'consent',
  'photo',
  'appearance',
  'body-style',
  'colors-occasion',
  'final-prefs',
  'review',
];

export function SkinTuneApp() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [profile, setProfile] = useState<SkinTuneProfile>(initialProfile);
  const [detailId, setDetailId] = useState('look-01');
  const [savedLooks, setSavedLooks] = useState<string[]>([]);
  const [feeling, setFeeling] = useState('');
  const [changeAreas, setChangeAreas] = useState<string[]>([]);
  const [changeRequest, setChangeRequest] = useState('');
  const [generatedLooks, setGeneratedLooks] = useState<LookRecommendation[]>([]);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem('skintune-profile');
      if (savedProfile) {
        setProfile({ ...initialProfile, ...JSON.parse(savedProfile) });
        setScreen('home');
      }
      const saved = localStorage.getItem('skintune-saved-looks');
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
    localStorage.setItem('skintune-profile', JSON.stringify(profile));
    go('generating');
  };
  const openSettings = () => go(profile.name ? 'settings' : 'welcome');
  const toggleChangeArea = (v: string) =>
    setChangeAreas((old) => (old.includes(v) ? old.filter((item) => item !== v) : [...old, v]));

  useEffect(() => {
    if (screen !== 'generating') return;
    let active = true;
    getLookRecommendations(profile)
      .then((recommendations) =>
        generateLookImages(recommendations, profile, { occasion: profile.occasion, details: '' }),
      )
      .then((result) => {
        if (active) {
          setGeneratedLooks(result);
          go('results');
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('skintune-saved-looks', JSON.stringify(savedLooks));
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
          go(profile.name ? 'final-prefs' : 'name');
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
          go('final-prefs');
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
            'skintune-feedback',
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

  if (screen === 'generating') return <Generating />;

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
        onNext={() => go('height')}
        onBack={back}
      />
    ),
    height: (
      <HeightStep
        profile={profile}
        update={update}
        step={4}
        eyebrow="04 / a little context"
        title="What's your height?"
        body="Optional — helps us tune proportion suggestions."
        onNext={() => go('consent')}
        onBack={back}
      />
    ),
    consent: <ConsentStep profile={profile} onNext={() => go('photo')} onBack={back} />,
    appearance: (
      <AppearanceStep
        profile={profile}
        onNext={() => go('body-style')}
        onPhoto={() => go('photo')}
        onBack={back}
      />
    ),
    'body-style': (
      <SectionStep
        profile={profile}
        update={update}
        step={8}
        eyebrow="08 / your canvas"
        title="Your build, fit, and style."
        body="A few quick checkboxes — pick what fits, and we'll get moving."
        fields={[
          { kind: 'single', field: 'bodyBuild', label: 'How would you describe your build?', options: bodyBuildOptions },
          { kind: 'single', field: 'fit', label: 'What fit feels like you?', options: fitOptions },
          { kind: 'multi', field: 'style', label: 'Which style worlds pull you in?', hint: 'Choose as many as you like.', options: styleOptions },
        ]}
        onNext={() => go('colors-occasion')}
        onBack={back}
      />
    ),
    'colors-occasion': (
      <SectionStep
        profile={profile}
        update={update}
        step={9}
        eyebrow="09 / colours & the moment"
        title="Colour, comfort, and where you're headed."
        body="Everything you need for this look, in one go."
        fields={[
          { kind: 'multi', field: 'colorsLove', label: 'Which colors do you reach for?', options: colorLoveOptions, max: 5 },
          { kind: 'multi', field: 'colorsAvoid', label: 'Anything you tend to avoid?', options: colorAvoidOptions, required: false },
          { kind: 'multi', field: 'restrictions', label: 'Anything we should work around?', options: restrictionOptions, required: false },
          { kind: 'single', field: 'occasion', label: 'Where are you getting dressed for?', options: occasionOptions },
        ]}
        onNext={() => go('final-prefs')}
        onBack={back}
      />
    ),
    'final-prefs': (
      <SectionStep
        profile={profile}
        update={update}
        step={10}
        eyebrow="10 / the finishing touch"
        title="How you want to come across, and your budget."
        body="Last section — then we'll make your five looks."
        fields={[
          { kind: 'multi', field: 'impression', label: 'How do you want to come across?', options: impressionOptions, max: 2 },
          { kind: 'single', field: 'budget', label: 'What feels comfortable for this edit?', options: budgetOptions },
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
