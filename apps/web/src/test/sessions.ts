import type { Me } from '@toasthub/shared';

import type { Session } from '@/features/auth/session';

export const SESSION_KINDS = ['anonymous', 'new', 'user', 'admin'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const testUser: Me = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'tester@example.com',
  displayName: 'Toast Tester',
  avatarId: 1,
  locale: 'en',
  profileVisibility: 'public',
  role: 'user',
  onboarded: true,
  createdAt: '2026-10-01T08:00:00.000Z',
};

/** A fixed session of each kind, for `<SessionProvider value={…}>`. */
export function testSession(kind: SessionKind): Session {
  switch (kind) {
    case 'anonymous':
      return { status: 'anonymous' };
    case 'new':
      return {
        status: 'authenticated',
        user: { ...testUser, displayName: null, avatarId: null, onboarded: false },
      };
    case 'user':
      return { status: 'authenticated', user: testUser };
    case 'admin':
      return { status: 'authenticated', user: { ...testUser, role: 'admin' } };
  }
}
