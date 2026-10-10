'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access isn’t available in this browser. Try “Choose from Gallery” instead.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
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
        if (!cancelled)
          setError(
            'We couldn’t access your camera. Check your browser’s camera permission, or use “Choose from Gallery” instead.',
          );
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Mirror horizontally so the captured photo matches preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Take a selfie"
    >
      <button
        type="button"
        onClick={onClose}
        data-testid="button-camera-close"
        aria-label="Close camera"
        className="focus-ring absolute right-4 top-4 grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X size={20} />
      </button>
      {error ? (
        <div className="max-w-sm rounded-2xl bg-card p-6 text-center">
          <p className="font-semibold">Camera unavailable</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-camera-dismiss"
            className="focus-ring mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
          >
            Got it
          </button>
        </div>
      ) : (
        <>
          <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-[1.5rem] bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="size-full scale-x-[-1] object-cover"
              data-testid="video-camera-preview"
            />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/70">
                Starting camera…
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            data-testid="button-camera-capture"
            aria-label="Capture photo"
            className="focus-ring mt-6 grid size-16 place-items-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
          >
            <span className="size-12 rounded-full bg-white" />
          </button>
          <p className="mt-4 text-sm text-white/70">Center your face, then tap to capture.</p>
        </>
      )}
    </div>
  );
}
