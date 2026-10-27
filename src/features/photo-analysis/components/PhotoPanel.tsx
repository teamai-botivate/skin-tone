'use client';

import { useState, useEffect, useRef } from 'react';
import type { PhotoStatus, SkinTuneProfile } from '@/types';
import { Shell } from '@/components/common/Shell';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { CameraCapture } from './CameraCapture';
import { analyzePhoto } from '../services/photo-analysis';
import { photoAnalysisStages, photoDiagnostics } from '../data/photo-diagnostics';
import {
  Camera,
  Check,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Sun,
  Maximize2,
  User,
  Shirt,
  RefreshCw,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/features/auth';

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
  const { user, openAuthModal, refreshUser } = useAuth();
  const [status, setStatus] = useState<PhotoStatus>(
    profile.appearance.confidence ? 'good' : 'low-confidence',
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [activeCamera, setActiveCamera] = useState<'face' | 'body' | null>(null);
  const faceFileInputRef = useRef<HTMLInputElement>(null);
  const bodyFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (file: File, mode: 'face' | 'body') => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const raw = event.target?.result as string;
      if (!raw) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          if (mode === 'face') handleFaceCapture(dataUrl);
          else handleBodyCapture(dataUrl);
        } else {
          if (mode === 'face') handleFaceCapture(raw);
          else handleBodyCapture(raw);
        }
      };
      img.onerror = () => {
        if (mode === 'face') handleFaceCapture(raw);
        else handleBodyCapture(raw);
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  const runAnalysis = (photoUrl: string) => {
    setAnalysisError(null);
    setAnalyzing(true);
    setStageIndex(0);
    const stepMs = 500;
    const stageTimers = photoAnalysisStages.map((_, i) =>
      window.setTimeout(() => setStageIndex(i), stepMs * i),
    );
    const minDisplayMs = stepMs * photoAnalysisStages.length;
    const startedAt = Date.now();

    analyzePhoto(photoUrl)
      .then((result) => {
        refreshUser();
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
      })
      .catch((err) => {
        refreshUser();
        stageTimers.forEach((timer) => window.clearTimeout(timer));
        setAnalyzing(false);
        setAnalysisError(err instanceof Error ? err.message : String(err));
        if (!profile.appearance.skinTone) {
          update({
            appearance: {
              skinTone: 'Medium',
              undertone: 'Warm',
              confidence: 75,
              contrast: 'Medium',
            },
          });
        }
      });
  };

  useEffect(() => {
    if (profile.photoUrl && !profile.appearance.skinTone && !analyzing) {
      runAnalysis(profile.photoUrl);
    }
  }, [profile.photoUrl]);

  const handleFaceCapture = (dataUrl: string) => {
    setActiveCamera(null);
    update({ photoUrl: dataUrl });
    runAnalysis(dataUrl);
  };

  const handleBodyCapture = (dataUrl: string) => {
    setActiveCamera(null);
    update({ bodyPhotoUrl: dataUrl });
  };

  const hasFace = Boolean(profile.photoUrl);
  const hasBody = Boolean(profile.bodyPhotoUrl);
  const bothCaptured = hasFace && hasBody;

  return (
    <Shell profile={profile} onBack={onBack} onSettings={onBack} step={5} total={10}>
      <div className="mx-auto max-w-5xl">
        <Intro
          eyebrow="05 / your selfies"
          title="Take your face & body selfies."
          body="Your face selfie tunes color harmony and undertones, while your full body selfie tunes proportions, silhouette, and fabric drape. Camera capture only — kept private on your device."
        >
          {/* Active Camera Modal */}
          {activeCamera && (
            <CameraCapture
              mode={activeCamera}
              onCapture={activeCamera === 'face' ? handleFaceCapture : handleBodyCapture}
              onClose={() => setActiveCamera(null)}
            />
          )}

          {/* Analysis Error Alert */}
          {analysisError && (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500 shrink-0" />
                <span>{analysisError}</span>
              </div>
              {profile.photoUrl && (
                <button
                  type="button"
                  onClick={() => runAnalysis(profile.photoUrl)}
                  className="rounded-full bg-red-100 px-3 py-1 font-bold text-red-800 hover:bg-red-200"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* SIDE-BY-SIDE INSTRUCTIONS */}
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {/* Face Selfie Instructions */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#B08A70]/35 bg-[#FAF5EE] p-5 sm:p-6 shadow-sm">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#795548]">
                  <Sparkles size={14} className="text-[#194A49]" />
                  <span>How to take your face selfie</span>
                </div>

                <div className="mt-4 space-y-3.5 text-xs leading-relaxed text-[#194A49]/85">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Sun size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Full, natural front light</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Face a window or soft front light so your skin tone is illuminated evenly without harsh shadows.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <User size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Full face in focus</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Look directly into the camera lens with your entire face clearly visible from forehead to chin.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Sparkles size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Clear facial features</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Keep hair tucked behind ears or off forehead; remove sunglasses, hats, or heavy beauty filters.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Maximize2 size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Eye-level portrait</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Hold phone at arm’s length at eye level for a natural, shoulders-up portrait.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Full Body Selfie Instructions */}
            <div className="flex flex-col justify-between rounded-2xl border border-[#B08A70]/35 bg-[#FAF5EE] p-5 sm:p-6 shadow-sm">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#795548]">
                  <Sparkles size={14} className="text-[#194A49]" />
                  <span>How to take your full body selfie</span>
                </div>

                <div className="mt-4 space-y-3.5 text-xs leading-relaxed text-[#194A49]/85">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Sun size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Full, natural light</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Stand in a bright room facing the light. Avoid standing with bright windows directly behind you.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Maximize2 size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Head-to-toe in frame</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Ensure your entire body — from the top of your head down to your shoes/feet — is visible.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <User size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Position 6–8 ft away</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Prop phone upright at waist/chest height, use the built-in timer, and step back into frame.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#194A49]/10 text-[#194A49]">
                      <Shirt size={13} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#194A49]">Natural posture & attire</p>
                      <p className="mt-0.5 text-muted-foreground">
                        Stand upright with arms relaxed by your sides. Everyday fitted clothing works best.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SIDE-BY-SIDE SELFIE CAPTURE CARDS */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Card 1: Face Selfie */}
            <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.6rem] border border-[#B08A70]/30 bg-[#FAF5EE] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#B08A70]/20 pb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#795548]">
                  01 · Face Selfie
                </span>
                {hasFace && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 size={12} /> Captured
                  </span>
                )}
              </div>

              <div className="my-6 flex flex-col items-center justify-center">
                {hasFace ? (
                  <div className="relative aspect-[3/4] w-full max-w-[260px] overflow-hidden rounded-2xl border border-[#B08A70]/30 shadow-md">
                    <img
                      src={profile.photoUrl}
                      alt="Your face selfie"
                      data-testid="img-face-selfie-preview"
                      className="size-full object-cover"
                    />
                    {analyzing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 p-4 text-center backdrop-blur-sm">
                        <RefreshCw className="animate-spin text-white mb-2" size={24} />
                        <p className="text-xs font-semibold text-white">
                          {photoAnalysisStages[stageIndex]}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="grid size-20 place-items-center rounded-full bg-[#D9BC96]/30 text-[#194A49] shadow-inner mb-4">
                      <Camera size={32} />
                    </div>
                    <h3 className="font-serif text-xl font-bold text-[#194A49]">
                      Take your face selfie
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                      Natural, shoulders-up portrait for undertone and contrast analysis.
                    </p>
                  </div>
                )}

                {hasFace && profile.appearance.skinTone && !analyzing && (
                  <div className="mt-3 rounded-full bg-card/80 px-3.5 py-1 text-xs font-semibold text-[#194A49] border border-[#B08A70]/30 shadow-xs">
                    {profile.appearance.skinTone} Tone · {profile.appearance.undertone} Undertone
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveCamera('face')}
                  data-testid="button-open-face-camera"
                  className={`focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition shadow-sm ${
                    hasFace
                      ? 'border border-border bg-card text-foreground hover:border-primary/50'
                      : 'bg-[#D9BC96] text-[#194A49] hover:bg-[#cfaf86]'
                  }`}
                >
                  {hasFace ? <RotateCcw size={14} /> : <Camera size={14} />}
                  <span>{hasFace ? 'Retake Selfie' : 'Take Face Selfie'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => faceFileInputRef.current?.click()}
                  data-testid="button-upload-face-photo"
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:border-primary/60 transition shadow-sm"
                >
                  <Upload size={14} className="text-[#194A49]" />
                  <span>{hasFace ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                <input
                  ref={faceFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'face');
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            {/* Card 2: Full Body Selfie */}
            <div className="relative flex flex-col justify-between overflow-hidden rounded-[1.6rem] border border-[#B08A70]/30 bg-[#FAF5EE] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#B08A70]/20 pb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#795548]">
                  02 · Full Body Selfie
                </span>
                {hasBody && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    <CheckCircle2 size={12} /> Captured
                  </span>
                )}
              </div>

              <div className="my-6 flex flex-col items-center justify-center">
                {hasBody ? (
                  <div className="relative aspect-[3/4] w-full max-w-[260px] overflow-hidden rounded-2xl border border-[#B08A70]/30 shadow-md">
                    <img
                      src={profile.bodyPhotoUrl}
                      alt="Your full body selfie"
                      data-testid="img-body-selfie-preview"
                      className="size-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center p-4">
                    <div className="grid size-20 place-items-center rounded-full bg-[#D9BC96]/30 text-[#194A49] shadow-inner mb-4">
                      <Camera size={32} />
                    </div>
                    <h3 className="font-serif text-xl font-bold text-[#194A49]">
                      Take your full body selfie
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                      Head-to-toe silhouette to fit cuts, fabric drape, and styling proportions.
                    </p>
                  </div>
                )}

                {hasBody && (
                  <div className="mt-3 rounded-full bg-card/80 px-3.5 py-1 text-xs font-semibold text-[#194A49] border border-[#B08A70]/30 shadow-xs">
                    Silhouette & Proportions Ready
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveCamera('body')}
                  data-testid="button-open-body-camera"
                  className={`focus-ring inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold transition shadow-sm ${
                    hasBody
                      ? 'border border-border bg-card text-foreground hover:border-primary/50'
                      : 'bg-[#D9BC96] text-[#194A49] hover:bg-[#cfaf86]'
                  }`}
                >
                  {hasBody ? <RotateCcw size={14} /> : <Camera size={14} />}
                  <span>{hasBody ? 'Retake Selfie' : 'Take Body Selfie'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => bodyFileInputRef.current?.click()}
                  data-testid="button-upload-body-photo"
                  className="focus-ring inline-flex items-center gap-2 rounded-full border border-[#B08A70]/40 bg-card px-4 py-2.5 text-xs font-bold text-foreground hover:border-primary/60 transition shadow-sm"
                >
                  <Upload size={14} className="text-[#194A49]" />
                  <span>{hasBody ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                <input
                  ref={bodyFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'body');
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>

          {/* Progress / Status banner */}
          <div className="mt-6 flex items-center justify-center text-center">
            {bothCaptured ? (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={14} /> Both selfies captured — ready for styling analysis
              </p>
            ) : hasFace ? (
              <p className="text-xs text-muted-foreground">
                Face selfie ready — please take your full body selfie to proceed.
              </p>
            ) : hasBody ? (
              <p className="text-xs text-muted-foreground">
                Body selfie ready — please take your face selfie to proceed.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Take your face selfie and full body selfie to continue.
              </p>
            )}
          </div>

          <FooterActions
            onBack={onBack}
            onContinue={onContinue}
            disabled={!bothCaptured || analyzing}
            label={analyzing ? 'Analyzing your appearance…' : 'Continue to appearance profile'}
          />
        </Intro>
      </div>
    </Shell>
  );
}
