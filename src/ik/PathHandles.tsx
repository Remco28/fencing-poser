import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasTexture, CatmullRomCurve3, Plane, SRGBColorSpace, TubeGeometry, Vector3 } from 'three';
import { ACCENT, PAPER } from '../design.ts';
import { useEditor } from '../editor/store.ts';
import { FENCERS, type Combination, type FencerId, type Pin } from '../model/combination.ts';
import { frameAt, pinsOf } from '../viewer/player.ts';
import { freeSlots, grabAt, pathPoint, pinFor } from './path.ts';

let dragCount = 0;

const SAMPLES = 40;

/** A paper disc with an ink ring and a small grip mark: clearly not a drag handle of the body. */
function useRingTexture() {
  const texture = useMemo(() => {
    const size = 96;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
    g.fillStyle = PAPER;
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = ACCENT;
    g.stroke();
    g.fillStyle = ACCENT;
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
 * Shaping the movement into step `to`: drag a ring to bend a point's path.
 * Solid rings are bends; faint ones show where another can go (up to three
 * per point). The path itself can be grabbed anywhere too. Double-clicking a
 * ring removes it. The poses at either end stay as they are.
 */
export function PathHandles({ c, to }: { c: Combination; to: number }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const drag = useRef<{ f: FencerId; plane: Plane; x: number; id: number; at: number; others: Pin[] } | null>(null);
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
        const rings = [
          ...pins.map((p) => ({ at: p.at, point: where(p.at), free: false })),
          ...freeSlots(pins).map((at) => ({ at, point: where(at), free: true })),
        ];
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
    // A pin moves up and down and across the piste, never along it: how far
    // along the piste the point is comes from the movement itself. Looking
    // along the piste (from behind, or at an angle), the drag follows the
    // cursor across that upright plane; side on, where that plane is seen
    // edge on, it follows the cursor up and down.
    const look = camera.getWorldDirection(new Vector3());
    const across = Math.abs(look.x) > 0.35;
    drag.current = {
      f,
      at,
      others,
      x: point.x,
      plane: new Plane().setFromNormalAndCoplanarPoint(across ? new Vector3(1, 0, 0) : look, point),
      id: ++dragCount,
    };
    if (controls) controls.enabled = false;
  };

  /** Grabbing the path: the nearest ring if close, else a new pin there (or, when full, the nearest ring moves there). */
  const grabPath = (f: FencerId) => (e: ThreeEvent<PointerEvent>) => {
    const { points, pins, rings } = paths.find((p) => p.f === f)!;
    // A press on (or just by) a ring takes that ring, whatever part of the path lies under it.
    const onScreen = (p: Vector3) => {
      const v = p.clone().project(camera);
      return new Vector3(((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height, 0);
    };
    const pressed = new Vector3(e.offsetX, e.offsetY, 0);
    const ringHit = rings.find((r) => onScreen(r.point).distanceTo(pressed) < 18);
    if (ringHit) return begin(f, ringHit.at, ringHit.point, e);
    let best = 0;
    points.forEach((p, i) => {
      if (p.distanceTo(e.point) < points[best].distanceTo(e.point)) best = i;
    });
    const { at, others } = grabAt(pins, best / SAMPLES);
    begin(f, at, e.point, e);
    drag.current!.others = others;
  };

  const move = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    const target = e.ray.intersectPlane(d.plane, new Vector3());
    if (!target) return;
    target.x = d.x;
    const s = useEditor.getState();
    s.setPins(d.f, [...d.others, pinFor(s.combination, to, d.f, target, d.at)], d.id);
  };
  const end = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    if (controls) controls.enabled = true;
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
          {rings.map(({ at, point, free }) => {
            const key = `${f}.${at}`;
            const size = (free ? 0.028 : 0.04) * (hover === key ? 1.25 : 1);
            return (
              <sprite
                key={key}
                position={point}
                renderOrder={12}
                scale={[size, size, 1]}
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
                <spriteMaterial map={ring} depthTest={false} transparent opacity={free && hover !== key ? 0.5 : 1} sizeAttenuation={false} />
              </sprite>
            );
          })}
        </group>
      ))}
    </>
  );
}
