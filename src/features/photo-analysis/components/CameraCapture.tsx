'use client';

import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Timer, Sparkles } from 'lucide-react';

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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'body' ? 'Take full body selfie' : 'Take a selfie'}
    >
      {/* Top action bar */}
      <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10 max-w-md mx-auto">
        <div className="flex items-center gap-2">
          {/* Timer button */}
          <button
            type="button"
            onClick={cycleTimer}
            data-testid="button-camera-timer"
            aria-label="Toggle camera timer"
            className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              timerSeconds > 0
                ? 'bg-[#D9BC96] text-[#194A49]'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <Timer size={14} />
            <span>{timerSeconds === 0 ? 'Timer Off' : `${timerSeconds}s`}</span>
          </button>

          {/* Flip camera button */}
          <button
            type="button"
            onClick={toggleCamera}
            data-testid="button-camera-flip"
            aria-label="Switch camera"
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/25 transition"
          >
            <RefreshCw size={13} />
            <span>{facingMode === 'user' ? 'Front' : 'Rear'}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-testid="button-camera-close"
          aria-label="Close camera"
          className="focus-ring grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition"
        >
          <X size={18} />
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
          {/* Camera Frame */}
          <div
            className={`relative w-full overflow-hidden rounded-[1.8rem] border-2 border-white/20 bg-black shadow-2xl ${
              mode === 'body' ? 'aspect-[9/16] max-h-[68vh]' : 'aspect-[3/4]'
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
          </div>

          {/* Shutter Button & Controls */}
          <div className="mt-5 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={handleCaptureClick}
              disabled={!ready || countdown !== null}
              data-testid="button-camera-capture"
              aria-label="Capture photo"
              className="focus-ring grid size-18 place-items-center rounded-full border-4 border-white bg-white/20 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40"
            >
              <span className="size-14 rounded-full bg-white shadow-lg" />
            </button>
          </div>

          <p className="mt-2.5 text-xs text-white/75 text-center">
            {countdown !== null
              ? 'Get into position!'
              : timerSeconds > 0
              ? `Tapping capture starts a ${timerSeconds}s countdown`
              : 'Tap to capture your selfie'}
          </p>
        </div>
      )}
    </div>
  );
}
