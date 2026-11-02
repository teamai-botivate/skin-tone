'use client';

/**
 * Browser side of Web Push: service worker registration, permission and
 * subscription management. The server decides when to notify (see
 * src/lib/push-notifications.ts); this only makes the device reachable.
 */

export type PushSupport = 'supported' | 'unsupported' | 'ios-needs-install';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as macOS
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iOS/iPadOS Safari (16.4+) only exposes Web Push to sites added to the Home Screen.
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return hasApis ? 'supported' : 'unsupported';
}

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const view = new Uint8Array(a);
  return view.length === b.length && view.every((value, i) => value === b[i]);
}

/**
 * Must be called from a user gesture (a click) — browsers hide or block
 * permission prompts that aren't. Never re-prompts once the user decided.
 */
export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (getPushSupport() !== 'supported') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Makes sure this browser has a push subscription registered to the
 * signed-in user. No-op (returns false) unless permission is already
 * granted. Safe to call repeatedly.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  if (getPushSupport() !== 'supported' || Notification.permission !== 'granted') return false;

  const registration = await registerServiceWorker();
  if (!registration) return false;

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) return false;
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    const applicationServerKey = base64UrlToUint8Array(publicKey);

    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
      // Server VAPID key was rotated; the old subscription can't be used any more.
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });
    return res.ok;
  } catch (err) {
    console.warn('Push subscription failed:', err);
    return false;
  }
}
