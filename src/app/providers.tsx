'use client';

import { useEffect, type ReactNode } from 'react';
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

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <TooltipProvider>
      <ErrorBoundary resetKey="skintune">
        <AuthProvider>
          {children}
          <AuthModal />
        </AuthProvider>
      </ErrorBoundary>
    </TooltipProvider>
  );
}
