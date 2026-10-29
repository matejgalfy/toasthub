import { createContext, use, useState, type ReactNode } from 'react';

import type { Me } from '@toasthub/shared';

import { SessionProvider, type Session } from './session';

// Stand-in until M5 wires the session to GET /me: a fake user so the placeholder pages can be
// browsed. Switch who you are on /dev/ui. M5 deletes this file.

export const PREVIEW_KINDS = ['anonymous', 'new', 'user', 'admin'] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

const STORAGE_KEY = 'toasthub.previewSession';

const previewUser: Me = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'preview@example.com',
  displayName: 'Toast Tester',
  avatarId: 1,
  locale: 'en',
  profileVisibility: 'public',
  role: 'user',
  onboarded: true,
  createdAt: '2026-10-01T08:00:00.000Z',
};

export function previewSession(kind: PreviewKind): Session {
  switch (kind) {
    case 'anonymous':
      return { status: 'anonymous' };
    case 'new':
      return {
        status: 'authenticated',
        user: { ...previewUser, displayName: null, avatarId: null, onboarded: false },
      };
    case 'user':
      return { status: 'authenticated', user: previewUser };
    case 'admin':
      return { status: 'authenticated', user: { ...previewUser, role: 'admin' } };
  }
}

function readKind(): PreviewKind {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return PREVIEW_KINDS.find((kind) => kind === stored) ?? 'user';
  } catch {
    return 'user';
  }
}

const PreviewControlContext = createContext<{
  kind: PreviewKind;
  setKind: (kind: PreviewKind) => void;
} | null>(null);

export function PreviewSessionProvider({ children }: { children: ReactNode }) {
  const [kind, setKindState] = useState(readKind);
  const setKind = (next: PreviewKind) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not stored; the choice lasts until reload.
    }
    setKindState(next);
  };
  return (
    <PreviewControlContext value={{ kind, setKind }}>
      <SessionProvider value={previewSession(kind)}>{children}</SessionProvider>
    </PreviewControlContext>
  );
}

export function usePreviewControl() {
  const control = use(PreviewControlContext);
  if (!control) throw new Error('usePreviewControl must be used inside <PreviewSessionProvider>');
  return control;
}
