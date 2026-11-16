import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/opsz.css';
import './styles.css';

// Dev only: lets a test browser drive the editor (window.__editor.getState()).
if (import.meta.env.DEV) void import('./editor/store.ts').then((m) => Object.assign(window, { __editor: m.useEditor }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
