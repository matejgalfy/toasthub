import { House, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react';

import type { Me } from '@toasthub/shared';

export interface NavItem {
  /** Label key: `nav.<id>`. */
  id: 'home' | 'leaderboards' | 'clan' | 'profile';
  to: string;
  icon: LucideIcon;
}

/** The main sections in tab order: bottom tab bar on mobile, top nav from `md` up (SPEC §9). */
export function navItems(user: Me): NavItem[] {
  return [
    { id: 'home', to: '/home', icon: House },
    { id: 'leaderboards', to: '/leaderboards', icon: Trophy },
    // M13 sends clan members to their own clan instead of the browser.
    { id: 'clan', to: '/clans', icon: Users },
    { id: 'profile', to: `/u/${user.id}`, icon: UserRound },
  ];
}
