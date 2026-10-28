'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Timer, Upload } from 'lucide-react';

export function CameraCapture({
  onCapture,
  onClose,
  mode = 'face',
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
  mode?: 'face' | 'body';
}) {
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [timerSeconds, setTimerSeconds] = useState<0 | 3 | 5>(mode === 'body' ? 3 : 0);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while camera is open so nothing scrolls behind it
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
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
          videoRef.current.onloadedmetadata = () => {
            setReady(true);
            if (videoRef.current) {
              setIsLandscape(videoRef.current.videoWidth > videoRef.current.videoHeight);
            }
          };
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
  }, [facingMode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
          onCapture(canvas.toDataURL('image/jpeg', 0.92));
        } else {
          onCapture(raw);
        }
      };
      img.onerror = () => onCapture(raw);
      img.src = raw;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const executeCapture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      // Mirror horizontally for front-facing camera
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
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

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const cycleTimer = () => {
    setTimerSeconds((prev) => (prev === 0 ? 3 : prev === 3 ? 5 : 0));
  };

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col justify-between bg-black text-white h-[100dvh] w-full overflow-hidden select-none touch-none"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'body' ? 'Take full body selfie' : 'Take a selfie'}
    >
      {/* Top action bar: Mode title & Upload + Close buttons */}
      <header className="h-14 sm:h-16 shrink-0 w-full px-4 flex items-center justify-between z-20">
        <span className="rounded-full bg-white/15 px-3.5 py-1 text-xs font-semibold tracking-wide text-white backdrop-blur-md border border-white/10">
          {mode === 'body' ? 'Full Body Selfie' : 'Face Selfie'}
        </span>

        <div className="flex items-center gap-2">
          {/* Upload photo button inside camera view */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-camera-upload"
            aria-label="Upload photo from device"
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition backdrop-blur-md border border-white/15 active:scale-95 shadow-xs"
          >
            <Upload size={13} />
            <span>Upload Photo</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />

          <button
            type="button"
            onClick={onClose}
            data-testid="button-camera-close"
            aria-label="Close camera"
            className="focus-ring grid size-9 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition backdrop-blur-md border border-white/10 active:scale-95"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      {/* Main Viewport: Viewfinder centered and flex-contained so it adapts to available height */}
      <main className="flex-1 min-h-0 w-full flex items-center justify-center px-3 py-1 overflow-hidden">
        {error ? (
          <div className="max-w-sm rounded-2xl bg-[#1c1c1c] p-6 text-center text-white border border-white/10 shadow-2xl">
            <p className="font-semibold text-base text-white">Camera unavailable</p>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{error}</p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-camera-error-upload"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-[#D9BC96] px-5 py-2.5 text-sm font-bold text-[#194A49] shadow-md hover:bg-[#cfaf86]"
              >
                <Upload size={15} />
                <span>Upload Photo Instead</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="button-camera-dismiss"
                className="focus-ring rounded-full border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Camera Viewfinder Frame: adapts dynamically to remaining height without overflowing */
          <div
            className={`relative overflow-hidden rounded-[1.6rem] sm:rounded-[2rem] border-2 border-white/20 bg-black shadow-2xl flex items-center justify-center h-full max-h-full w-auto max-w-full ${
              isLandscape
                ? 'aspect-[4/3] sm:aspect-video'
                : mode === 'body'
                ? 'aspect-[3/4] sm:aspect-[9/16]'
                : 'aspect-[3/4]'
            }`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`size-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              data-testid="video-camera-preview"
            />

            {!ready && (
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

            {/* Guide overlay markers */}
            {ready && countdown === null && (
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-4">
                <div className="mx-auto rounded-full bg-black/60 px-3 py-0.5 text-[10px] sm:text-[11px] font-semibold tracking-wide text-white/90 backdrop-blur-sm border border-white/10">
                  {mode === 'body'
                    ? 'Full body · Head to toe in frame'
                    : 'Face selfie · Natural front light'}
                </div>

                {mode === 'body' ? (
                  <div className="mx-auto my-auto w-3/5 sm:w-1/2 h-4/5 rounded-3xl border-2 border-dashed border-white/35" />
                ) : (
                  <div className="mx-auto my-auto aspect-[3/4] h-3/5 rounded-full border-2 border-dashed border-white/35" />
                )}

                <div className="text-center text-[10px] sm:text-[11px] text-white/90 bg-black/60 backdrop-blur-sm rounded-lg py-1 px-2.5 max-w-xs mx-auto border border-white/10">
                  {mode === 'body'
                    ? 'Stand 6–8 ft away · entire body visible'
                    : 'Hold at eye level · forehead to chin visible'}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Shutter Button & Controls: Fixed at bottom with safe padding, NEVER cut off */}
      {!error && (
        <footer className="shrink-0 w-full max-w-md mx-auto flex flex-col items-center justify-center pt-1.5 pb-4 sm:pb-6 px-4 z-20">
          <div className="flex items-center justify-center gap-6 sm:gap-8 w-full">
            {/* Timer button (Side of click button) */}
            <button
              type="button"
              onClick={cycleTimer}
              disabled={countdown !== null}
              data-testid="button-camera-timer"
              aria-label="Toggle camera timer"
              className={`focus-ring flex flex-col items-center justify-center size-11 sm:size-12 rounded-full transition active:scale-95 border ${
                timerSeconds > 0
                  ? 'bg-[#D9BC96] text-[#194A49] border-[#D9BC96] shadow-md shadow-[#D9BC96]/20'
                  : 'bg-white/20 text-white border-white/25 hover:bg-white/30'
              }`}
              title="Camera timer"
            >
              <Timer size={16} />
              <span className="text-[9px] sm:text-[9.5px] font-bold mt-0.5 leading-none">
                {timerSeconds === 0 ? 'Off' : `${timerSeconds}s`}
              </span>
            </button>

            {/* Shutter Click Button (Center) */}
            <button
              type="button"
              onClick={handleCaptureClick}
              disabled={!ready || countdown !== null}
              data-testid="button-camera-capture"
              aria-label="Capture photo"
              className="focus-ring grid size-16 sm:size-18 place-items-center rounded-full border-4 border-white bg-white/20 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 shadow-xl"
            >
              <span className="size-12 sm:size-14 rounded-full bg-white shadow-lg" />
            </button>

            {/* Flip / Switch camera button (Side of click button) */}
            <button
              type="button"
              onClick={toggleCamera}
              disabled={countdown !== null}
              data-testid="button-camera-flip"
              aria-label="Switch camera"
              className="focus-ring flex flex-col items-center justify-center size-11 sm:size-12 rounded-full border border-white/25 bg-white/20 text-white hover:bg-white/30 transition active:scale-95"
              title="Switch camera"
            >
              <RefreshCw size={15} />
              <span className="text-[9px] sm:text-[9.5px] font-bold mt-0.5 leading-none">
                {facingMode === 'user' ? 'Front' : 'Rear'}
              </span>
            </button>
          </div>

          <p className="mt-1.5 text-[11px] sm:text-xs text-white/75 text-center">
            {countdown !== null
              ? 'Get into position!'
              : timerSeconds > 0
              ? `Tapping capture starts a ${timerSeconds}s countdown`
              : 'Tap to capture your selfie'}
          </p>
        </footer>
      )}
    </div>,
    document.body
  );
}
