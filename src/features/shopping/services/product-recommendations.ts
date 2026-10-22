import type {
  LookRecommendation,
  SkinTuneProfile,
  ProductCategory,
  ProductRecommendationsResponse,
} from '@/types';

// Client-side cache to instantly return recommendations on look switch or tab navigation
const clientProductCache = new Map<string, ProductRecommendationsResponse>();

/**
 * Fetch real shoppable product recommendations matching a styling look and user profile.
 * Calls backend route `POST /api/product-recommendations`.
 *
 * If the call fails or real search is unavailable, returns a graceful fallback response
 * so the styling recommendation UI remains completely functional.
 */
export async function getProductRecommendations(
  look: LookRecommendation,
  profile: SkinTuneProfile,
  category?: ProductCategory | 'all',
  forceRefresh?: boolean,
): Promise<ProductRecommendationsResponse> {
  const cacheKey = `v8:${look.id}:${category || 'all'}`;

  // Return from client cache immediately if available and refresh was not forced
  if (!forceRefresh) {
    const cached = clientProductCache.get(cacheKey);
    if (cached && cached.products && cached.products.length > 0) {
      return cached;
    }
  }

  try {
    // Strip raw photoUrl to keep payload light
    const { photoUrl: _photoUrl, ...profileForRequest } = profile;

    const res = await fetch('/api/product-recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        look,
        profile: profileForRequest,
        category: category && category !== 'all' ? category : undefined,
        forceRefresh,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || errData?.message || `Request failed with status ${res.status}`);
    }

    const data = (await res.json()) as ProductRecommendationsResponse;
    if (data && data.products && data.products.length > 0) {
      clientProductCache.set(cacheKey, data);
    }
    return data;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('Real product recommendations unavailable:', errMsg);
    return {
      lookId: look.id,
      persona: 'neutral',
      applicableCategories: look.applicableCategories || ['outfit', 'footwear', 'accessories'],
      products: [],
      status: 'unavailable',
      disclaimer: 'Live product discovery is temporarily unavailable. Your styling recommendation above remains fully accessible.',
      searchedAt: new Date().toISOString(),
      totalFound: 0,
      errorMessage: errMsg,
      diagnostics: [
        {
          provider: 'client',
          status: 'error',
          message: errMsg,
          suggestedFix: 'Ensure local Next.js dev server is running and check .env.local configuration.',
        },
      ],
    };
  }
}
