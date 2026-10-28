'use client';

import { toast } from 'sonner';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Pre-warms or resumes AudioContext upon user gesture
 * to ensure smooth playback across iOS Safari and Chrome.
 */
export function warmAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {
    // Graceful fallback if audio context cannot be initialized yet
  }
}

/**
 * Plays an elegant, luxury 3-tone chime (E5 -> A5 -> E6) using Web Audio API.
 * 100% self-contained, offline-capable, and zero-latency.
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Note 1: 659.25 Hz (E5) - Initial warm chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);

    // Note 2: 880 Hz (A5) - Uplifting major harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.65);

    // Note 3: 1318.51 Hz (E6) - Crystalline sparkle resolve
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(1318.51, now + 0.24);
    gain3.gain.setValueAtTime(0, now + 0.24);
    gain3.gain.linearRampToValueAtTime(0.2, now + 0.28);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.24);
    osc3.stop(now + 0.85);

    // Gentle haptic feedback on supported mobile devices
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch {
        // Ignore vibration errors if blocked by platform
      }
    }
  } catch (err) {
    console.warn('Could not play notification sound:', err);
  }
}

/**
 * Requests browser desktop notification permissions if supported.
 */
export function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      // Ignore unsupported browser contexts
    }
  }
}

/**
 * Dispatches a complete notification (sound + toast + desktop notification)
 * when looks and look images finish generating.
 */
export function notifyLooksGenerated({
  title = 'Your looks are ready! ✨',
  description = 'Your 5 personalized outfits have been styled and generated.',
}: {
  title?: string;
  description?: string;
} = {}) {
  // 1. Play crystal-clear audio chime
  playNotificationSound();

  // 2. Display premium visual toast in the app
  toast.success(title, {
    description,
    duration: 6000,
    style: {
      background: '#FAF5EE',
      color: '#194A49',
      borderColor: '#B08A70',
      boxShadow: '0 10px 30px -10px rgba(25, 74, 73, 0.25)',
    },
  });

  // 3. Fire browser system notification (in case tab is in background)
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, {
        body: description,
        icon: '/favicon.svg',
      });
    } catch {
      // Browser notification dispatch failure handled gracefully
    }
  }
}
