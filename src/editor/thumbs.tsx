import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PerspectiveCamera } from 'three';
import { WOOD_OF } from '../design.ts';
import { FENCERS, HEADING, type FencerId } from '../model/combination.ts';
import { JOINT_NAMES } from '../model/joints.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { jointPosition, solveRig } from '../rig/kinematics.ts';
import { Mannequin } from '../rig/Mannequin.tsx';
import { Environment } from '../scene/Environment.tsx';

// Small pictures of a step, for the storyboard and the list of combinations.
// One hidden canvas paints them one at a time, from the side, framed on the
// two fencers; each picture is kept, so a step is painted once per pose.

type Fencers = Record<FencerId, FencerSetup>;
type Poses = Record<FencerId, Pose>;

/** Twice the size a picture is shown at, for sharp screens. */
const SIZE = { width: 320, height: 172 };
const FOV = 20;
const KEEP = 300;

interface Job {
  fencers: Fencers;
  poses: Poses;
  done: (url: string) => void;
}

const made = new Map<string, string>();
const making = new Map<string, Promise<string>>();
const queue: Job[] = [];
let wake: (() => void) | null = null;
let mounted = false;

function keyOf(fencers: Fencers, poses: Poses): string {
  return JSON.stringify([fencers, poses]);
}

function mount() {
  if (mounted) return;
  mounted = true;
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-${SIZE.width + 100}px;top:0;width:${SIZE.width}px;height:${SIZE.height}px;pointer-events:none;`;
  host.setAttribute('aria-hidden', 'true');
  document.body.append(host);
  createRoot(host).render(
    <Canvas shadows dpr={1} frameloop="demand" gl={{ preserveDrawingBuffer: true }} camera={{ fov: FOV }} style={SIZE}>
      <Painter />
    </Canvas>,
  );
}

function Painter() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const [job, setJob] = useState<Job | null>(null);
  // Set at once, not on the next render: two pictures asked for in the same moment must not both start.
  const busy = useRef(false);
  const frames = useRef(0);
  const next = () => {
    const job = queue.shift() ?? null;
    busy.current = !!job;
    setJob(job);
  };

  useEffect(() => {
    wake = () => {
      if (!busy.current) next();
    };
    wake();
    return () => {
      wake = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!job) return;
    frames.current = 0;
    // Frame both fencers from the side, whatever the distance between them.
    let min = Infinity;
    let max = -Infinity;
    for (const f of FENCERS) {
      const rig = solveRig(job.fencers[f], job.poses[f], HEADING[f]);
      for (const p of [...JOINT_NAMES.map((j) => jointPosition(rig, j)), rig.tip]) {
        min = Math.min(min, p.x);
        max = Math.max(max, p.x);
      }
    }
    const tan = Math.tan((FOV * Math.PI) / 360);
    const half = (max - min) / 2 + 0.3;
    const distance = Math.max(half / (tan * (SIZE.width / SIZE.height)), 1.15 / tan);
    const mid = (min + max) / 2;
    camera.position.set(mid, 1.0, distance);
    camera.lookAt(mid, 0.88, 0);
    camera.updateMatrixWorld();
    invalidate();
  }, [job, camera, invalidate]);

  useFrame(() => {
    if (!job) return;
    // A few frames to settle (shadows, textures) before the picture is taken.
    if (++frames.current < 3) return invalidate();
    job.done(gl.domElement.toDataURL('image/jpeg', 0.86));
    next();
  });

  return (
    <>
      <Environment />
      {job && FENCERS.map((f) => <Mannequin key={f} setup={job.fencers[f]} pose={job.poses[f]} heading={HEADING[f]} wood={WOOD_OF[f]} />)}
    </>
  );
}

/** A picture of the two fencers in these poses, as a data URL. */
export function thumbnail(fencers: Fencers, poses: Poses): Promise<string> {
  const key = keyOf(fencers, poses);
  const have = made.get(key);
  if (have) return Promise.resolve(have);
  let promise = making.get(key);
  if (!promise) {
    promise = new Promise<string>((done) => queue.push({ fencers, poses, done })).then((url) => {
      making.delete(key);
      made.set(key, url);
      // Forget the oldest pictures once there are many.
      for (const old of made.keys()) {
        if (made.size <= KEEP) break;
        made.delete(old);
      }
      return url;
    });
    making.set(key, promise);
    mount();
    wake?.();
  }
  return promise;
}

/**
 * The picture for these poses, or the last one made while a new one is on its
 * way. While a pose is being dragged it changes every frame, so a new picture
 * is only asked for once it has been still for a moment.
 */
export function useThumbnail(fencers: Fencers | null, poses: Poses | null): string | null {
  const key = useMemo(() => (fencers && poses ? keyOf(fencers, poses) : ''), [fencers, poses]);
  const [url, setUrl] = useState<string | null>(() => made.get(key) ?? null);
  useEffect(() => {
    if (!fencers || !poses) return;
    const have = made.get(key);
    if (have) return setUrl(have);
    let live = true;
    const timer = setTimeout(() => void thumbnail(fencers, poses).then((u) => live && setUrl(u)), 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The key stands for the fencers and poses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
