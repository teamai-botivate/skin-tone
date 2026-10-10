// Shopping Session / Search Memory Service (real-dress-avatar-intelligent-tryon branch)
// -----------------------------------------------------------------------------------------
// Tracks the "search memory" this branch's product spec calls for (sections
// 21-27): which dresses have been shown, which the user marked Interested/
// Not Interested (with an optional reason), so "Research Again" and "Refine
// Search" can steer away from repeats without the caller needing to
// reconstruct that history by hand each time.
//
// Lives entirely in memory + is exposed as a plain object rather than a
// class specifically so App.tsx's existing useState-based state management
// (no external state library in this codebase) can hold and update it the
// same way it holds every other piece of screen state — see App.tsx's
// `sessionMemory` state and its handlers for Interested/Not Interested.
// Deliberately NOT persisted to localStorage: a shopping session is
// explicitly temporary/per-visit (this branch's "TEMPORARY SESSION VS
// PERMANENT PROFILE" rule, section 12) — losing it on a hard refresh is the
// correct behavior, not a bug to fix later.

import type { DressResult, SessionMemory } from '@/types';

export const createEmptySessionMemory = (): SessionMemory => ({
  seenTitles: [],
  rejected: [],
  interested: [],
});

/** Records that these dresses were shown in the current page of results — call this once per successful search response, before the user has a chance to give feedback on any of them. */
export const recordSeen = (memory: SessionMemory, dresses: DressResult[]): SessionMemory => ({
  ...memory,
  seenTitles: [...new Set([...memory.seenTitles, ...dresses.map((d) => d.title)])],
});

/** Records an "Interested" click — a soft positive signal (see this branch's product spec section 21: "do NOT permanently assume the user always wants that exact style"), used only to steer future searches, never as a hard filter. */
export const recordInterested = (memory: SessionMemory, dress: DressResult): SessionMemory => ({
  ...memory,
  interested: [...new Set([...memory.interested, dress.title])],
});

/** Records a "Not Interested" click, with an optional quick reason — this IS the actual negative-preference signal (see this branch's product spec section 22), associated with the specific product/reason rather than a blanket category ban. */
export const recordRejected = (memory: SessionMemory, dress: DressResult, reason?: string): SessionMemory => ({
  ...memory,
  rejected: [...memory.rejected, { title: dress.title, reason }],
});
