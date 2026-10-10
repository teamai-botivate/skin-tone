'use client';

import { Header } from '@/components/common/Header';
import { Intro } from '@/components/common/Intro';
import { FooterActions } from '@/components/common/FooterActions';
import { OptionCard } from '@/features/onboarding/components/OptionCard';
import { feedbackFeelingOptions, feedbackChangeOptions } from '@/features/onboarding/data/options';

export function Feedback({
  feeling,
  setFeeling,
  changeAreas,
  toggleChangeArea,
  request,
  setRequest,
  onBack,
  onDone,
}: {
  feeling: string;
  setFeeling: (v: string) => void;
  changeAreas: string[];
  toggleChangeArea: (v: string) => void;
  request: string;
  setRequest: (v: string) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const notMyStyle = feeling === 'Not my style';

  return (
    <div className="noise min-h-[100dvh]">
      <Header onBack={onBack} onSettings={onBack} />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 sm:py-20">
        <Intro
          eyebrow="A better next edit"
          title="How did this land?"
          body="Your honest reaction helps us keep your taste at the center."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {feedbackFeelingOptions.map((item) => (
              <OptionCard
                key={item.label}
                label={item.label}
                icon={item.icon}
                selected={feeling === item.label}
                onClick={() => setFeeling(feeling === item.label ? '' : item.label)}
              />
            ))}
          </div>
          {notMyStyle && (
            <div className="mt-8 animate-rise" data-testid="panel-what-to-change">
              <p className="mb-3 text-sm font-bold">What should we change?</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {feedbackChangeOptions.map((item) => (
                  <OptionCard
                    key={item.label}
                    label={item.label}
                    icon={item.icon}
                    selected={changeAreas.includes(item.label)}
                    onClick={() => toggleChangeArea(item.label)}
                  />
                ))}
              </div>
            </div>
          )}
          <label className="mt-7 block">
            <span className="mb-2 block text-sm font-bold">
              Anything else? <span className="font-normal text-muted-foreground">optional</span>
            </span>
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              data-testid="textarea-change-request"
              rows={4}
              placeholder="More relaxed, fewer layers, a little brighter…"
              className="focus-ring w-full resize-none rounded-2xl border border-border bg-card p-4 outline-none placeholder:text-muted-foreground/55"
            />
          </label>
          <FooterActions
            onBack={onBack}
            onContinue={onDone}
            disabled={!feeling}
            label={notMyStyle ? '🔄 Create New Looks' : 'Save feedback'}
          />
        </Intro>
      </main>
    </div>
  );
}
