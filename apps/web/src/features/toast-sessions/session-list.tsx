import { EyeOff, Pencil, Sandwich } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { type LocalDate, localDate, type ToastSession } from '@toasthub/shared';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat } from '@/i18n/format';

interface Day {
  date: LocalDate;
  sessions: ToastSession[];
}

/** Sessions arrive newest first, so each day's sessions are next to each other. */
function groupByDay(sessions: ToastSession[]): Day[] {
  const days: Day[] = [];
  for (const session of sessions) {
    const last = days.at(-1);
    if (last?.date === session.localDate) last.sessions.push(session);
    else days.push({ date: session.localDate, sessions: [session] });
  }
  return days;
}

/** The own sessions grouped by day (SPEC §9 `/toasts`); editable ones open `onEdit`. */
export function SessionList({
  sessions,
  onEdit,
}: {
  sessions: ToastSession[];
  onEdit: (session: ToastSession) => void;
}) {
  const today = localDate(new Date());
  return (
    <div className="flex flex-col gap-6">
      {groupByDay(sessions).map((day) => (
        <DaySection key={day.date} day={day} today={today} onEdit={onEdit} />
      ))}
    </div>
  );
}

function DaySection({
  day,
  today,
  onEdit,
}: {
  day: Day;
  today: LocalDate;
  onEdit: (session: ToastSession) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
        {day.date === today ? t('toasts.today') : format.localDate(day.date, { dateStyle: 'full' })}
      </h2>
      <Card className="gap-0 py-1">
        <ul className="divide-y">
          {day.sessions.map((session) => (
            <li key={session.id}>
              <SessionRow session={session} onEdit={onEdit} />
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function SessionRow({
  session,
  onEdit,
}: {
  session: ToastSession;
  onEdit: (session: ToastSession) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const time = format.dateTime(session.loggedAt, { timeStyle: 'short' });
  const content = (
    <>
      <Thumbnail session={session} time={time} />
      <span className="flex grow flex-col">
        <span className="font-medium">{t('toasts.count', { count: session.count })}</span>
        <span className="text-sm text-muted-foreground">{time}</span>
      </span>
    </>
  );
  // Older sessions are read-only (BR-TOAST-7), so they aren't buttons at all.
  if (!session.editable) return <div className="flex items-center gap-3 px-4 py-3">{content}</div>;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={() => {
        onEdit(session);
      }}
    >
      {content}
      <Pencil className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('toasts.editHint')}</span>
    </button>
  );
}

function Thumbnail({ session, time }: { session: ToastSession; time: string }) {
  const { t } = useTranslation();
  const box = 'flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted';
  if (session.photoUrl) {
    return (
      <img
        src={session.photoUrl}
        alt={t('toasts.photoAlt', { time })}
        className="size-14 shrink-0 rounded-lg bg-muted object-cover"
      />
    );
  }
  if (session.photoHidden && session.hasPhoto) {
    return (
      <span className={box}>
        <EyeOff className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t('toasts.photoHidden')}</span>
      </span>
    );
  }
  return (
    <span className={box}>
      <Sandwich className="size-5 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

/** Loads the next page when it scrolls into view; the button does it without scrolling. */
export function LoadMore({ onLoad, loading }: { onLoad: () => void; loading: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoad();
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onLoad]);
  return (
    <div ref={ref} className="flex justify-center">
      <Button variant="outline" disabled={loading} onClick={onLoad}>
        {loading ? t('app.loading') : t('toasts.loadMore')}
      </Button>
    </div>
  );
}
