import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, CatmullRomCurve3, Plane, SRGBColorSpace, TubeGeometry, Vector3 } from 'three';
import { useEditor } from '../editor/store.ts';
import { FENCERS, type Combination, type FencerId, type Pin } from '../model/combination.ts';
import { frameAt, pinsOf } from '../viewer/player.ts';
import { MAX_PINS, pathPoint, pinFor } from './path.ts';

let dragCount = 0;

const SAMPLES = 40;
/** Grabbing the path this close (in time through the movement) to a pin moves that pin. */
const NEAR = 0.12;
/** Pins stay this far from the two steps, which never move. */
const EDGE = 0.08;

/** A white disc with a red ring and a small grip mark: clearly not the red épée point handle. */
function useRingTexture() {
  const texture = useMemo(() => {
    const size = 96;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = '#d0263a';
    g.stroke();
    g.fillStyle = '#d0263a';
    for (const dx of [-14, 0, 14]) {
      g.beginPath();
      g.arc(size / 2 + dx, size / 2, 5, 0, Math.PI * 2);
      g.fill();
    }
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * Shaping the movement into step `to`: grab a point's red path anywhere and
 * pull it. Where you grab becomes a pin (a ring), up to three per point;
 * grabbing near a ring moves that ring, and double-clicking a ring removes it.
 * With no pins yet, a ring halfway shows where to start. The poses at either
 * end stay as they are.
 */
export function PathHandles({ c, to }: { c: Combination; to: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const drag = useRef<{ f: FencerId; plane: Plane; id: number; at: number; others: Pin[] } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const ring = useRingTexture();

  const paths = useMemo(
    () =>
      FENCERS.map((f) => {
        const pins = pinsOf(c.steps[to], f);
        const where = (at: number) => pathPoint(c, to, f, at, (pos) => frameAt(c, pos));
        const points = Array.from({ length: SAMPLES + 1 }, (_, i) => where(i / SAMPLES));
        const length = points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]) : 0), 0);
        // A tube a little wider than the drawn line, invisible, to grab the path by.
        const tube = length > 0.02 ? new TubeGeometry(new CatmullRomCurve3(points), SAMPLES * 2, 0.02, 6) : null;
        const rings = pins.length ? pins.map((p) => ({ at: p.at, point: where(p.at) })) : [{ at: 0.5, point: where(0.5) }];
        return { f, pins, points, tube, rings };
      }),
    [c, to],
  );
  useEffect(() => () => paths.forEach((p) => p.tube?.dispose()), [paths]);

  const begin = (f: FencerId, at: number, point: Vector3, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    const pins = paths.find((p) => p.f === f)!.pins;
    const others = pins.filter((p) => p.at !== at);
    drag.current = {
      f,
      at,
      others,
      plane: new Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new Vector3()), point),
      id: ++dragCount,
    };
    if (controls) controls.enabled = false;
  };

  /** Grabbing the path: the nearest ring if close, else a new pin there (or, when full, the nearest ring moves there). */
  const grabPath = (f: FencerId) => (e: ThreeEvent<PointerEvent>) => {
    const { points, pins } = paths.find((p) => p.f === f)!;
    let best = 0;
    points.forEach((p, i) => {
      if (p.distanceTo(e.point) < points[best].distanceTo(e.point)) best = i;
    });
    const t = Math.min(1 - EDGE, Math.max(EDGE, best / SAMPLES));
    const nearest = [...pins].sort((p, q) => Math.abs(p.at - t) - Math.abs(q.at - t))[0];
    if (nearest && (Math.abs(nearest.at - t) < NEAR || pins.length >= MAX_PINS)) {
      if (Math.abs(nearest.at - t) < NEAR) return begin(f, nearest.at, e.point, e);
      begin(f, t, e.point, e);
      drag.current!.others = pins.filter((p) => p !== nearest);
      return;
    }
    begin(f, t, e.point, e);
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const target = e.ray.intersectPlane(d.plane, new Vector3());
    if (!target) return;
    const s = useEditor.getState();
    s.setPins(d.f, [...d.others, pinFor(s.combination, to, d.f, target, d.at)], d.id);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = !useEditor.getState().cameraLocked;
  };
  const pointer = (key: string, cursor: string) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHover(key);
      document.body.style.cursor = cursor;
    },
    onPointerOut: () => {
      setHover(null);
      document.body.style.cursor = '';
    },
  });

  return (
    <>
      {paths.map(({ f, pins, tube, rings }) => (
        <group key={f}>
          {tube && (
            <mesh
              geometry={tube}
              onPointerDown={grabPath(f)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              {...pointer(`${f}.path`, 'grab')}
            >
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
          {rings.map(({ at, point }) => {
            const key = `${f}.${at}`;
            return (
              <sprite
                key={key}
                position={point}
                renderOrder={12}
                scale={hover === key ? [0.05, 0.05, 1] : [0.04, 0.04, 1]}
                onPointerDown={(e) => begin(f, at, point, e)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (pins.length) useEditor.getState().setPins(f, pins.filter((p) => p.at !== at));
                }}
                {...pointer(key, 'grab')}
              >
                <spriteMaterial map={ring} depthTest={false} transparent sizeAttenuation={false} />
              </sprite>
            );
          })}
        </group>
      ))}
    </>
  );
}
