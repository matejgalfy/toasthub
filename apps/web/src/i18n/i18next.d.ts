import 'i18next';

import type { resources } from './index';

// Typed keys: `t('pages.home.title')` checks against en.json at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}
