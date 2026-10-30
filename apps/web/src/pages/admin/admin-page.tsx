import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

const SECTIONS = ['flags', 'users', 'clans', 'settings', 'metrics', 'totw'] as const;

/**
 * `/admin` (SPEC §4.13): the section links, a row on phones and a side column on wide screens, and the
 * open section beside them.
 */
export function AdminPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
      <nav
        aria-label={t('admin.nav.label')}
        className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0"
      >
        <ul className="flex gap-1 lg:flex-col">
          {SECTIONS.map((section) => (
            <li key={section}>
              <NavLink
                to={`/admin/${section}`}
                className="block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-secondary aria-[current=page]:text-secondary-foreground"
              >
                {t(`admin.nav.${section}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
