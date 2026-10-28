'use client';

import { useEffect, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { AuthProvider, AuthModal } from '@/features/auth';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Intercept raw DOM Event rejections or unhandled network events to prevent Next.js dev overlay crash
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (
        reason &&
        (reason instanceof Event ||
          String(reason) === '[object Event]' ||
          (typeof reason === 'object' && ('isTrusted' in reason || 'type' in reason)))
      ) {
        console.warn('Safely intercepted unhandled browser event rejection:', reason);
        event.preventDefault(); // Tells browser / Next.js dev overlay the error has been caught
      }
    };

    // Intercept stale webpack chunk / options.factory runtime mismatch
    const handleError = (event: ErrorEvent) => {
      const msg = event?.message || (event?.error && event.error.message) || '';
      const isWebpackMismatch =
        msg.includes("Cannot read properties of undefined (reading 'call')") ||
        msg.includes('options.factory') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk');

      if (isWebpackMismatch) {
        console.warn('Safely intercepted stale Webpack chunk mismatch error:', msg);
        if (event.preventDefault) event.preventDefault();
        event.stopImmediatePropagation?.();
        try {
          const key = 'webpack_chunk_reload_lock';
          const now = Date.now();
          const last = sessionStorage.getItem(key);
          if (!last || now - parseInt(last, 10) > 8000) {
            sessionStorage.setItem(key, String(now));
            window.location.reload();
          }
        } catch {
          // ignore storage access errors
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError, true);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError, true);
    };
  }, []);

  return (
    <TooltipProvider>
      <ErrorBoundary resetKey="skintune">
        <AuthProvider>
          {children}
          <AuthModal />
          <Toaster position="top-center" closeButton />
        </AuthProvider>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
