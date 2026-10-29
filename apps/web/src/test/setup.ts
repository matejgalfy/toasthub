import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

import { initI18n } from '@/i18n';

// jsdom has no ResizeObserver; Radix (radio group) measures its items with one.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Tests assert on English text.
await initI18n('en');

afterEach(() => {
  cleanup();
});
