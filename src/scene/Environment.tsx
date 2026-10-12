import { Piste } from './Piste.tsx';

/** Light, floor and piste: everything in the scene that is not a fencer. */
export function Environment() {
  return (
    <>
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
    </>
  );
}
