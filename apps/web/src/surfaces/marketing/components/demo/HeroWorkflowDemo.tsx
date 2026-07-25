import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Progress, cn } from '@siapp/ui';

import { useReducedMotion } from '../../hooks/useReducedMotion.ts';
import { track } from '../../lib/track.ts';
import { CheckIcon } from '../icons.tsx';
import { DesktopWindow, PhoneFrame } from './DeviceFrames.tsx';
import { WhatsappBubble } from './WhatsappBubble.tsx';
import { CONSTRUCTION_DEMO, HERO_COMPLETED } from './demoContent.ts';

/**
 * Demo progression:
 *   0 idle — roof installation still in progress
 *   1 task ticked done in the firm view
 *   2 WhatsApp bubble arrives on the client phone
 *   3 portal progress advances 64% → 68% with a new update row
 * Step 3 is the completed state.
 */
type TDemoStep = 0 | 1 | 2 | 3;

const STEP_DELAYS_MS: Record<Exclude<TDemoStep, 0>, number> = { 1: 300, 2: 900, 3: 1800 };

const ANNOUNCEMENT =
  'Task marked done. WhatsApp update sent. Portal progress now 68 percent.';

const demo = CONSTRUCTION_DEMO;

/**
 * Hero product demonstration (impl-28 §3.1): one task completion flows from
 * the firm's board to the client's WhatsApp and portal. Autoplays once when
 * scrolled into view; users who prefer reduced motion get an instant
 * before/after toggle instead of the timed sequence.
 */
export function HeroWorkflowDemo() {
  const [step, setStep] = useState<TDemoStep>(0);
  const [hasPlayed, setHasPlayed] = useState(false);
  const reducedMotion = useReducedMotion();
  const timersRef = useRef<number[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const play = useCallback(() => {
    clearTimers();
    setHasPlayed(true);
    track('product_demo_started', { location: 'hero' });
    if (reducedMotion) {
      setStep(3);
      track('product_demo_completed', { location: 'hero' });
      return;
    }
    setStep(0);
    for (const [stepKey, delay] of Object.entries(STEP_DELAYS_MS)) {
      const next = Number(stepKey) as TDemoStep;
      timersRef.current.push(
        window.setTimeout(() => {
          setStep(next);
          if (next === 3) {
            track('product_demo_completed', { location: 'hero' });
          }
        }, delay),
      );
    }
  }, [clearTimers, reducedMotion]);

  // Autoplay once when at least half the demo is visible (skipped for
  // reduced motion — those users start it themselves).
  useEffect(() => {
    const el = rootRef.current;
    if (el === null || hasPlayed || reducedMotion) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          play();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [hasPlayed, reducedMotion, play]);

  useEffect(() => clearTimers, [clearTimers]);

  const taskDone = step >= 1;
  const bubbleVisible = step >= 2;
  const portalUpdated = step >= 3;
  const progressPct = portalUpdated ? HERO_COMPLETED.progressPct : demo.progressPct;

  return (
    <div ref={rootRef}>
      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Firm view */}
        <DesktopWindow title={`${demo.firmName} — ${demo.projectName}`}>
          <div className="p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Tasks — {demo.currentPhase}
            </p>
            <ul className="mt-3 space-y-2">
              {demo.tasks.map((task) => {
                const isDone =
                  task.status === 'done' || (task.id === 'c2' && taskDone);
                return (
                  <li
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 motion-reduce:transition-none',
                        isDone
                          ? 'border-success bg-success text-white'
                          : 'border-border bg-card',
                      )}
                      aria-hidden="true"
                    >
                      {isDone && <CheckIcon className="size-3" />}
                    </span>
                    <span
                      className={cn(
                        'flex-1 text-sm',
                        isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                      )}
                    >
                      {task.title}
                    </span>
                    {task.due !== undefined && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {task.due}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground" aria-hidden="true">
                {taskDone
                  ? 'Client notified automatically'
                  : 'Completing a task updates the client'}
              </p>
              <Button
                size="sm"
                variant={hasPlayed && portalUpdated ? 'outline' : 'primary'}
                onClick={play}
              >
                {hasPlayed && portalUpdated ? 'Replay demo' : 'Mark task complete'}
              </Button>
            </div>
          </div>
        </DesktopWindow>

        {/* Client view */}
        <PhoneFrame label={`Client phone preview for ${demo.clientName}`} className="mx-auto w-full max-w-[17rem]">
          <div className="flex min-h-[21rem] flex-col bg-background" data-surface="portal">
            <div className="border-b border-border bg-card px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{demo.firmName}</p>
              <p className="text-[0.625rem] text-muted-foreground">WhatsApp</p>
            </div>
            <div className="flex-1 space-y-3 p-3">
              <WhatsappBubble message={demo.whatsappMessage} visible={bubbleVisible} />
              <div
                className={cn(
                  'rounded-lg border border-border bg-card p-3 shadow-card transition-opacity duration-300 motion-reduce:transition-none',
                  bubbleVisible ? 'opacity-100' : 'opacity-60',
                )}
              >
                <p className="text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {demo.projectName}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Progress
                    value={progressPct}
                    label="Project progress"
                    className="h-1.5 flex-1"
                    indicatorClassName="bg-accent"
                  />
                  <span className="font-display text-sm font-semibold text-foreground tabular-nums">
                    {progressPct}%
                  </span>
                </div>
                {portalUpdated && (
                  <p className="mt-2 text-[0.6875rem] text-foreground">
                    <span className="font-medium text-success">Just now:</span>{' '}
                    {HERO_COMPLETED.portalUpdate}
                  </p>
                )}
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  Next: {demo.nextMilestone} — {demo.nextMilestoneDate}
                </p>
              </div>
            </div>
          </div>
        </PhoneFrame>
      </div>
      <p aria-live="polite" className="sr-only">
        {portalUpdated ? ANNOUNCEMENT : ''}
      </p>
    </div>
  );
}
