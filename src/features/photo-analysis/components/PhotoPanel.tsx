'use client';

import { useState, type ChangeEvent } from 'react';
import type { PhotoStatus, SkinTuneProfile } from '@/types';
import { Shell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { CameraCapture } from './CameraCapture';
import { analyzePhoto } from '../services/photo-analysis';
import { photoAnalysisStages, photoDiagnostics } from '../data/photo-diagnostics';
import { Camera, Check, CheckCircle2, ChevronDown, CircleHelp, RefreshCw, Upload } from 'lucide-react';

export function PhotoPanel({
  profile,
  update,
  onContinue,
  onBack,
}: {
  profile: SkinTuneProfile;
  update: (p: Partial<SkinTuneProfile>) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<PhotoStatus>(
    profile.appearance.confidence ? 'good' : 'low-confidence',
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const diagnostic = photoDiagnostics[status];
  const isDev = process.env.NODE_ENV !== 'production';

  const runAnalysis = (photoUrl: string) => {
    setAnalyzing(true);
    setStageIndex(0);
    const stepMs = 550;
    const stageTimers = photoAnalysisStages.map((_, i) =>
      window.setTimeout(() => setStageIndex(i), stepMs * i),
    );
    const minDisplayMs = stepMs * photoAnalysisStages.length;
    const startedAt = Date.now();

    analyzePhoto(photoUrl).then((result) => {
      const elapsed = Date.now() - startedAt;
      const settle = () => {
        stageTimers.forEach((timer) => window.clearTimeout(timer));
        setAnalyzing(false);
        setStatus(result.status);
        update({
          appearance: {
            skinTone: result.skinTone,
            undertone: result.undertone,
            confidence: result.confidence,
            contrast: result.contrast,
          },
        });
      };
      if (elapsed >= minDisplayMs) settle();
      else window.setTimeout(settle, minDisplayMs - elapsed);
    });
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      update({ photoUrl: dataUrl });
      runAnalysis(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const retry = () => {
    update({ photoUrl: '' });
    setStatus('low-confidence');
  };

  const handleCapture = (dataUrl: string) => {
    setShowCamera(false);
    update({ photoUrl: dataUrl });
    runAnalysis(dataUrl);
  };

  return (
    <Shell profile={profile} onBack={onBack} onSettings={onBack} step={6} total={11}>
      <div className="mx-auto max-w-3xl">
        <Intro
          eyebrow="06 / a gentle check"
          title="A photo helps us notice the details."
          body="This is only used to tune color and proportion suggestions. It is not a beauty score, identity check, or medical assessment."
        >
          {showCamera && (
            <CameraCapture onCapture={handleCapture} onClose={() => setShowCamera(false)} />
          )}
          <div className="mt-8 grid gap-6 md:grid-cols-[.84fr_1.16fr]">
            <div className="relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden rounded-[1.5rem] border border-border bg-secondary/60 p-6">
              {profile.photoUrl ? (
                <img
                  src={profile.photoUrl}
                  alt="Your uploaded portrait"
                  data-testid="img-upload-preview"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <>
                  <div className="grid size-24 place-items-center rounded-full bg-card text-primary">
                    <Camera size={34} />
                  </div>
                  <p className="mt-4 text-center text-sm font-semibold">A natural, shoulders-up photo</p>
                  <p className="mt-1 text-center text-xs text-muted-foreground">No posing required.</p>
                </>
              )}
              <div className="absolute bottom-4 flex flex-wrap justify-center gap-2 px-4">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  data-testid="button-open-camera"
                  className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg"
                >
                  <Camera size={15} /> Take a Selfie
                </button>
                <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-bold shadow-lg">
                  <Upload size={15} /> {profile.photoUrl ? 'Choose another' : 'Choose from Gallery'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={pickFile}
                    data-testid="input-photo-gallery"
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div
              className={`rounded-[1.5rem] border p-6 ${
                analyzing
                  ? 'border-border bg-secondary/50'
                  : diagnostic.good
                  ? 'border-accent/30 bg-accent/8'
                  : 'border-primary/25 bg-primary/5'
              }`}
            >
              {analyzing ? (
                <div data-testid="panel-analyzing">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="animate-spin text-primary" size={22} />
                    <h2 className="font-serif text-2xl">{photoAnalysisStages[stageIndex]}</h2>
                  </div>
                  <div className="mt-6 space-y-3">
                    {photoAnalysisStages.map((stage, i) => (
                      <div
                        key={stage}
                        className={`flex items-center gap-3 text-sm transition ${
                          i <= stageIndex ? 'opacity-100' : 'opacity-35'
                        }`}
                      >
                        <span
                          className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                            i < stageIndex
                              ? 'border-accent bg-accent text-accent-foreground'
                              : 'border-border'
                          }`}
                        >
                          {i < stageIndex && <Check size={11} strokeWidth={3} />}
                        </span>
                        {stage}
                      </div>
                    ))}
                  </div>
                </div>
              ) : !profile.photoUrl ? (
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">
                    Photo check
                  </p>
                  <h2 className="mt-3 font-serif text-2xl">Waiting for a photo</h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Choose a photo and we’ll check lighting, angle, and clarity right away.
                  </p>
                </div>
              ) : diagnostic.good ? (
                <div data-testid="panel-photo-good">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">
                        Photo check
                      </p>
                      <h2 className="mt-3 font-serif text-2xl">{diagnostic.title}</h2>
                    </div>
                    <CheckCircle2 className="text-accent" size={24} />
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Skin tone
                      </p>
                      <p className="mt-1 font-serif text-lg">{profile.appearance.skinTone}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Undertone
                      </p>
                      <p className="mt-1 font-serif text-lg">{profile.appearance.undertone}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Confidence
                      </p>
                      <p className="mt-1 font-serif text-lg">{profile.appearance.confidence}%</p>
                    </div>
                  </div>
                  {isDev && (
                    <details className="mt-7 border-t border-border/70 pt-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">
                        Preview other diagnostics (dev only) <ChevronDown size={15} />
                      </summary>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(Object.keys(photoDiagnostics) as PhotoStatus[]).map((key) => (
                          <button
                            type="button"
                            key={key}
                            onClick={() => setStatus(key)}
                            data-testid={`button-diagnostic-${key}`}
                            className={`focus-ring rounded-lg px-2 py-2 text-left text-xs transition ${
                              status === key
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card hover:bg-secondary'
                            }`}
                          >
                            {photoDiagnostics[key].label}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ) : (
                <div data-testid="panel-photo-problem">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.15em] text-muted-foreground">
                        Photo check · {diagnostic.label}
                      </p>
                      <h2 className="mt-3 font-serif text-2xl">{diagnostic.title}</h2>
                    </div>
                    <CircleHelp className="text-primary" size={24} />
                  </div>
                  <div className="mt-5 space-y-4 text-sm leading-relaxed">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Problem
                      </p>
                      <p className="mt-1">{diagnostic.problem}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Why it matters
                      </p>
                      <p className="mt-1 text-muted-foreground">{diagnostic.whyItMatters}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        How to improve
                      </p>
                      <p className="mt-1 text-muted-foreground">{diagnostic.howToImprove}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={retry}
                    data-testid="button-retry-photo"
                    className="focus-ring mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
                  >
                    <Camera size={15} /> Retry Photo
                  </button>
                  {isDev && (
                    <details className="mt-7 border-t border-border/70 pt-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">
                        Preview other diagnostics (dev only) <ChevronDown size={15} />
                      </summary>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(Object.keys(photoDiagnostics) as PhotoStatus[]).map((key) => (
                          <button
                            type="button"
                            key={key}
                            onClick={() => setStatus(key)}
                            data-testid={`button-diagnostic-${key}`}
                            className={`focus-ring rounded-lg px-2 py-2 text-left text-xs transition ${
                              status === key
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-card hover:bg-secondary'
                            }`}
                          >
                            {photoDiagnostics[key].label}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
          <FooterActions
            onBack={onBack}
            onContinue={onContinue}
            disabled={!profile.photoUrl || !diagnostic.good || analyzing}
          />
        </Intro>
      </div>
    </Shell>
  );
}
