import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/index.css';
import { App } from './app';
import { initI18n } from './i18n';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

await initI18n();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
