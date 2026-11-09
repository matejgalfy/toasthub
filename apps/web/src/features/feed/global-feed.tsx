import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowDown } from 'lucide-react';
import { type RefObject, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { globalFeedQueryOptions } from './feed-api';
import { FeedList } from './feed-list';

/**
 * Every user's toast sessions on home, under the Toast of the week (SPEC §4.14, §9 `/home`). While the
 * feed is below the screen, an arrow in the bottom right corner scrolls to it.
 */
export function GlobalFeed() {
  const { t } = useTranslation();
  const id = useId();
  const feed = useInfiniteQuery(globalFeedQueryOptions);
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const below = useIsBelowScreen(section);

  const jump = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    section.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    // The arrow disappears once the feed is in view, so keyboard focus moves on to the feed's title.
    heading.current?.focus({ preventScroll: true });
  };

  return (
    <>
      {/* scroll-mt clears the sticky header. */}
      <section ref={section} aria-labelledby={id} className="flex scroll-mt-20 flex-col gap-3">
        <h2 id={id} ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {t('feed.title')}
        </h2>
        <FeedList feed={feed} empty={t('feed.empty')} />
      </section>
      {below && (
        <Button
          size="icon-lg"
          aria-label={t('feed.jump')}
          onClick={jump}
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 rounded-full shadow-lg md:bottom-6"
        >
          <ArrowDown className="size-5" aria-hidden="true" />
        </Button>
      )}
    </>
  );
}

/**
 * Whether the element lies wholly below the visible part of the screen. The bottom 80 px don't count as
 * visible: the tab bar covers them on phones. False until the browser has measured, and without
 * IntersectionObserver.
 */
function useIsBelowScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        setBelow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
      },
      { rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return below;
}
