import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithApp } from '@/test/render';
import { testSession } from '@/test/sessions';

import { MagicLinkForm } from './magic-link-form';

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MagicLinkForm', () => {
  it('says so when the email domain is not allowed (BR-AUTH-6)', async () => {
    const user = userEvent.setup();
    stubFetch(403, { error: { code: 'FORBIDDEN', message: 'Email address not allowed' } });
    renderWithApp(<MagicLinkForm submitLabel="Send login link" />, {
      session: testSession('anonymous'),
    });

    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: 'Send login link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email address not allowed, try a different one.',
    );
  });
});
