'use client';

import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { useAuth, type User } from '@/features/auth';
import { clearPersonalizationStorage } from '@/lib/personalization-storage';
import { getStylingContext, getGenerationFingerprint } from '@/lib/styling-context';
import { extractErrorMessage } from '@/lib/safe-error';
import { clearClientProductCache } from '@/features/shopping';
import { notifyLooksGenerated, warmAudioContext } from '@/lib/notification';
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
  kidsAgeGroupOptions,
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
  hasRealImage,
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
  gender: '',
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
  const [looksFingerprint, setLooksFingerprint] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [generationTrigger, setGenerationTrigger] = useState(0);
  const generationRequestIdRef = useRef(0);

  // Centralized reset for all personalization state and browser caches
  const resetPersonalization = useCallback(() => {
    generationRequestIdRef.current += 1;
    setProfile(initialProfile);
    setGeneratedLooks([]);
    setLooksFingerprint(null);
    clearClientProductCache();
    setSavedLooks([]);
    setFeeling('');
    setChangeAreas([]);
    setChangeRequest('');
    setGenerationError(null);
    setDetailId('look-01');
    setDeletedNotice(false);
    clearPersonalizationStorage();
  }, []);

  // Track previous user to immediately reset personalization upon signing out
  const prevUserRef = useRef<User | null>(user);

  useEffect(() => {
    const handleLogout = () => {
      resetPersonalization();
      setScreen('welcome');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('letstyle:logout', handleLogout);
    return () => window.removeEventListener('letstyle:logout', handleLogout);
  }, [resetPersonalization]);

  useEffect(() => {
    if (prevUserRef.current && !user) {
      resetPersonalization();
      setScreen('welcome');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    prevUserRef.current = user;
  }, [user, resetPersonalization]);

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
    else if (
      screen === 'review' &&
      generatedLooks.length === 5 &&
      getGenerationFingerprint(profile) === looksFingerprint
    ) {
      go('results');
    }
    else if (index > 0) go(wizardScreens[index - 1]);
    else go(user && profile.name ? 'home' : 'welcome');
  };
  const saveProfile = () => {
    // When the user changes to a casual / vacation / resort occasion, reconcile conflicting residual traditional style tags
    // unless the user explicitly requested traditional/ethnic styling in their customStyleNotes
    const occLower = (profile.occasion || '').toLowerCase();
    const isCasualOrVacation =
      occLower.includes('vacation') ||
      occLower.includes('beach') ||
      occLower.includes('resort') ||
      occLower.includes('goa') ||
      occLower.includes('casual') ||
      occLower.includes('everyday');

    const notesLower = (profile.customStyleNotes || '').toLowerCase();
    const explicitlyRequestsEthnic =
      notesLower.includes('ethnic') ||
      notesLower.includes('traditional') ||
      notesLower.includes('kurta') ||
      notesLower.includes('sherwani') ||
      notesLower.includes('saree') ||
      notesLower.includes('lehenga');

    let effectiveProfile = profile;
    if (isCasualOrVacation && !explicitlyRequestsEthnic) {
      const filteredStyles = profile.style.filter(
        (s) => !['traditional', 'royal & regal', 'ethnic', 'festive'].includes(s.toLowerCase()),
      );
      if (filteredStyles.length !== profile.style.length) {
        effectiveProfile = { ...profile, style: filteredStyles };
        setProfile(effectiveProfile);
      }
    }

    localStorage.setItem('letstyle-profile', JSON.stringify(effectiveProfile));
    const currentFingerprint = getGenerationFingerprint(effectiveProfile);
    const inputsChanged =
      looksFingerprint !== null &&
      currentFingerprint !== looksFingerprint;

    // Immediately increment request ID to invalidate any in-flight asynchronous generation responses
    generationRequestIdRef.current += 1;

    if (inputsChanged) {
      setGeneratedLooks([]);
      setLooksFingerprint(null);
      clearClientProductCache();
    }

    setGenerationTrigger((prev) => prev + 1);
    warmAudioContext();

    if (!user) {
      openAuthModal('signup', () => {
        warmAudioContext();
        go('generating');
      });
      return;
    }
    go('generating');
  };
  const openSettings = () => go(user && profile.name ? 'settings' : 'welcome');
  const toggleChangeArea = (v: string) =>
    setChangeAreas((old) => (old.includes(v) ? old.filter((item) => item !== v) : [...old, v]));

  useEffect(() => {
    if (screen !== 'generating') return;
    warmAudioContext();
    let active = true;
    setGenerationError(null);

    const requestId = ++generationRequestIdRef.current;
    const currentFingerprint = getGenerationFingerprint(profile);
    const inputsUnchanged =
      looksFingerprint !== null &&
      looksFingerprint === currentFingerprint;
    const canReuseLooks =
      inputsUnchanged &&
      generatedLooks.length === 5 &&
      generatedLooks.every((look) => hasRealImage(look.imageUrl));

    const recsPromise = canReuseLooks
      ? Promise.resolve(generatedLooks)
      : getLookRecommendations(profile);

    recsPromise
      .then((recommendations) => {
        if (!active || generationRequestIdRef.current !== requestId) return;
        refreshUser();
        setGeneratedLooks(recommendations);
        return generateLookImages(
          recommendations,
          profile,
          {
            occasion: profile.occasion,
            details: profile.customStyleNotes || '',
          },
          {
            onProgress: (partial) => {
              if (active && generationRequestIdRef.current === requestId) {
                setGeneratedLooks(partial);
              }
            },
          },
        );
      })
      .then((result) => {
        if (active && result && generationRequestIdRef.current === requestId) {
          refreshUser();
          setGeneratedLooks(result);
          setLooksFingerprint(currentFingerprint);
          clearClientProductCache();

          // Play sound and trigger notification as soon as photos are generated
          notifyLooksGenerated({
            title: 'Your personalized looks are ready! ✨',
            description: '5 tailored outfits have been generated for you.',
          });

          go('results');
        }
      })
      .catch((err) => {
        if (active && generationRequestIdRef.current === requestId) {
          refreshUser();
          console.error('Styling recommendation failed:', err);
          setGenerationError(extractErrorMessage(err));
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, generationTrigger]);



  useEffect(() => {
    if (mounted) {
      if (user && savedLooks.length > 0) {
        localStorage.setItem('letstyle-saved-looks', JSON.stringify(savedLooks));
      } else if (!user) {
        localStorage.removeItem('letstyle-saved-looks');
        localStorage.removeItem('skintune-saved-looks');
      }
    }
  }, [savedLooks, mounted, user]);

  const currentLook = useMemo(
    () => generatedLooks.find((item) => item.id === detailId) || generatedLooks[0],
    [generatedLooks, detailId],
  );

  if (screen === 'welcome') {
    return (
      <LandingPage
        onStart={() => {
          if (!user) {
            resetPersonalization();
          }
          go('name');
        }}
        onPrivacy={() => go(user && profile.name ? 'settings' : 'welcome')}
        onQuickStart={(occasion) => {
          if (!user) {
            resetPersonalization();
          }
          update({ occasion });
          go(user && profile.name ? 'colors-occasion' : 'name');
        }}
        hasExistingProfile={Boolean(user && profile.name)}
        onGoHome={() => go(user && profile.name ? 'home' : 'welcome')}
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
          go(profile.name ? 'review' : 'name');
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
        onBack={() => go(user && profile.name ? 'home' : 'welcome')}
        onDelete={() => {
          resetPersonalization();
          setDeletedNotice(true);
          setTimeout(() => go('welcome'), 900);
        }}
      />
    );
  }

  if (screen === 'photo') {
    return <PhotoPanel profile={profile} update={update} onContinue={() => go(profile.occasion ? 'review' : 'appearance')} onBack={back} />;
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
        onEdit={() => go('review')}
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
            if (changeRequest.trim()) {
              const currentNotes = profile.customStyleNotes || '';
              const updatedNotes = currentNotes ? `${currentNotes}; ${changeRequest.trim()}` : changeRequest.trim();
              update({ customStyleNotes: updatedNotes });
            }
            generationRequestIdRef.current += 1;
            setGeneratedLooks([]);
            setLooksFingerprint(null);
            clearClientProductCache();
            setFeeling('');
            setChangeAreas([]);
            setChangeRequest('');
            setGenerationTrigger((prev) => prev + 1);
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
          generationRequestIdRef.current += 1;
          setGenerationTrigger((prev) => prev + 1);
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
        update={(p) => {
          let derivedGender = profile.gender;
          if (p.pronouns !== undefined) {
            const lower = p.pronouns.toLowerCase();
            if (lower.includes('boy')) derivedGender = 'boy';
            else if (lower.includes('girl')) derivedGender = 'girl';
            else if (lower.includes('kid') || lower.includes('child')) derivedGender = 'unspecified';
            else if (lower.includes('men') && !lower.includes('women')) derivedGender = 'men';
            else if (lower.includes('women')) derivedGender = 'women';
          }

          if (p.pronouns !== undefined && p.pronouns !== profile.pronouns) {
            const wasKids = getStylingContext(profile).isKids;
            const isNowKids = getStylingContext({ ...profile, ...p, gender: derivedGender }).isKids;
            if (wasKids !== isNowKids) {
              update({ ...p, gender: derivedGender, ageGroup: '' });
              return;
            }
          }
          update({ ...p, gender: derivedGender });
        }}
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
    age: (() => {
      const isKids = getStylingContext(profile).isKids;
      const currentAgeOptions = isKids ? kidsAgeGroupOptions : ageGroupOptions;

      return (
        <SingleChoiceStep
          profile={profile}
          update={update}
          field="ageGroup"
          step={3}
          eyebrow="03 / a little context"
          title={isKids ? "Which age range is your child in?" : "Which age range feels right?"}
          body={isKids ? "This helps us tune proportions, sizing, and age-appropriate kidswear." : "This helps us tune proportions and references. There's no wrong answer."}
          options={currentAgeOptions}
          allowOther={!isKids}
          otherPlaceholder="Type your age preference..."
          onNext={() => go(profile.occasion ? 'review' : 'consent')}
          onBack={back}
        />
      );
    })(),
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
        update={update}
        onNext={() => go(profile.occasion ? 'review' : 'body-style')}
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
        continueLabel={profile.occasion ? "Review my edit" : "Continue"}
        onNext={() => go(profile.occasion ? 'review' : 'custom-style')}
        onBack={back}
      />
    ),
    'custom-style': (
      <CustomStyleStep
        profile={profile}
        update={update}
        step={8}
        total={10}
        continueLabel={profile.occasion ? "Review my edit" : "Continue"}
        onNext={() => go(profile.occasion ? 'review' : 'colors-occasion')}
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
