import { useEffect, useState } from 'react';
import type { Combination } from '../model/combination.ts';
import { decodeCombination } from '../share/link.ts';
import { Viewer } from './Viewer.tsx';

/** Opens the combination carried in the link's hash. */
export function SharedView({ hash }: { hash: string }) {
  const [state, setState] = useState<{ combination: Combination | null; loading: boolean }>({ combination: null, loading: true });

  useEffect(() => {
    let live = true;
    void decodeCombination(hash).then((combination) => live && setState({ combination, loading: false }));
    return () => {
      live = false;
    };
  }, [hash]);

  if (state.loading) return <p className="viewer-message">Opening…</p>;
  if (!state.combination) {
    return (
      <p className="viewer-message">
        This link is incomplete or damaged. Ask your coach to send it again, and make sure the whole link was copied.
      </p>
    );
  }
  return <Viewer combination={state.combination} />;
}
