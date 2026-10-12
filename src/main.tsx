import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { useEditor } from './editor/store.ts';
import './styles.css';

// Dev only: lets a test browser drive the editor (window.__editor.getState()).
if (import.meta.env.DEV) Object.assign(window, { __editor: useEditor });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
