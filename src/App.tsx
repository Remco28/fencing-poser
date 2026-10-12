import { useEffect, useState } from 'react';
import { useKeyboardPosing } from './editor/keyboard.ts';
import { LibraryDialog } from './editor/LibraryDialog.tsx';
import { Panel } from './editor/Panel.tsx';
import { Stage } from './editor/Stage.tsx';
import { StepBar } from './editor/StepBar.tsx';
import { useEditor } from './editor/store.ts';

export function App() {
  const [library, setLibrary] = useState(false);
  useKeyboardPosing();
  useEffect(() => {
    void useEditor.getState().start();
  }, []);

  return (
    <div className="app">
      <main className="stage">
        <Stage />
        <StepBar />
      </main>
      <Panel onOpenLibrary={() => setLibrary(true)} />
      <LibraryDialog open={library} onClose={() => setLibrary(false)} />
    </div>
  );
}
