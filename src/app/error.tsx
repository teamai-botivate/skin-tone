'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { extractErrorMessage } from '@/lib/safe-error';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Next.js caught runtime error:', error);
  }, [error]);

  const cleanMessage = extractErrorMessage(error);
  const isChunkOrEventError =
    cleanMessage.includes('ChunkLoadError') ||
    cleanMessage.includes('Browser event error') ||
    cleanMessage.includes('failed to load') ||
    cleanMessage.includes('network');

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle size={24} />
        </div>
        <h2 className="font-serif text-2xl font-bold">
          {isChunkOrEventError ? 'App Update / Connection Event' : 'Something went wrong'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {isChunkOrEventError
            ? 'A background code update or asset load was interrupted. Refreshing the browser will load the latest version.'
            : cleanMessage}
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition"
          >
            <RefreshCw size={15} /> Reload Page
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-border bg-secondary/50 px-5 py-2.5 text-sm font-semibold text-secondary-foreground hover:bg-secondary transition"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
