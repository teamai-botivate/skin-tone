'use client';

import { useEffect, useRef, useState } from 'react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'body' ? 'Take full body selfie' : 'Take a selfie'}
    >
      {/* Top action bar: Mode title & Upload + Close buttons */}
      <div className="absolute top-4 inset-x-4 flex items-center justify-between z-10 max-w-md mx-auto">
        <span className="rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm border border-white/10">
          {mode === 'body' ? 'Full Body Selfie' : 'Face Selfie'}
        </span>

        <div className="flex items-center gap-2">
          {/* Upload photo button inside camera view */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-camera-upload"
            aria-label="Upload photo from device"
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/30 transition backdrop-blur-sm border border-white/15 active:scale-95 shadow-xs"
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
            className="focus-ring grid size-9 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 transition backdrop-blur-sm border border-white/10"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="max-w-sm rounded-2xl bg-card p-6 text-center text-foreground border border-border">
          <p className="font-semibold text-base">Camera unavailable</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-camera-error-upload"
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              <Upload size={15} />
              <span>Upload Photo Instead</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              data-testid="button-camera-dismiss"
              className="focus-ring rounded-full border border-border px-4 py-2.5 text-sm font-bold text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
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

          {/* Shutter Button & Controls: Timer on Left, Click Button in Center, Swipe/Flip Camera on Right */}
          <div className="mt-5 flex items-center justify-center gap-5 sm:gap-7 w-full max-w-xs">
            {/* Timer button (Side of click button) */}
            <button
              type="button"
              onClick={cycleTimer}
              disabled={countdown !== null}
              data-testid="button-camera-timer"
              aria-label="Toggle camera timer"
              className={`focus-ring flex flex-col items-center justify-center size-13 rounded-full transition active:scale-95 border ${
                timerSeconds > 0
                  ? 'bg-[#D9BC96] text-[#194A49] border-[#D9BC96] shadow-md shadow-[#D9BC96]/20'
                  : 'bg-white/20 text-white border-white/25 hover:bg-white/30'
              }`}
              title="Camera timer"
            >
              <Timer size={18} />
              <span className="text-[10px] font-bold mt-0.5 leading-none">
                {timerSeconds === 0 ? 'Timer Off' : `${timerSeconds}s`}
              </span>
            </button>

            {/* Shutter Click Button (Center) */}
            <button
              type="button"
              onClick={handleCaptureClick}
              disabled={!ready || countdown !== null}
              data-testid="button-camera-capture"
              aria-label="Capture photo"
              className="focus-ring grid size-18 place-items-center rounded-full border-4 border-white bg-white/20 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 shadow-xl"
            >
              <span className="size-14 rounded-full bg-white shadow-lg" />
            </button>

            {/* Flip / Swipe camera button (Side of click button) */}
            <button
              type="button"
              onClick={toggleCamera}
              disabled={countdown !== null}
              data-testid="button-camera-flip"
              aria-label="Switch camera"
              className="focus-ring flex flex-col items-center justify-center size-13 rounded-full border border-white/25 bg-white/20 text-white hover:bg-white/30 transition active:scale-95"
              title="Switch camera"
            >
              <RefreshCw size={17} />
              <span className="text-[10px] font-bold mt-0.5 leading-none">
                {facingMode === 'user' ? 'Front' : 'Rear'}
              </span>
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
