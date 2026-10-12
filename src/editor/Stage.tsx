import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { FENCERS, HEADING } from '../model/combination.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { Piste } from '../scene/Piste.tsx';
import { currentStep, useEditor } from './store.ts';

// Dev aid until camera presets land: ?view=top|front|back|side picks the start view.
const VIEWS: Record<string, [number, number, number]> = {
  side: [0, 1.3, 8],
  top: [0, 9, 0.01],
  front: [7, 1.6, 0.6],
  back: [-7, 1.6, 0.6],
};
const START = VIEWS[new URLSearchParams(location.search).get('view') ?? ''] ?? [0.6, 2.8, 8.4];

export function Stage() {
  const s = useEditor();
  const step = currentStep(s);
  return (
    <Canvas
      shadows
      camera={{ position: START, fov: 40 }}
      onPointerMissed={() => s.select(null)}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#eef0f2']} />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 1.2]} />
      <directionalLight
        position={[2, 6, 4]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#dfe2e5" roughness={1} />
      </mesh>
      <Piste />
      {FENCERS.map((f) => (
        <Mannequin
          key={f}
          label={f}
          active={s.active === f}
          setup={s.combination.fencers[f]}
          pose={step.poses[f]}
          heading={HEADING[f]}
          selected={s.active === f ? s.selected : null}
          onSelect={(joint) => s.select(joint, f)}
          onActivate={() => s.setActive(f)}
        />
      ))}
      <OrbitControls target={[0, 0.9, 0]} makeDefault maxPolarAngle={Math.PI * 0.495} />
    </Canvas>
  );
}
