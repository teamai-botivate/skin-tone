'use client';

import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from 'react';
import type { LookRecommendation, SkinTuneProfile } from '@/types';
import { useAuth, type User } from '@/features/auth';
import { clearPersonalizationStorage } from '@/lib/personalization-storage';
import { getStylingContext, getGenerationFingerprint } from '@/lib/styling-context';
import { extractErrorMessage } from '@/lib/safe-error';
import { clearClientProductCache } from '@/features/shopping';
import { notifyLooksGenerated, warmAudioContext, requestNotificationPermission } from '@/lib/notification';
import { registerServiceWorker, ensurePushSubscription } from '@/lib/client-push';
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
  styleOptionsForProfile,
  applyAudienceSelection,
  repairStoredAudience,
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
  startGenerationJob,
  watchGenerationJob,
  getActiveJobId,
  setActiveJobId,
  JobsUnavailableError,
  JOB_POKE_EVENT,
} from '@/features/recommendations';
import type { GenerationProgress } from '@/features/recommendations/services/generation-progress';

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
  // Real progress of the running generation (server stage + which looks are rendered)
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [generationTrigger, setGenerationTrigger] = useState(0);
  const generationRequestIdRef = useRef(0);
  // Background job to pick up on the next 'generating' run instead of starting a new one.
  const resumeJobIdRef = useRef<string | null>(null);
  // Job the generating screen is currently showing.
  const watchedJobIdRef = useRef<string | null>(null);

  // Centralized reset for all personalization state and browser caches
  const resetPersonalization = useCallback(() => {
    generationRequestIdRef.current += 1;
    resumeJobIdRef.current = null;
    watchedJobIdRef.current = null;
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
        // Profiles saved before audience switching was fixed may carry a stale gender or kids age
        setProfile(repairStoredAudience({ ...initialProfile, ...JSON.parse(savedProfile) }));
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
    // The profile is saved exactly as the user chose it: selected styles (e.g. Traditional with an
    // Everyday occasion) are never dropped here; the styling engine reconciles style and occasion.
    const effectiveProfile = profile;

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
    // Ask while we still have the click's user gesture, so the user can be
    // told when their looks are ready after leaving the app.
    requestNotificationPermission();

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
    watchedJobIdRef.current = null;
    const currentFingerprint = getGenerationFingerprint(profile);
    const inputsUnchanged =
      looksFingerprint !== null &&
      looksFingerprint === currentFingerprint;
    const canReuseLooks =
      inputsUnchanged &&
      generatedLooks.length === 5 &&
      generatedLooks.every((look) => hasRealImage(look.imageUrl));

    const isCurrent = () => active && generationRequestIdRef.current === requestId;
    const onProgress = (partial: LookRecommendation[]) => {
      if (isCurrent()) setGeneratedLooks(partial);
    };
    const onStatus = (progress: GenerationProgress) => {
      if (isCurrent()) setGenerationProgress(progress);
    };
    const toLookProgress = (looks: LookRecommendation[]) =>
      looks.map((look) => ({ id: look.id, title: look.title, ready: hasRealImage(look.imageUrl) }));
    setGenerationProgress(canReuseLooks ? null : { stage: 'queued', looks: [] });
    const context = {
      occasion: profile.occasion,
      details: profile.customStyleNotes || '',
    };

    // Previous in-page pipeline, kept only as a fallback for deployments
    // where background jobs are unavailable. It stops if the tab is frozen.
    const generateInPage = async () => {
      onStatus({ stage: 'styling', looks: [] });
      const recommendations = await getLookRecommendations(profile);
      if (!isCurrent()) return null;
      refreshUser();
      setGeneratedLooks(recommendations);
      onStatus({ stage: 'rendering', looks: toLookProgress(recommendations) });
      return await generateLookImages(recommendations, profile, context, {
        onProgress: (partial) => {
          onProgress(partial);
          onStatus({ stage: 'rendering', looks: toLookProgress(partial) });
        },
      });
    };

    // Runs on the server, independent of this tab: switching apps, locking
    // the phone or closing LetStyle doesn't interrupt it, and the result is
    // announced by push notification (see src/lib/generation-jobs.ts).
    const generateInBackground = async () => {
      let jobId = resumeJobIdRef.current;
      resumeJobIdRef.current = null;
      if (!jobId) {
        try {
          jobId = await startGenerationJob(profile, context);
        } catch (err) {
          if (err instanceof JobsUnavailableError) {
            console.warn('Background generation unavailable; generating in page:', err.message);
            return { looks: await generateInPage(), jobId: null, finishedBeforeWatch: false };
          }
          throw err;
        }
      }
      watchedJobIdRef.current = jobId;
      setActiveJobId(jobId);
      const watched = await watchGenerationJob(jobId, { onProgress, onStatus, shouldStop: () => !isCurrent() });
      return { looks: watched?.looks ?? null, jobId, finishedBeforeWatch: watched?.finishedBeforeWatch ?? false };
    };

    const run = canReuseLooks
      ? Promise.resolve({ looks: generatedLooks, jobId: null, finishedBeforeWatch: true })
      : generateInBackground();

    run
      .then(({ looks: result, jobId, finishedBeforeWatch }) => {
        if (isCurrent() && result) {
          refreshUser();
          setGeneratedLooks(result);
          setLooksFingerprint(currentFingerprint);
          clearClientProductCache();
          if (jobId) setActiveJobId(null);

          // Play sound and trigger notification as soon as photos are generated
          // (skipped when reopening a job that finished while the user was away —
          // the push notification already announced it).
          if (!finishedBeforeWatch) {
            notifyLooksGenerated({
              title: 'Your personalized looks are ready! ✨',
              description: '5 tailored outfits have been generated for you.',
              tag: jobId ? `letstyle-job-${jobId}` : undefined,
            });
          }

          go('results');
        }
      })
      .catch((err) => {
        if (isCurrent()) {
          refreshUser();
          console.warn('Styling recommendation failed:', err);
          if (watchedJobIdRef.current) setActiveJobId(null);
          setGenerationError(extractErrorMessage(err));
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, generationTrigger]);

  const screenRef = useRef(screen);
  screenRef.current = screen;

  // Open a background job's progress/result: after a reload, a tab the
  // browser discarded while the user was in another app, or a notification tap.
  const openJob = (jobId: string) => {
    if (watchedJobIdRef.current === jobId) {
      if (screenRef.current !== 'generating') go('results');
      return;
    }
    resumeJobIdRef.current = jobId;
    generationRequestIdRef.current += 1;
    setGenerationTrigger((prev) => prev + 1);
    go('generating');
  };
  const openJobRef = useRef(openJob);
  openJobRef.current = openJob;

  useEffect(() => {
    if (!mounted || !user) return;
    // Keeps this device's push subscription attached to the signed-in user
    // (no prompt here — permission is only requested from a click).
    registerServiceWorker().then(() => ensurePushSubscription());

    const url = new URL(window.location.href);
    const jobFromUrl = url.searchParams.get('job');
    if (jobFromUrl) {
      url.searchParams.delete('job');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const jobId = jobFromUrl || getActiveJobId();
    if (jobId) openJobRef.current(jobId);
  }, [mounted, user?.id]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type === 'letstyle:push') {
        // A job finished while the page is on screen: check now rather than at the next poll.
        window.dispatchEvent(new Event(JOB_POKE_EVENT));
      } else if (data?.type === 'letstyle:open-job' && data.url) {
        const jobId = new URL(data.url, window.location.origin).searchParams.get('job');
        if (jobId) openJobRef.current(jobId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);



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
        progress={generationProgress}
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
          if (p.pronouns === undefined) {
            update(p);
            return;
          }
          // Re-derives gender, clears an age from the other adult/kids side, and drops preset
          // styles of the previous audience (see features/onboarding/audience-selection.ts)
          update({ ...p, ...applyAudienceSelection(profile, p.pronouns) });
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
            options: styleOptionsForProfile(profile),
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
