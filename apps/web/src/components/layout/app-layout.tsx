import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';

import { cn } from '@/lib/utils';

import { AppHeader } from './app-header';
import { BottomTabBar } from './bottom-tab-bar';

/** Signed-in pages: header, section navigation, centred content (`wide` for admin). */
export function AppLayout({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader showNav wide={wide} />
      <main
        id="main"
        tabIndex={-1}
        // Bottom padding keeps the last content clear of the mobile tab bar.
        className={cn(
          'mx-auto w-full flex-1 px-4 pt-6 pb-28 outline-none md:pb-10',
          wide ? 'max-w-wide' : 'max-w-content',
        )}
      >
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}

/** Pages without section navigation: landing, login, onboarding, errors. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}

function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
    >
      {t('app.skipToContent')}
    </a>
  );
}
