'use client';

import { type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { AuthProvider, AuthModal } from '@/features/auth';

export function Providers({ children }: { children: ReactNode }) {
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
