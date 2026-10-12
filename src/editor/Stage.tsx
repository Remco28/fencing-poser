import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Mannequin } from '../rig/Mannequin.tsx';
import { useEditor } from './store.ts';

// Dev aid until camera presets land: ?view=top|front|back|side picks the start view.
const VIEWS: Record<string, [number, number, number]> = {
  side: [0.3, 1.1, 3.6],
  top: [0.3, 4.5, 0.01],
  front: [3.6, 1.2, 0],
  back: [-3.2, 1.4, 0.4],
};
const START = VIEWS[new URLSearchParams(location.search).get('view') ?? ''] ?? [1.4, 1.5, 3.2];

export function Stage() {
  const { setup, pose, selected, select } = useEditor();
  return (
    <Canvas
      shadows
      camera={{ position: START, fov: 40 }}
      onPointerMissed={() => select(null)}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={['#eef0f2']} />
      <hemisphereLight args={['#ffffff', '#b9b4aa', 1.2]} />
      <directionalLight
        position={[2.5, 5, 3]}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#dfe2e5" roughness={1} />
      </mesh>
      <gridHelper args={[30, 30, '#c4c9cf', '#d3d7db']} position={[0, 0.001, 0]} />
      <Mannequin setup={setup} pose={pose} selected={selected} onSelect={select} />
      <OrbitControls target={[0.3, 0.9, 0]} makeDefault maxPolarAngle={Math.PI * 0.495} />
    </Canvas>
  );
}
