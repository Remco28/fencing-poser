import { useEffect } from 'react';
import { useKeyboardPosing } from './editor/keyboard.ts';
import { Panel } from './editor/Panel.tsx';
import { Stage } from './editor/Stage.tsx';
import { useEditor } from './editor/store.ts';

export function App() {
  useKeyboardPosing();
  useEffect(() => {
    void useEditor.getState().loadSavedPresets();
  }, []);

  return (
    <div className="app">
      <main className="stage">
        <Stage />
      </main>
      <Panel />
    </div>
  );
}
