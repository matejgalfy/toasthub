import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';

import { useUser } from '@/features/auth/session';
import { cn } from '@/lib/utils';

import { LanguageSwitch } from './language-switch';
import { navItems } from './nav-items';

interface AppHeaderProps {
  /** Show the section links (from `md` up; mobile uses the bottom tab bar). Needs a signed-in user. */
  showNav?: boolean;
  wide?: boolean;
}

export function AppHeader({ showNav = false, wide = false }: AppHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
      <div
        className={cn(
          'mx-auto flex h-14 items-center gap-4 px-4',
          wide ? 'max-w-wide' : 'max-w-content',
        )}
      >
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span aria-hidden="true">🍞</span>
          {t('app.name')}
        </Link>
        {showNav && <TopNav />}
        <LanguageSwitch className="ml-auto" />
        {showNav && <SettingsLink />}
      </div>
    </header>
  );
}

function SettingsLink() {
  const { t } = useTranslation();
  return (
    <NavLink
      to="/settings"
      aria-label={t('pages.settings.title')}
      className="-mr-2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:text-primary"
    >
      <Settings className="size-5" aria-hidden="true" />
    </NavLink>
  );
}

function TopNav() {
  const { t } = useTranslation();
  const user = useUser();
  return (
    <nav aria-label={t('nav.label')} className="hidden md:block">
      <ul className="flex gap-1">
        {navItems(user).map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground"
            >
              {t(`nav.${item.id}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
