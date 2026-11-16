// The desk: a pale surface in daylight, a felt-topped board for the piste.
import { RoundedBox } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type PerspectiveCamera } from 'three';
import { BUILT_IN_PRESETS } from '@app/presets/builtin.ts';
import { DEFAULT_SETUP, type Pose } from '@app/model/types.ts';
import { Fig, MAPLE, WALNUT } from './Fig.tsx';

export const AIR = '#efe7d9';
const DESK = '#f0e6d4';
const FELT = '#5d7686';
const FELT_WARN = '#7b93a1';
const FELT_OFF = '#4d6473';
const LINE = '#f6efe0';
const BIRCH = '#d9c29c';
export const INK_BLUE = '#2748c9';

function noise(base: string, speck: string, n: number, alpha: number, size = 128, streaks = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = speck;
  g.strokeStyle = speck;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = rnd() * alpha;
    if (streaks) {
      const y = rnd() * size;
      g.lineWidth = 0.5 + rnd() * 2;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(size / 3, y + rnd() * 4 - 2, (2 * size) / 3, y + rnd() * 4 - 2, size, y);
      g.stroke();
    } else {
      g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function preset(id: string, x: number, upper?: string): Pose {
  const p = BUILT_IN_PRESETS.find((q) => q.id === id)!.pose;
  let joints = p.joints;
  if (upper) {
    const u = BUILT_IN_PRESETS.find((q) => q.id === upper)!.pose.joints;
    const UP = ['abdomen', 'chest', 'neck', 'shoulder_r', 'elbow_r', 'wrist_r', 'shoulder_l', 'elbow_l', 'wrist_l', 'grip'];
    joints = { ...joints };
    for (const k of UP) {
      if ((u as Record<string, unknown>)[k]) (joints as Record<string, unknown>)[k] = (u as Record<string, unknown>)[k];
      else delete (joints as Record<string, unknown>)[k];
    }
  }
  return { joints, root: { x, z: 0, lift: p.root.lift } };
}

export interface StepPoses {
  label: string;
  A: Pose;
  B: Pose;
}

function Strip({ from, to, tex, color }: { from: number; to: number; tex: CanvasTexture; color: string }) {
  const t = useMemo(() => {
    const c = tex.clone();
    c.repeat.set(Math.abs(to - from) * 2.2, 1.8 * 2.2);
    c.needsUpdate = true;
    return c;
  }, [tex, from, to]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(from + to) / 2, 0.001, 0]} receiveShadow>
      <planeGeometry args={[Math.abs(to - from), 1.8]} />
      <meshStandardMaterial map={t} color={color} roughness={1} />
    </mesh>
  );
}

export function Desk({ props: showProps = false }: { props?: boolean }) {
  const felt = useMemo(() => noise('#ffffff', '#000000', 2600, 0.16), []);
  const desk = useMemo(() => {
    const t = noise(DESK, '#c4ab85', 90, 0.07, 512, true);
    t.repeat.set(5, 9);
    return t;
  }, []);
  return (
    <>
      <color attach="background" args={[AIR]} />
      <fog attach="fog" args={[AIR, 9, 34]} />
      <hemisphereLight args={['#fff8ec', '#d8c6a8', 1.15]} />
      <directionalLight
        position={[-4, 8, 6]}
        intensity={2.3}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-radius={7}
        shadow-bias={-0.0003}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {/* the desk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial map={desk} roughness={0.9} />
      </mesh>
      {/* the board under the felt */}
      <mesh position={[0, -0.03, 0]} receiveShadow castShadow>
        <boxGeometry args={[17.9, 0.06, 2.02]} />
        <meshStandardMaterial color={BIRCH} roughness={0.7} />
      </mesh>
      <Strip from={-8.75} to={-7} tex={felt} color={FELT_OFF} />
      <Strip from={-7} to={-5} tex={felt} color={FELT_WARN} />
      <Strip from={-5} to={5} tex={felt} color={FELT} />
      <Strip from={5} to={7} tex={felt} color={FELT_WARN} />
      <Strip from={7} to={8.75} tex={felt} color={FELT_OFF} />
      {[-7, -5, -2, 0, 2, 5, 7].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]} receiveShadow>
          <planeGeometry args={[x === 0 ? 0.05 : 0.04, 1.8]} />
          <meshStandardMaterial color={LINE} roughness={0.9} />
        </mesh>
      ))}
      {showProps && <DeskProps />}
    </>
  );
}

/** Things lying about, at toy scale: the figures are about 30 cm tall. */
function DeskProps() {
  return (
    <>
      {/* a pencil in front of the board */}
      <group position={[-0.6, 0.0, 2.35]} rotation={[0, 0.16, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 1.0, 6]} />
          <meshStandardMaterial color={INK_BLUE} roughness={0.45} />
        </mesh>
        <mesh position={[0.6, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <coneGeometry args={[0.045, 0.2, 6]} />
          <meshStandardMaterial color="#e3c69a" roughness={0.7} />
        </mesh>
        <mesh position={[0.685, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.012, 0.05, 6]} />
          <meshStandardMaterial color="#3a3835" roughness={0.5} />
        </mesh>
        <mesh position={[-0.53, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.047, 0.047, 0.07, 16]} />
          <meshStandardMaterial color="#c9ccd1" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[-0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.044, 0.044, 0.08, 16]} />
          <meshStandardMaterial color="#d98c7c" roughness={0.9} />
        </mesh>
      </group>
      {/* a notebook behind it */}
      <group position={[4.6, -0.02, -3.1]} rotation={[0, -0.22, 0]}>
        <RoundedBox args={[1.5, 0.09, 2.0]} radius={0.03} castShadow receiveShadow>
          <meshStandardMaterial color="#2c3f52" roughness={0.75} />
        </RoundedBox>
        <mesh position={[0.02, 0, 0.0]}>
          <boxGeometry args={[1.47, 0.07, 1.96]} />
          <meshStandardMaterial color="#f4eee2" roughness={0.9} />
        </mesh>
        <mesh position={[0.45, 0.047, 0]}>
          <boxGeometry args={[0.05, 0.004, 2.0]} />
          <meshStandardMaterial color="#1c2a38" roughness={0.6} />
        </mesh>
      </group>
    </>
  );
}

export function Fencers({ step, ghost }: { step: StepPoses; ghost?: StepPoses }) {
  return (
    <>
      <Fig setup={DEFAULT_SETUP} pose={step.A} heading={0} wood={MAPLE} />
      <Fig setup={DEFAULT_SETUP} pose={step.B} heading={180} wood={WALNUT} />
      {ghost && <Fig setup={DEFAULT_SETUP} pose={ghost.A} heading={0} wood={MAPLE} opacity={0.2} />}
    </>
  );
}

export function Cam({ pos, look, fov, shiftX = 0, shiftY = 0 }: { pos: [number, number, number]; look: [number, number, number]; fov: number; shiftX?: number; shiftY?: number }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const c = camera as PerspectiveCamera;
    c.position.set(...pos);
    c.fov = fov;
    c.lookAt(...look);
    // Slide the picture sideways without changing perspective (to clear a panel).
    if (shiftX || shiftY) c.setViewOffset(size.width, size.height, -shiftX, shiftY, size.width, size.height);
    else c.clearViewOffset();
    c.updateProjectionMatrix();
  }, [camera, size, pos[0], pos[1], pos[2], look[0], look[1], look[2], fov, shiftX, shiftY]);
  return null;
}
