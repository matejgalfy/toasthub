import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';

import { useUser } from '@/features/auth/session';

import { navItems } from './nav-items';

/** Mobile navigation, fixed to the bottom; hidden from `md` up where the header has the links. */
export function BottomTabBar() {
  const { t } = useTranslation();
  const user = useUser();
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-content grid-cols-4">
        {navItems(user).map(({ id, to, icon: Icon }) => (
          <li key={id}>
            <NavLink
              to={to}
              className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring aria-[current=page]:text-primary"
            >
              <Icon className="size-6" aria-hidden="true" />
              {t(`nav.${id}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
