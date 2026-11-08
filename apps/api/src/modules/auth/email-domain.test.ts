import { describe, expect, it } from 'vitest';

import { isEmailDomainAllowed } from './email-domain';

const allowed = ['gmail.com', 'muni.cz', 'mail.muni.cz'];

describe('isEmailDomainAllowed (BR-AUTH-6)', () => {
  it.each([
    ['ann@gmail.com', true],
    ['Ann@GMAIL.com', true],
    ['ann@muni.cz', true],
    ['ann@mail.muni.cz', true],
    ['ann@fi.muni.cz', false],
    ['ann@gmail.com.evil.example', false],
    ['ann@example.com', false],
    ['"ann@gmail.com"@example.com', false],
  ])('%s → %s', (email, expected) => {
    expect(isEmailDomainAllowed(email, allowed)).toBe(expected);
  });

  it('lets in every domain when the list is empty', () => {
    expect(isEmailDomainAllowed('ann@example.com', [])).toBe(true);
  });
});
