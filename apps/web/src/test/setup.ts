import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { initI18n } from '@/i18n';

// Tests assert on English text.
await initI18n('en');

afterEach(() => {
  cleanup();
});
