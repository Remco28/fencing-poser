import { Panel } from './editor/Panel.tsx';
import { Stage } from './editor/Stage.tsx';

export function App() {
  return (
    <div className="app">
      <main className="stage">
        <Stage />
      </main>
      <Panel />
    </div>
  );
}
