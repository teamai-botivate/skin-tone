'use client';

import { type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/common/error-boundary';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ErrorBoundary resetKey="skintune">
        {children}
      </ErrorBoundary>
    </TooltipProvider>
  );
}
