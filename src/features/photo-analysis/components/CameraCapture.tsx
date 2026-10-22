'use client';

import { useEffect, useRef, useState } from 'react';
import {
  X,
  RefreshCw,
  Timer,
  SwitchCamera,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Check,
} from 'lucide-react';
import { validateSelfieImage, type SelfieValidationResult } from '../services/selfie-validator';

export function CameraCapture({
  onCapture,
  onClose,
  mode = 'face',
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  mode?: 'face' | 'body';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [timerSeconds, setTimerSeconds] = useState<0 | 3 | 5>(mode === 'body' ? 3 : 0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Captured photo validation states
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<SelfieValidationResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access isn’t available in this browser. Please enable camera access in your browser settings.');
      return;
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: mode === 'body' ? 1080 : 1280 },
          height: { ideal: mode === 'body' ? 1920 : 1280 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            'We couldn’t access your camera. Please check your browser’s camera permission and ensure no other app is using the webcam.',
          );
        }
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [facingMode, mode]);

  const executeCapture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      // Mirror horizontally for front-facing camera
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);

    setCapturedUrl(dataUrl);
    setIsValidating(true);
    setValidationResult(null);

    // Validate captured photo for blur, lighting, and full face presence
    try {
      const result = await validateSelfieImage(canvas, mode);
      setValidationResult(result);
    } catch {
      setValidationResult({ valid: true });
    } finally {
      setIsValidating(false);
    }
  };

  const handleCaptureClick = () => {
    if (countdown !== null) return;
    if (timerSeconds === 0) {
      executeCapture();
      return;
    }

    setCountdown(timerSeconds);
    let current = timerSeconds;
    const interval = window.setInterval(() => {
      current -= 1;
      if (current <= 0) {
        window.clearInterval(interval);
        setCountdown(null);
        executeCapture();
      } else {
        setCountdown(current);
      }
    }, 1000);
  };

  const handleRetake = () => {
    setCapturedUrl(null);
    setValidationResult(null);
    setIsValidating(false);
  };

  const handleConfirm = () => {
    if (!capturedUrl || !validationResult?.valid) return;
    onCapture(capturedUrl);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const cycleTimer = () => {
    setTimerSeconds((prev) => (prev === 0 ? 3 : prev === 3 ? 5 : 0));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'body' ? 'Take full body selfie' : 'Take a selfie'}
    >
      {/* Top action bar: Close button */}
      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <button
          type="button"
          onClick={onClose}
          data-testid="button-camera-close"
          aria-label="Close camera"
          className="focus-ring grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition-all hover:bg-white/25 active:scale-90"
        >
          <X size={20} />
        </button>
      </div>

      {error ? (
        <div className="max-w-sm rounded-2xl bg-card p-6 text-center text-foreground border border-border">
          <p className="font-semibold text-base">Camera unavailable</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-camera-dismiss"
            className="focus-ring mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center max-w-sm w-full">
          {/* Camera / Preview Frame */}
          <div
            className={`relative w-full overflow-hidden rounded-[2rem] border-2 border-white/20 bg-black shadow-2xl ${
              mode === 'body' ? 'aspect-[9/16] max-h-[62vh]' : 'aspect-[3/4] max-h-[62vh]'
            }`}
          >
            {/* Live Video Feed (Hidden when previewing captured selfie) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`size-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''} ${
                capturedUrl ? 'hidden' : 'block'
              }`}
              data-testid="video-camera-preview"
            />

            {/* Captured Still Preview */}
            {capturedUrl && (
              <img
                src={capturedUrl}
                alt="Captured selfie preview"
                className="size-full object-cover"
              />
            )}

            {/* Connecting Camera Spinner */}
            {!ready && !capturedUrl && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/70 bg-black/80">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin text-[#D9BC96]" size={24} />
                  <span>Connecting camera…</span>
                </div>
              </div>
            )}

            {/* Countdown Overlay */}
            {countdown !== null && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-[2px]">
                <span className="font-serif text-8xl font-bold text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] animate-pulse">
                  {countdown}
                </span>
              </div>
            )}

            {/* Live Guide Overlay Markers (Shown only during live framing) */}
            {ready && countdown === null && !capturedUrl && (
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
                <div className="mx-auto rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm border border-white/10">
                  {mode === 'body'
                    ? 'Full body · Head to toe in frame'
                    : 'Face selfie · Natural front light'}
                </div>

                {mode === 'body' ? (
                  <div className="mx-auto my-auto size-4/5 rounded-3xl border-2 border-dashed border-white/30" />
                ) : (
                  <div className="mx-auto my-auto aspect-[3/4] h-3/5 rounded-full border-2 border-dashed border-white/30" />
                )}

                <div className="text-center text-[11px] text-white/80 bg-black/50 backdrop-blur-sm rounded-lg py-1 px-2">
                  {mode === 'body'
                    ? 'Stand 6–8 ft away · prop phone upright'
                    : 'Hold at eye level · forehead to chin visible'}
                </div>
              </div>
            )}

            {/* Analyzing Photo Quality Spinner */}
            {isValidating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-6 text-center backdrop-blur-sm">
                <RefreshCw className="animate-spin text-[#D9BC96] mb-3" size={32} />
                <p className="text-sm font-bold text-white">Checking photo clarity...</p>
                <p className="mt-1 text-xs text-white/70">Ensuring sharp focus and full face visibility</p>
              </div>
            )}

            {/* VALIDATION ERROR OVERLAY: Photo is Blur or Full Face Cut Off */}
            {capturedUrl && !isValidating && validationResult && !validationResult.valid && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 p-6 text-center backdrop-blur-md animate-in fade-in duration-200">
                <div className="grid size-14 place-items-center rounded-full bg-red-500/20 text-red-400 border border-red-500/30 mb-3 shadow-lg">
                  <AlertTriangle size={28} />
                </div>
                <h4 className="font-serif text-lg font-bold text-white">
                  {validationResult.title || 'Photo Needs Retake'}
                </h4>
                <p className="mt-2 text-xs leading-relaxed text-white/85 max-w-xs">
                  {validationResult.message || 'Selfie is blurry or full face is not in the frame. Please hold steady and try again.'}
                </p>

                <button
                  type="button"
                  onClick={handleRetake}
                  data-testid="button-camera-retake"
                  className="focus-ring mt-5 inline-flex items-center gap-2 rounded-full bg-[#D9BC96] px-6 py-2.5 text-xs font-bold text-[#194A49] shadow-xl hover:bg-[#cfaf86] active:scale-95 transition"
                >
                  <RotateCcw size={15} /> Retake Selfie
                </button>
              </div>
            )}

            {/* SUCCESS BADGE: Valid clear photo */}
            {capturedUrl && !isValidating && validationResult?.valid && (
              <div className="absolute top-4 inset-x-4 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-3.5 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-md border border-emerald-400/30">
                  <CheckCircle2 size={14} className="text-emerald-200" />
                  <span>Face in clear focus & ready</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Dock Controls */}
          {capturedUrl && !isValidating && validationResult?.valid ? (
            /* Action controls when photo passes validation */
            <div className="mt-5 flex w-full items-center justify-center gap-4 px-6">
              <button
                type="button"
                onClick={handleRetake}
                data-testid="button-camera-retake-confirm"
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-xs font-bold text-white backdrop-blur-md hover:bg-white/20 active:scale-95 transition"
              >
                <RotateCcw size={15} /> Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                data-testid="button-camera-confirm"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-xl hover:bg-emerald-500 active:scale-95 transition"
              >
                <Check size={16} /> Confirm Selfie
              </button>
            </div>
          ) : !capturedUrl ? (
            /* Live Camera Controls Dock (Native camera-app style) */
            <div className="mt-5 flex w-full items-center justify-between px-6 sm:px-8">
              {/* Timer Button */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  type="button"
                  onClick={cycleTimer}
                  data-testid="button-camera-timer"
                  aria-label={`Toggle camera timer. Currently ${timerSeconds === 0 ? 'Off' : `${timerSeconds} seconds`}`}
                  className={`focus-ring relative grid size-12 place-items-center rounded-full border transition-all active:scale-90 ${
                    timerSeconds > 0
                      ? 'border-[#D9BC96] bg-[#D9BC96] text-[#194A49] shadow-[0_0_16px_rgba(217,188,150,0.5)]'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md'
                  }`}
                >
                  <Timer size={20} />
                  {timerSeconds > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#194A49] text-[10px] font-bold text-[#D9BC96]">
                      {timerSeconds}
                    </span>
                  )}
                </button>
                <span className="text-[11px] font-semibold tracking-wide text-white/80">
                  {timerSeconds === 0 ? 'Timer' : `${timerSeconds}s`}
                </span>
              </div>

              {/* Shutter Capture Button */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handleCaptureClick}
                  disabled={!ready || countdown !== null}
                  data-testid="button-camera-capture"
                  aria-label="Capture photo"
                  className="focus-ring grid size-20 place-items-center rounded-full border-4 border-white bg-white/20 p-1 shadow-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
                >
                  <span className="size-14 rounded-full bg-white shadow-[0_2px_12px_rgba(0,0,0,0.35)] transition-transform active:scale-90" />
                </button>
              </div>

              {/* Flip / Switch Camera Button */}
              <div className="flex flex-col items-center gap-1.5 w-16">
                <button
                  type="button"
                  onClick={toggleCamera}
                  data-testid="button-camera-flip"
                  aria-label={`Switch camera. Currently ${facingMode === 'user' ? 'Front' : 'Rear'}`}
                  className="focus-ring grid size-12 place-items-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20 backdrop-blur-md transition-all active:scale-90"
                >
                  <SwitchCamera size={21} className="transition-transform duration-300" />
                </button>
                <span className="text-[11px] font-semibold tracking-wide text-white/80">
                  {facingMode === 'user' ? 'Front' : 'Rear'}
                </span>
              </div>
            </div>
          ) : null}

          {/* Helper hint */}
          <p className="mt-3 text-xs text-white/70 text-center font-medium">
            {capturedUrl && validationResult?.valid
              ? 'Preview your photo — tap Confirm to proceed'
              : countdown !== null
              ? 'Get into position!'
              : timerSeconds > 0
              ? `Capture starts ${timerSeconds}s countdown`
              : 'Tap to capture your selfie'}
          </p>
        </div>
      )}
    </div>
  );
}
