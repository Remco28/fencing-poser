import { useFrame, useThree } from '@react-three/fiber';
import { Fog } from 'three';
import { SCENE } from '../design.ts';
import { DeskThings } from './DeskThings.tsx';
import { BOARD_THICKNESS, Piste } from './Piste.tsx';
import { deskTop } from './textures.ts';

/**
 * Light, desk and piste: everything in the scene that is not a fencer. The
 * figures stand on a felt-topped board on a pale desk in daylight; the desk
 * fades into the air, so there is no horizon to distract. `things` adds the
 * few objects lying about on the desk, for the opening view only, around
 * that place along the piste (where the fencers are).
 */
export function Environment({ things }: { things?: number }) {
  return (
    <>
      <color attach="background" args={[SCENE.air]} />
      <fog attach="fog" args={[SCENE.air, 9, 34]} />
      <Haze />
      <hemisphereLight args={[SCENE.skyLight, SCENE.groundLight, 1.15]} />
      <directionalLight
        position={[-4, 8, 6]}
        intensity={2.3}
        color={SCENE.sun}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={7}
        shadow-bias={-0.0003}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -BOARD_THICKNESS, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial map={deskTop(SCENE.desk, SCENE.deskGrain)} roughness={0.9} />
      </mesh>
      <Piste />
      {things !== undefined && <DeskThings around={things} />}
    </>
  );
}

/**
 * The desk fades into the air a little beyond the piste, however far away the
 * camera is, so the fencers are never hazy and there is never a hard horizon.
 */
function Haze() {
  const scene = useThree((s) => s.scene);
  useFrame(({ camera }) => {
    if (!(scene.fog instanceof Fog)) return;
    // How far the camera is from the piste's centre line.
    const away = Math.hypot(camera.position.y, camera.position.z);
    scene.fog.near = away + 2;
    scene.fog.far = away + 27;
  });
  return null;
}
