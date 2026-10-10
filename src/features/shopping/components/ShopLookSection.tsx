'use client';

import { useEffect, useState } from 'react';
import {
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Info,
  RefreshCw,
  Check,
  Tag,
  AlertCircle,
  ShieldCheck,
  Layers,
  Key,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { getProductRecommendations } from '../services/product-recommendations';
import type {
  LookRecommendation,
  ProductCategory,
  ProductGroup,
  ProductResult,
  SkinTuneProfile,
  KeyDiagnostic,
} from '@/types';

interface ShopLookSectionProps {
  look: LookRecommendation;
  profile: SkinTuneProfile;
}

export function ShopLookSection({ look, profile }: ShopLookSectionProps) {
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'partial' | 'unavailable'>('idle');
  const [disclaimer, setDisclaimer] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [persona, setPersona] = useState<string>('woman');
  const [applicableCategories, setApplicableCategories] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<KeyDiagnostic[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Detect persona
  const pronouns = (profile.pronouns || '').toLowerCase();
  const age = (profile.ageGroup || '').toLowerCase();
  const isChild =
    age.includes('kids') ||
    age.includes('0–12') ||
    age.includes('0-12') ||
    age.includes('child') ||
    pronouns.includes('kids') ||
    pronouns.includes('children');
  const isMan = !isChild && pronouns.includes('men');

  const checkLiveHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/healthz');
      const data = await res.json();
      setHealthStatus(data);
    } catch (e) {
      console.error('Health check failed:', e);
      setHealthStatus({ status: 'error', error: String(e) });
    } finally {
      setCheckingHealth(false);
    }
  };

  const fetchProducts = async (cat?: ProductCategory | 'all') => {
    setLoading(true);
    setStatus('loading');
    try {
      const response = await getProductRecommendations(look, profile, cat);
      setProducts(response.products || []);
      setGroups(response.groups || []);
      setStatus(response.status);
      setDisclaimer(response.disclaimer || '');
      setPersona(response.persona || (isChild ? 'child' : isMan ? 'man' : 'woman'));
      setApplicableCategories(response.applicableCategories || ['outfit', 'footwear', 'accessories']);
      setDiagnostics(response.diagnostics || []);
      setErrorMessage(response.errorMessage || '');
    } catch (err) {
      console.warn('Failed to load products:', err);
      setStatus('unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.id]);

  // Filter products by selected tab
  const filteredProducts =
    activeCategory === 'all'
      ? products
      : products.filter((p) => {
          if (activeCategory === 'footwear-accessories') {
            return p.category === 'footwear' || p.category === 'accessories';
          }
          return p.category === activeCategory;
        });

  // Filter groups by selected tab
  const filteredGroups =
    activeCategory === 'all'
      ? groups
      : groups.filter((g) => {
          if (activeCategory === 'footwear-accessories') {
            return g.category === 'footwear' || g.category === 'accessories';
          }
          return g.category === activeCategory;
        });

  // Calculate available categories for tabs
  const availableTabs: { id: string; label: string; icon: string }[] = [
    { id: 'all', label: 'All Finds', icon: '🛍️' },
    { id: 'outfit', label: 'Outfit', icon: '👗' },
  ];

  if (!isChild && !isMan) {
    availableTabs.push({ id: 'makeup', label: 'Makeup & Beauty', icon: '💄' });
  }

  if (!isChild) {
    availableTabs.push({ id: 'jewellery', label: isMan ? 'Jewellery & Watches' : 'Jewellery', icon: '💎' });
  }

  availableTabs.push({ id: 'footwear-accessories', label: 'Footwear & Accessories', icon: '👠' });

  // Render a single product card
  const renderProductCard = (product: ProductResult) => {
    const isExactAndVerified =
      product.urlType === 'exact_product' && product.priceVerified && product.productVerified;

    return (
      <article
        key={product.id}
        className="group relative flex flex-col justify-between overflow-hidden rounded-[1.35rem] border border-border bg-card p-5 transition duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_12px_32px_hsl(var(--foreground)/.06)]"
        data-testid={`card-product-${product.id}`}
      >
        <div>
          {/* Optional Real Product Image */}
          {product.imageUrl && (
            <div className="mb-4 overflow-hidden rounded-xl border border-border/40 bg-secondary/30">
              <img
                src={product.imageUrl}
                alt={product.productName}
                className="h-44 w-full object-cover object-top transition duration-300 group-hover:scale-105"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Badges: Retailer, Price Tier & Match Score */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">
              <Tag size={11} className="text-primary" />
              {product.retailer}
            </span>

            <div className="flex items-center gap-1.5">
              {product.priceTier && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    product.priceTier === 'budget'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : product.priceTier === 'premium'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-primary/10 text-primary'
                  }`}
                >
                  {product.priceTier === 'budget'
                    ? 'Budget Pick'
                    : product.priceTier === 'premium'
                    ? 'Premium Pick'
                    : 'Mid-Range'}
                </span>
              )}

              {product.matchScore && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  <Sparkles size={10} />
                  {product.matchScore}%
                </span>
              )}
            </div>
          </div>

          {/* Subcategory */}
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[.14em] text-muted-foreground">
            {product.subcategory}
          </p>

          {/* Brand & Title */}
          <h3 className="mt-1 text-base font-bold text-foreground">
            {product.brand}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground" title={product.productName}>
            {product.productName}
          </p>

          {/* Material & Shade Tags */}
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {product.material && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Material:</span>
                <span>{product.material}</span>
              </span>
            )}
            {product.shade && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                <span className="font-semibold text-foreground">Shade:</span>
                <span>{product.shade}</span>
              </span>
            )}
          </div>

          {/* Price & Availability */}
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              {product.formattedPrice || (product.price ? `₹${product.price}` : 'Check store price')}
            </span>

            {product.formattedOriginalPrice && (
              <span className="text-xs text-muted-foreground line-through">
                {product.formattedOriginalPrice}
              </span>
            )}

            {product.priceVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={11} />
                Verified Price
              </span>
            )}

            {product.availability && (
              <span
                className={`text-[11px] font-medium ${
                  product.availability === 'Out of Stock' ? 'text-amber-500' : 'text-emerald-500'
                }`}
              >
                • {product.availability}
              </span>
            )}
          </div>

          {/* Why it matches */}
          <div className="mt-3 rounded-xl border border-border/60 bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="flex items-start gap-1.5">
              <Check size={14} className="mt-0.5 shrink-0 text-primary" />
              <span>{product.matchReason}</span>
            </p>
          </div>
        </div>

        {/* Shop CTA: opens real product URL in new tab */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <a
            href={product.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`link-product-${product.id}`}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition hover:brightness-105"
          >
            {isExactAndVerified
              ? `View on ${product.retailer}`
              : `Search on ${product.retailer}`}
            <ExternalLink size={13} />
          </a>
        </div>
      </article>
    );
  };

  return (
    <section className="mt-12 rounded-[1.8rem] border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-md sm:p-8" data-testid="shop-look-section">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/15 text-primary">
              <ShoppingBag size={18} />
            </span>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">
              Shop This Look · Real Curated Finds
            </p>
          </div>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
            Recreate this look
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isChild
              ? 'Age-appropriate, comfortable clothing and accessories matched to your budget.'
              : isMan
              ? 'Sharp tailoring, footwear, and accessories matched to your tone, build, and occasion.'
              : 'Real, shoppable fashion, shade-matched beauty, and jewellery across multiple retailers & price points.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchProducts(activeCategory as ProductCategory | 'all')}
          disabled={loading}
          data-testid="button-refresh-products"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-bold transition hover:border-primary/50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Searching real stores…' : 'Refresh products'}
        </button>
      </div>

      {/* Category Filter Pills */}
      <div className="mt-6 flex flex-wrap gap-2">
        {availableTabs.map((tab) => {
          const isSelected = activeCategory === tab.id;
          const count =
            tab.id === 'all'
              ? products.length
              : tab.id === 'footwear-accessories'
              ? products.filter((p) => p.category === 'footwear' || p.category === 'accessories').length
              : products.filter((p) => p.category === tab.id).length;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              data-testid={`tab-shop-${tab.id}`}
              className={`focus-ring inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {products.length > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* AI Shade Matching Disclaimer (if makeup tab active or any makeup shown) */}
      {!isChild && !isMan && (activeCategory === 'makeup' || activeCategory === 'all') && disclaimer && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground">
          <Info size={16} className="mt-0.5 shrink-0 text-primary" />
          <p className="leading-relaxed">
            <strong className="font-semibold text-foreground">AI Beauty & Shade Note: </strong>
            {disclaimer}
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-8 flex flex-col items-center justify-center py-16 text-center" data-testid="loading-products">
          <div className="relative mb-4">
            <div className="size-12 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            <ShoppingBag size={20} className="absolute inset-0 m-auto text-primary" />
          </div>
          <p className="font-serif text-xl font-medium">Searching verified real products…</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Querying Myntra, Nykaa, Ajio, Amazon, and Tata CLiQ for verified pieces across price tiers.
          </p>
        </div>
      )}

      {/* Grouped Products Layout */}
      {!loading && filteredGroups.length > 0 && (
        <div className="mt-8 space-y-10" data-testid="grouped-products-container">
          {filteredGroups.map((group, gIdx) => (
            <div key={`${group.category}-${gIdx}`} className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary text-xs">
                    <Layers size={14} />
                  </span>
                  <h3 className="font-serif text-xl font-semibold text-foreground">
                    {group.recommendedItemTitle}
                  </h3>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {group.stylingRequirement}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.products.map(renderProductCard)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat Product Grid fallback if groups empty */}
      {!loading && filteredGroups.length === 0 && filteredProducts.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-products">
          {filteredProducts.map(renderProductCard)}
        </div>
      )}

      {/* Fallback diagnostic banner if fallback was used */}
      {!loading && filteredProducts.length > 0 && diagnostics.some((d) => d.status === 'degraded') && (
        <div className="mt-6 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full bg-primary/20 text-primary">⚡</span>
            <span>Live product recommendations retrieved via <strong>Tavily Search</strong> fallback.</span>
          </div>
          <span className="text-[11px] text-muted-foreground/80">Links verified & direct</span>
        </div>
      )}

      {/* Unavailable or empty state with full Diagnostic Panel */}
      {!loading && filteredProducts.length === 0 && (
        <div className="mt-8 rounded-2xl border border-border/80 bg-secondary/30 p-6 sm:p-8" data-testid="empty-products">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-card shadow-sm">
              {diagnostics.length > 0 ? (
                <Key size={22} className="text-amber-500" />
              ) : (
                <AlertCircle size={22} className="text-muted-foreground" />
              )}
            </div>

            <h3 className="font-serif text-xl font-semibold">
              {status === 'unavailable'
                ? 'Product links could not be loaded'
                : 'No matching products found in this category'}
            </h3>

            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
              {status === 'unavailable'
                ? 'We could not fetch live retailer links from Myntra, Nykaa, or Ajio. Below is the diagnostic report detailing which API key was used and the root cause.'
                : 'Try selecting "All Finds" or refreshing the search to see pieces across other categories.'}
            </p>
          </div>

          {/* Diagnostic Details Box */}
          {(diagnostics.length > 0 || errorMessage) && (
            <div className="mx-auto mt-6 max-w-2xl space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle size={15} />
                <span>API Key & Discovery Diagnostics:</span>
              </div>

              {diagnostics.map((diag, dIdx) => (
                <div
                  key={`diag-${dIdx}`}
                  className="rounded-lg border border-border/60 bg-card p-3 text-xs shadow-sm space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-foreground">
                      🔑 {diag.keyName || diag.provider.toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        diag.status === 'invalid_key'
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                          : diag.status === 'missing_key'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : diag.status === 'rate_limited'
                          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                          : diag.status === 'degraded'
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {diag.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    <strong className="text-foreground">Cause:</strong> {diag.message}
                  </p>

                  {diag.suggestedFix && (
                    <p className="text-[11px] text-primary/90 bg-primary/5 rounded p-2 border border-primary/20">
                      💡 <strong>Suggested Fix:</strong> {diag.suggestedFix}
                    </p>
                  )}
                </div>
              ))}

              {errorMessage && !diagnostics.length && (
                <div className="rounded-lg border border-border/60 bg-card p-3 text-xs">
                  <p className="text-muted-foreground text-[11px]">
                    <strong className="text-foreground">Error Details:</strong> {errorMessage}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Live Key Health Inspection */}
          <div className="mx-auto mt-5 max-w-2xl text-center space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={checkLiveHealth}
                disabled={checkingHealth}
                className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold hover:border-primary/50 disabled:opacity-50"
              >
                <Key size={13} className={checkingHealth ? 'animate-spin' : ''} />
                {checkingHealth ? 'Inspecting keys…' : 'Inspect API Keys (/api/healthz)'}
              </button>

              <button
                type="button"
                onClick={() => fetchProducts('all')}
                disabled={loading}
                data-testid="button-retry-fetch-products"
                className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Retry discovery
              </button>
            </div>

            {healthStatus && (
              <div className="mt-3 rounded-xl border border-border bg-card p-4 text-left text-xs space-y-2">
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-semibold text-foreground">Server Key Status Report:</span>
                  <span className="text-[10px] text-muted-foreground">{healthStatus.timestamp}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-secondary/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">OPENAI_API_KEY</span>
                      {healthStatus.keys?.openai?.configured ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> Configured
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-500">Missing</span>
                      )}
                    </div>
                    {healthStatus.keys?.openai?.maskedKey && (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        Key: {healthStatus.keys.openai.maskedKey} ({healthStatus.keys.openai.validFormat ? 'Valid format' : 'Unrecognized format'})
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Model: {healthStatus.keys?.openai?.model || 'gpt-4o-mini'}
                    </p>
                  </div>

                  <div className="rounded-lg bg-secondary/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">TAVILY_API_KEY</span>
                      {healthStatus.keys?.tavily?.configured ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> Configured
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-red-500">Missing</span>
                      )}
                    </div>
                    {healthStatus.keys?.tavily?.maskedKey && (
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        Key: {healthStatus.keys.tavily.maskedKey} ({healthStatus.keys.tavily.validFormat ? 'Valid format' : 'Unrecognized format'})
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
