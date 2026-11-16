// Mock-up copy of the app's Mannequin: same shapes, two woods, a faint grain.
import { RoundedBox } from '@react-three/drei';
import { createContext, use, useMemo, type ReactNode } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Matrix4 } from 'three';
import type { JointName } from '@app/model/joints.ts';
import type { FencerSetup, Pose } from '@app/model/types.ts';
import { Epee } from '@app/rig/Epee.tsx';
import { solveRig } from '@app/rig/kinematics.ts';
import type { Layout } from '@app/rig/layout.ts';

export interface Wood {
  base: string;
  streak: string;
  joint: string;
}
export const MAPLE: Wood = { base: '#e2bd8c', streak: '#b98a55', joint: '#bd8d5c' };
export const WALNUT: Wood = { base: '#6a4530', streak: '#3d2416', joint: '#4a2f20' };

const cache = new Map<string, CanvasTexture>();
function grain(w: Wood): CanvasTexture {
  const hit = cache.get(w.base);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = w.base;
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 256;
    g.strokeStyle = w.streak;
    g.globalAlpha = 0.05 + rnd() * 0.13;
    g.lineWidth = 0.6 + rnd() * 2.4;
    g.beginPath();
    const wob = rnd() * 5;
    g.moveTo(x, 0);
    g.bezierCurveTo(x + wob, 85, x - wob, 170, x, 256);
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  cache.set(w.base, t);
  return t;
}

const WoodCtx = createContext<{ wood: Wood; opacity: number }>({ wood: MAPLE, opacity: 1 });

function Mat() {
  const { wood, opacity } = use(WoodCtx);
  return <meshStandardMaterial map={grain(wood)} roughness={0.62} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />;
}
function JointMat() {
  const { wood, opacity } = use(WoodCtx);
  return <meshStandardMaterial color={wood.joint} roughness={0.55} transparent={opacity < 1} opacity={opacity} depthWrite={opacity === 1} />;
}

export function Fig({ setup, pose, heading, wood, opacity = 1 }: { setup: FencerSetup; pose: Pose; heading: number; wood: Wood; opacity?: number }) {
  const rig = useMemo(() => solveRig(setup, pose, heading), [setup, pose, heading]);
  const L = rig.layout;
  const H = L.height;
  const b = L.build;
  const weaponSide = setup.handedness === 'right' ? 'r' : 'l';
  const shadow = opacity === 1;
  const part = (joint: JointName, children: ReactNode) => (
    <Part key={joint} ball={(BALLS[joint] ?? 0) * H * (joint.startsWith('wrist') ? 1 : b)} matrix={rig.world[joint]} shadow={shadow}>
      {children}
    </Part>
  );
  const limbs = (['r', 'l'] as const).flatMap((s) => [
    part(`shoulder_${s}`, <Capsule length={L.upperArm} radius={0.03 * H * b} shadow={shadow} />),
    part(`elbow_${s}`, <Capsule length={L.forearm} radius={0.025 * H * b} shadow={shadow} />),
    part(
      `wrist_${s}`,
      s === weaponSide ? (
        <Hand side={s} length={L.fist} width={0.05 * H} thick={0.032 * H} H={H} fist />
      ) : (
        <Hand side={s} length={L.hand} width={0.045 * H} thick={0.022 * H} H={H} />
      ),
    ),
    part(`hip_${s}`, <Capsule length={L.thigh} radius={0.047 * H * b} shadow={shadow} />),
    part(`knee_${s}`, <Capsule length={L.shank} radius={0.034 * H * b} shadow={shadow} />),
    part(`ankle_${s}`, <Foot layout={L} shadow={shadow} />),
  ]);
  return (
    <WoodCtx value={{ wood, opacity }}>
      <group>
        {part('pelvis', <Ellipsoid position={[0, -0.005 * H, 0]} radii={[0.07 * H, 0.055 * H, 0.1 * H * b]} shadow={shadow} />)}
        {part('abdomen', <Ellipsoid position={[0, 0.055 * H, 0]} radii={[0.06 * H, 0.068 * H, 0.085 * H * b]} shadow={shadow} />)}
        {part('chest', <Ellipsoid position={[0, 0.075 * H, 0]} radii={[0.07 * H, 0.085 * H, 0.118 * H * b]} shadow={shadow} />)}
        {part(
          'neck',
          <>
            <mesh position={[0, 0.03 * H, 0]} castShadow={shadow}>
              <cylinderGeometry args={[0.022 * H, 0.025 * H, 0.06 * H, 16]} />
              <JointMat />
            </mesh>
            <Ellipsoid position={[0.008 * H, 0.088 * H, 0]} radii={[0.062 * H, 0.074 * H, 0.052 * H]} shadow={shadow} />
          </>,
        )}
        {limbs}
        {opacity === 1 && (
          <group matrixAutoUpdate={false} matrix={rig.world.grip}>
            <Epee highlight="#767d86" />
          </group>
        )}
      </group>
    </WoodCtx>
  );
}

function Part(props: { matrix: Matrix4; ball: number; children: ReactNode; shadow: boolean }) {
  return (
    <group matrixAutoUpdate={false} matrix={props.matrix}>
      {props.ball > 0 && (
        <mesh castShadow={props.shadow}>
          <sphereGeometry args={[props.ball, 24, 18]} />
          <JointMat />
        </mesh>
      )}
      {props.children}
    </group>
  );
}

function Hand(props: { side: 'r' | 'l'; length: number; width: number; thick: number; H: number; fist?: boolean }) {
  const { length, width, thick, H } = props;
  const back = props.side === 'r' ? 1 : -1;
  const r = 0.0085 * H;
  return (
    <>
      <RoundedBox args={[width, length, thick]} radius={Math.min(thick, width) / 3} position={[0, -length / 2, 0]} castShadow>
        <Mat />
      </RoundedBox>
      <RoundedBox args={[width * 0.78, length * 0.7, thick * 0.3]} radius={thick * 0.12} position={[0, -length * 0.48, back * thick * 0.42]}>
        <JointMat />
      </RoundedBox>
      <mesh position={[width / 2 + r * 0.4, -length * (props.fist ? 0.55 : 0.4), -back * thick * 0.1]} rotation={[0, 0, props.fist ? 0.15 : 0.35]} castShadow>
        <capsuleGeometry args={[r, length * (props.fist ? 0.45 : 0.32), 6, 12]} />
        <Mat />
      </mesh>
    </>
  );
}

function Capsule({ length, radius, shadow }: { length: number; radius: number; shadow: boolean }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow={shadow}>
      <capsuleGeometry args={[radius, Math.max(length - 2 * radius, 0.001), 10, 28]} />
      <Mat />
    </mesh>
  );
}

function Ellipsoid({ position, radii, shadow }: { position: [number, number, number]; radii: [number, number, number]; shadow: boolean }) {
  return (
    <mesh position={position} scale={radii} castShadow={shadow}>
      <sphereGeometry args={[1, 40, 28]} />
      <Mat />
    </mesh>
  );
}

function Foot({ layout, shadow }: { layout: Layout; shadow: boolean }) {
  const height = 0.042 * layout.height;
  const length = layout.heel + layout.toe;
  return (
    <RoundedBox args={[length, height, layout.footWidth]} radius={height / 2.2} position={[(layout.toe - layout.heel) / 2, -layout.ankleHeight + height / 2, 0]} castShadow={shadow}>
      <Mat />
    </RoundedBox>
  );
}

const BALLS: Partial<Record<JointName, number>> = {
  abdomen: 0.045,
  chest: 0.05,
  shoulder_r: 0.036,
  shoulder_l: 0.036,
  elbow_r: 0.029,
  elbow_l: 0.029,
  wrist_r: 0.022,
  wrist_l: 0.022,
  hip_r: 0.05,
  hip_l: 0.05,
  knee_r: 0.04,
  knee_l: 0.04,
  ankle_r: 0.03,
  ankle_l: 0.03,
};
