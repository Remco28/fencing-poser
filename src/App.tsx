import { lazy, Suspense, useEffect, useState } from 'react';
import { isShareHash } from './share/link.ts';

// A link carrying a combination opens the student viewer; anything else is
// the coach's editor. Each loads only its own code.
const Editor = lazy(() => import('./editor/Editor.tsx').then((m) => ({ default: m.Editor })));
const SharedView = lazy(() => import('./viewer/SharedView.tsx').then((m) => ({ default: m.SharedView })));

export function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return <Suspense fallback={null}>{isShareHash(hash) ? <SharedView hash={hash} /> : <Editor />}</Suspense>;
}
