import { useEffect, useState } from 'react';
import { useKeyboardPosing } from './keyboard.ts';
import { LibraryDialog } from './LibraryDialog.tsx';
import { Panel } from './Panel.tsx';
import { ShareDialog } from './ShareDialog.tsx';
import { Stage } from './Stage.tsx';
import { StepBar } from './StepBar.tsx';
import { useEditor } from './store.ts';
import { hasToured, Tour } from './Tour.tsx';

export function Editor() {
  const [dialog, setDialog] = useState<'library' | 'share' | null>(null);
  const [touring, setTouring] = useState(() => !hasToured());
  const panning = useEditor((s) => s.panning);
  useKeyboardPosing();
  useEffect(() => {
    void useEditor.getState().start();
  }, []);

  return (
    <div className="app">
      <main className={`stage${panning ? ' panning' : ''}`}>
        <Stage />
        <StepBar />
        {touring && <Tour onClose={() => setTouring(false)} />}
      </main>
      <Panel onOpenLibrary={() => setDialog('library')} onShare={() => setDialog('share')} onTour={() => setTouring(true)} />
      <LibraryDialog open={dialog === 'library'} onClose={() => setDialog(null)} />
      <ShareDialog open={dialog === 'share'} onClose={() => setDialog(null)} />
    </div>
  );
}
