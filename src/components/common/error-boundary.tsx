'use client';

import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    if (value.message === '[object Event]' || value.message === '[object Object]') {
      return new Error('A browser network or resource event failed to load. A page refresh usually resolves this.');
    }
    if (
      value.message.includes("Cannot read properties of undefined (reading 'call')") ||
      value.message.includes('options.factory')
    ) {
      return new Error('A background build or chunk update invalidated modules. Refreshing the page will load the newest code.');
    }
    return value;
  }
  if (typeof value === 'string') {
    if (value === '[object Event]' || value === '[object Object]') {
      return new Error('A browser network or resource event failed to load. Please refresh the page.');
    }
    if (
      value.includes("Cannot read properties of undefined (reading 'call')") ||
      value.includes('options.factory')
    ) {
      return new Error('A background build or chunk update invalidated modules. Refreshing the page will load the newest code.');
    }
    return new Error(value);
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    // Native DOM Event, ProgressEvent, or ErrorEvent
    if ('type' in obj || 'target' in obj || 'isTrusted' in obj) {
      const type = typeof obj.type === 'string' ? obj.type : 'error';
      return new Error(
        `Browser event error (${type}). This commonly happens during hot-reloading or when assets update in the background. A quick page refresh will reload the newest assets.`
      );
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') {
        return new Error(json);
      }
    } catch {
      // ignore
    }
  }
  const str = String(value);
  if (str === '[object Event]' || str === '[object Object]') {
    return new Error('A browser network or resource event failed to load. A page refresh will restore the latest state.');
  }
  return new Error(str);
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const isChunkOrEventError =
    error.message.includes('ChunkLoadError') ||
    error.message.includes('Browser event error') ||
    error.message.includes('failed to load') ||
    error.message.includes("Cannot read properties of undefined (reading 'call')") ||
    error.message.includes('options.factory') ||
    error.message.includes('invalidated modules');

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      resetError();
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          {isChunkOrEventError ? 'App Update or Network Event' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {isChunkOrEventError
            ? 'A background update or resource connection was interrupted. Refreshing the page restores the newest version.'
            : 'This part of the app hit an error. The rest of the app is still running.'}
        </p>
        <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-800">
          {error.message || 'An unexpected runtime error occurred.'}
        </pre>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleReload}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            Reload Page
          </button>
          <button
            type="button"
            onClick={resetError}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
