import type {
  LookRecommendation,
  SkinTuneProfile,
  ProductCategory,
  ProductRecommendationsResponse,
  KeyDiagnostic,
} from '@/types';
import { buildProductCacheFingerprint, PRODUCT_CACHE_VERSION } from '@/lib/product-cache-key';

// Client-side cache to instantly return recommendations on look switch or tab navigation
const clientProductCache = new Map<string, ProductRecommendationsResponse>();

export function clearClientProductCache(): void {
  clientProductCache.clear();
}

// Discovery runs many live searches and retailer page checks server-side; give it time,
// but never leave the section spinning forever if the server stops answering.
export const PRODUCT_REQUEST_TIMEOUT_MS = 150_000;
const NETWORK_RETRY_DELAY_MS = 1_500;

type RequestFailure = { diagnostic: KeyDiagnostic; errorMessage: string };

/**
 * Why a request failed, kept distinct so the UI can say what actually happened: the
 * browser's "Failed to fetch" means the request never got an HTTP response at all
 * (server stopped/restarting, connection dropped) — it is not an API-key or retailer problem.
 */
function describeFailure(kind: 'network' | 'timeout' | 'unauthorized' | 'http' | 'invalid', detail: { status?: number; message?: string; requestId?: string | null }): RequestFailure {
  const ref = detail.requestId ? ` (request ${detail.requestId})` : '';
  switch (kind) {
    case 'network':
      return {
        errorMessage: detail.message || 'Failed to fetch',
        diagnostic: {
          provider: 'network',
          status: 'network_error',
          message: `The request never reached the LetStyle server — the browser got no response (${detail.message || 'Failed to fetch'}). The server may be stopped or restarting, or the connection dropped.`,
          suggestedFix: 'Check your connection and press Retry discovery. If you run LetStyle locally, make sure the app server is running.',
        },
      };
    case 'timeout':
      return {
        errorMessage: 'Request timed out',
        diagnostic: {
          provider: 'network',
          status: 'timeout',
          message: `The LetStyle server did not finish product discovery within ${Math.round(PRODUCT_REQUEST_TIMEOUT_MS / 1000)} seconds.`,
          suggestedFix: 'Press Retry discovery, or pick a single category tab to search fewer items at once.',
        },
      };
    case 'unauthorized':
      return {
        errorMessage: detail.message || 'Authentication required',
        diagnostic: {
          provider: 'auth',
          status: 'unauthorized',
          message: `Your LetStyle account is signed out or your session has expired (HTTP 401)${ref}. This is user account login, not an OpenAI or Tavily API key issue.`,
          suggestedFix: 'Click "Sign in to LetStyle" below to log in or restore your session, then retry discovery.',
        },
      };
    case 'invalid':
      return {
        errorMessage: `Invalid response (HTTP ${detail.status})`,
        diagnostic: {
          provider: 'server',
          status: 'http_error',
          message: `The LetStyle server answered with HTTP ${detail.status} but not with product data${ref}.`,
          suggestedFix: 'Press Retry discovery. If it keeps happening, check the server log for this request.',
        },
      };
    case 'http':
    default:
      return {
        errorMessage: detail.message || `Request failed with status ${detail.status}`,
        diagnostic: {
          provider: 'server',
          status: 'http_error',
          message: `The LetStyle server returned HTTP ${detail.status}: ${detail.message || 'request failed'}${ref}.`,
          suggestedFix: 'Press Retry discovery. If it keeps happening, check the server log for this request.',
        },
      };
  }
}

/**
 * Fetch real shoppable product recommendations matching a styling look and user profile.
 * Calls backend route `POST /api/product-recommendations` (same origin, relative URL).
 *
 * Failures are returned as an 'unavailable' response whose diagnostic states what went
 * wrong (no response / timeout / signed out / server error), so the styling
 * recommendation UI stays usable and the user is told the real cause.
 */
export async function getProductRecommendations(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  category?: ProductCategory | 'all',
  forceRefresh?: boolean,
): Promise<ProductRecommendationsResponse> {
  // Same fingerprint as the server cache, so any material profile/look change misses the cache
  const cacheKey = `${PRODUCT_CACHE_VERSION}:${look.id}:${buildProductCacheFingerprint(look, profile, category)}`;

  // Return from client cache immediately if available and refresh was not forced
  if (!forceRefresh) {
    const cached = clientProductCache.get(cacheKey);
    if (cached && cached.products && cached.products.length > 0) {
      return cached;
    }
  }

  // Strip raw photoUrl to keep payload light
  const { photoUrl: _photoUrl, ...profileForRequest } = profile;
  const body = JSON.stringify({
    look,
    profile: profileForRequest,
    category: category && category !== 'all' ? category : undefined,
    forceRefresh,
  });

  const unavailable = (failure: RequestFailure): ProductRecommendationsResponse => {
    console.warn('Product recommendations unavailable:', failure.diagnostic.status, failure.diagnostic.message);
    return {
      lookId: look.id,
      persona: 'neutral',
      applicableCategories: look.applicableCategories || ['outfit', 'footwear', 'accessories'],
      products: [],
      status: 'unavailable',
      disclaimer: 'Live product discovery is temporarily unavailable. Your styling recommendation above remains fully accessible.',
      searchedAt: new Date().toISOString(),
      totalFound: 0,
      errorMessage: failure.errorMessage,
      diagnostics: [failure.diagnostic],
    };
  };

  // One automatic retry for a request that got no response at all: a dev-server reload
  // or a dropped mobile connection is often gone a moment later. HTTP errors are not retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch('/api/product-recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
        signal: AbortSignal.timeout(PRODUCT_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return unavailable(describeFailure('timeout', {}));
      }
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
        continue;
      }
      return unavailable(describeFailure('network', { message: err instanceof Error ? err.message : String(err) }));
    }

    const requestId = res.headers.get('x-request-id');
    const data = (await res.json().catch(() => null)) as (ProductRecommendationsResponse & { error?: string; message?: string }) | null;

    if (res.status === 401) {
      return unavailable(describeFailure('unauthorized', { status: 401, message: data?.error, requestId }));
    }
    if (!res.ok) {
      return unavailable(describeFailure('http', { status: res.status, message: data?.error || data?.message, requestId }));
    }
    if (!data || !Array.isArray(data.products)) {
      return unavailable(describeFailure('invalid', { status: res.status, requestId }));
    }

    if (data.products.length > 0) {
      clientProductCache.set(cacheKey, data);
    }
    return data;
  }

  // Unreachable: the loop always returns
  return unavailable(describeFailure('network', {}));
}
