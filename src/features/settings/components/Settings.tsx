'use client';

import { useState } from 'react';
import type { SkinTuneProfile } from '@/types';
import { Header } from '@/components/common/Header';
import { LockKeyhole, FileText, Trash2, CheckCircle2, ArrowRight } from 'lucide-react';

export function Settings({
  profile,
  onBack,
  onDelete,
  deletedNotice,
}: {
  profile: SkinTuneProfile;
  onBack: () => void;
  onDelete: () => void;
  deletedNotice: boolean;
}) {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="noise min-h-[100dvh]">
      <Header onBack={onBack} onSettings={onBack} name={profile.name} />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-20">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-primary">Privacy, plainly</p>
        <h1 className="mt-4 font-serif text-5xl tracking-[-.04em]">Your space, your call.</h1>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          SkinTune is a frontend prototype. Your profile and feedback live only in this browser's local storage.
          There is no account, server upload, or hidden score. SkinTune never makes medical or diagnostic claims.
        </p>
        <div className="mt-10 space-y-3">
          <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <LockKeyhole className="shrink-0 text-accent" />
            <div>
              <p className="font-semibold">Photo privacy</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your selected photo is used to show your preview in this browser. A future production version
                should use explicit retention controls before any upload.
              </p>
            </div>
          </div>
          <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
            <FileText className="shrink-0 text-primary" />
            <div>
              <p className="font-semibold">What we remember</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Your choices, saved looks, and feedback stay available so returning to SkinTune feels continuous.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-10 rounded-2xl border border-destructive/25 bg-destructive/5 p-5">
          <div className="flex items-start gap-4">
            <Trash2 className="mt-0.5 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold">Delete my SkinTune data</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Remove your saved profile, photo preview, saved looks, and feedback from this browser.
              </p>
              {deletedNotice ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-bold text-accent">
                  <CheckCircle2 size={16} /> Data deleted. Taking you back to the beginning…
                </p>
              ) : confirm ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onDelete}
                    data-testid="button-confirm-delete"
                    className="focus-ring rounded-full bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground"
                  >
                    Yes, delete everything
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(false)}
                    data-testid="button-cancel-delete"
                    className="focus-ring rounded-full bg-card px-4 py-2.5 text-sm font-bold"
                  >
                    Keep my data
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(true)}
                  data-testid="button-delete-data"
                  className="focus-ring mt-4 rounded-full border border-destructive/40 px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10"
                >
                  Delete my data
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          data-testid="button-settings-done"
          className="focus-ring mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground"
        >
          Back to my journal <ArrowRight size={16} />
        </button>
      </main>
    </div>
  );
}
