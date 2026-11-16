import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Vector3 } from 'three';
import { INK_SOFT } from '../design.ts';
import { HANDLE_COLOR, nextDragId } from '../ik/Handles.tsx';
import { DOT_JOINT, DOTS, dotPositions, dragDotKept, headCentre, keptDots, keptInDrag, keptInSlide, slideFencer, type Dot, type Spots } from '../ik/drag.ts';
import { FENCERS, HEADING, type FencerId } from '../model/combination.ts';
import type { FencerSetup, Pose } from '../model/types.ts';
import { formatDistance } from '../model/units.ts';
import { jointPosition, solveRig, type Rig } from '../rig/kinematics.ts';
import { frontToe } from '../scene/measure.ts';
import { PISTE } from '../scene/Piste.tsx';
import { currentStep, useEditor } from '../editor/store.ts';
import { Toggle } from '../ui/Toggle.tsx';
import { frameAt, keyAt } from '../viewer/player.ts';
import { toFlat, toWorld, type Flat, type SketchView } from './project.ts';

// A flat stick-figure drawing of both fencers under the 3D view: the same
// poses, seen square-on, with a dot on every joint that can be dragged. A
// drag never changes depth, so what moves is exactly what is seen.

/** Pixels per metre and where world (0, 0) lands: screen = (tx + u·k, ty − v·k). */
interface Cam {
  k: number;
  tx: number;
  ty: number;
}

/** How far the fencers can be slid along the piste (as the [ ] keys allow). */
const PISTE_HALF = 8.5;
/** A press that moves less than this (px) is a click. */
const CLICK_PX = 4;
/** Room kept clear for the toolbar (top) and the distance label (bottom). */
const PAD = { top: 46, bottom: 34, side: 24 };

const DOT_COLOR: Record<Dot, string> = {
  ...HANDLE_COLOR,
  chest: INK_SOFT,
  head: INK_SOFT,
  elbow_r: INK_SOFT,
  elbow_l: INK_SOFT,
  knee_r: INK_SOFT,
  knee_l: INK_SOFT,
};

const DOT_RADIUS: Record<Dot, number> = {
  hips: 6.5,
  chest: 5.5,
  head: 5.5,
  hand_r: 6,
  hand_l: 6,
  foot_r: 6,
  foot_l: 6,
  point: 5.5,
  elbow_r: 4.5,
  elbow_l: 4.5,
  knee_r: 4.5,
  knee_l: 4.5,
};

const DOT_NAMES: Record<Dot, string> = {
  hips: 'hips',
  chest: 'chest',
  head: 'head',
  hand_r: 'right hand',
  hand_l: 'left hand',
  elbow_r: 'right elbow',
  elbow_l: 'left elbow',
  foot_r: 'right foot',
  foot_l: 'left foot',
  knee_r: 'right knee',
  knee_l: 'left knee',
  point: 'épée point',
};

type Tone = 'strong' | 'light' | 'body' | 'blade';

/** The marks that make up the épée. */
const BLADE_MARKS = ['grip', 'blade', 'guard'];

/** One thing to draw, in flat metres, sorted far to near. */
type Mark =
  | { kind: 'stick'; key: string; a: Flat; b: Flat; tone: Tone; depth: number; other: boolean }
  | { kind: 'head'; key: string; c: Flat; r: number; depth: number; other: boolean }
  | { kind: 'guard'; key: string; c: Flat; dir: Flat; r: number; depth: number; other: boolean };

/** The stick figure of one fencer: weapon arm and front leg strong, the rear limbs lighter. */
function figure(rig: Rig, setup: FencerSetup, f: FencerId, view: SketchView, facing: FencerId, other: boolean): Mark[] {
  const flat = (p: Vector3) => toFlat(view, facing, p);
  const at = (j: Parameters<typeof jointPosition>[1]) => flat(jointPosition(rig, j));
  const w = setup.handedness === 'right' ? 'r' : 'l';
  const marks: Mark[] = [];
  const stick = (key: string, a: Flat, b: Flat, tone: Tone) =>
    marks.push({ kind: 'stick', key: `${f}.${key}`, a, b, tone, depth: (a.depth + b.depth) / 2, other });
  const H = rig.layout.height;

  stick('spine1', at('pelvis'), at('abdomen'), 'body');
  stick('spine2', at('abdomen'), at('chest'), 'body');
  stick('spine3', at('chest'), at('neck'), 'body');
  stick('shoulders', at('shoulder_r'), at('shoulder_l'), 'body');
  stick('hips', at('hip_r'), at('hip_l'), 'body');
  const head = headCentre(rig);
  stick('neck', at('neck'), flat(head), 'body');
  marks.push({ kind: 'head', key: `${f}.head`, c: flat(head), r: 0.075 * H, depth: flat(head).depth, other });

  for (const side of ['r', 'l'] as const) {
    const tone: Tone = side === w ? 'strong' : 'light';
    stick(`upperArm_${side}`, at(`shoulder_${side}`), at(`elbow_${side}`), tone);
    stick(`forearm_${side}`, at(`elbow_${side}`), at(`wrist_${side}`), tone);
    stick(`thigh_${side}`, at(`hip_${side}`), at(`knee_${side}`), tone);
    stick(`shank_${side}`, at(`knee_${side}`), at(`ankle_${side}`), tone);
    const toe = new Vector3(rig.layout.toe, -rig.layout.ankleHeight, 0).applyMatrix4(rig.world[`ankle_${side}`]);
    stick(`foot_${side}`, at(`ankle_${side}`), flat(toe), tone);
  }

  const guard = flat(rig.guard);
  const tip = flat(rig.tip);
  stick('grip', at(`wrist_${w}`), guard, 'blade');
  stick('blade', guard, tip, 'blade');
  marks.push({ kind: 'guard', key: `${f}.guard`, c: guard, dir: { u: tip.u - guard.u, v: tip.v - guard.v, depth: 0 }, r: 0.0675, depth: guard.depth, other });
  return marks;
}

/** Everything of a fencer that should be in view when framing. */
function framePoints(rig: Rig): Vector3[] {
  const H = rig.layout.height;
  const head = headCentre(rig);
  return [
    ...Object.values(dotPositions(rig)),
    head.clone().add(new Vector3(0, 0.075 * H, 0)),
    ...(['ankle_r', 'ankle_l'] as const).map((a) => new Vector3(rig.layout.toe, -rig.layout.ankleHeight, 0).applyMatrix4(rig.world[a])),
    rig.guard.clone(),
  ];
}

interface Box {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
}

function boxOf(points: Vector3[], view: SketchView, facing: FencerId): Box {
  const box = { minU: Infinity, maxU: -Infinity, minV: Infinity, maxV: -Infinity };
  for (const p of points) {
    const { u, v } = toFlat(view, facing, p);
    box.minU = Math.min(box.minU, u);
    box.maxU = Math.max(box.maxU, u);
    box.minV = Math.min(box.minV, v);
    box.maxV = Math.max(box.maxV, v);
  }
  return box;
}

function union(a: Box, b: Box): Box {
  return { minU: Math.min(a.minU, b.minU), maxU: Math.max(a.maxU, b.maxU), minV: Math.min(a.minV, b.minV), maxV: Math.max(a.maxV, b.maxV) };
}

/** The camera that shows `box` as large as fits in a w × h strip. */
function camFor(box: Box, w: number, h: number): Cam {
  const du = Math.max(box.maxU - box.minU, 0.3);
  const dv = Math.max(box.maxV - box.minV, 0.3);
  const k = Math.min((w - 2 * PAD.side) / du, (h - PAD.top - PAD.bottom) / dv, 900);
  const cu = (box.minU + box.maxU) / 2;
  const cv = (box.minV + box.maxV) / 2;
  return { k, tx: w / 2 - cu * k, ty: PAD.top + (h - PAD.top - PAD.bottom) / 2 + cv * k };
}

type Drag =
  // `from` is the fencer's pose at pointer-down, `stepId` the step, `spots` where their kept things belong.
  | { kind: 'dot'; f: FencerId; dot: Dot; start: Vector3; from: Pose; stepId: string; spots: Spots; id: number; x0: number; y0: number; moved: boolean }
  | { kind: 'floor'; f: FencerId; from: Pose; stepId: string; spots: Spots; id: number; x0: number; y0: number; moved: boolean }
  | { kind: 'pan'; cam: Cam; x0: number; y0: number };

export function Sketch() {
  const s = useEditor();
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCamState] = useState<Cam>({ k: 100, tx: 0, ty: 0 });
  const camRef = useRef(cam);
  const setCam = (c: Cam) => {
    camRef.current = c;
    setCamState(c);
  };
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const view = s.sketch.view;
  // Behind whom: the fencer being posed, except that grabbing the other
  // fencer's dot here does not turn the view round mid-drag.
  const [behind, setBehind] = useState<FencerId>(s.active);
  const ownSwitch = useRef(false);
  useEffect(() => {
    if (ownSwitch.current) ownSwitch.current = false;
    else setBehind(s.active);
  }, [s.active]);
  const facing = view === 'behind' ? behind : 'A';

  // The poses the 3D view shows: the step, or the in-between frame while playing.
  const playing = !!s.preview;
  const frame = useMemo(() => (s.preview ? frameAt(s.combination, s.preview.pos) : null), [s.preview, s.combination]);
  const poses = frame ? frame.poses : currentStep(s).poses;
  const shownIndex = s.preview ? keyAt(s.combination, s.preview.pos) : s.stepIndex;
  const shaping = s.pathEdit && s.stepIndex > 0 && !playing;
  const editable = !playing && !shaping;

  const setupA = s.combination.fencers.A;
  const setupB = s.combination.fencers.B;
  const rigA = useMemo(() => solveRig(setupA, poses.A, HEADING.A), [setupA, poses.A]);
  const rigB = useMemo(() => solveRig(setupB, poses.B, HEADING.B), [setupB, poses.B]);
  const rigs = useMemo(() => ({ A: rigA, B: rigB }), [rigA, rigB]);
  const dots = useMemo(() => ({ A: dotPositions(rigA), B: dotPositions(rigB) }), [rigA, rigB]);

  /** What a fit should frame. */
  const fitBox = (): Box => {
    const pts = (f: FencerId) => framePoints(rigs[f]);
    if (view !== 'behind') {
      const box = boxOf([...pts('A'), ...pts('B')], view, facing);
      // From above, the piste's width is always in view; from the side, the floor.
      return view === 'above' ? union(box, { minU: box.minU, maxU: box.maxU, minV: -PISTE.width / 2, maxV: PISTE.width / 2 }) : box;
    }
    // The fencer, and the opponent's blade beyond.
    const theirs = rigs[behind === 'A' ? 'B' : 'A'];
    return union(boxOf(pts(behind), view, facing), boxOf([theirs.guard, theirs.tip], view, facing));
  };
  const fit = () => {
    if (size.w > 0 && size.h > 0) setCam(camFor(fitBox(), size.w, size.h));
  };

  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    let old = { w: 0, h: 0 };
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Keep the middle of the drawing in the middle as the strip changes size.
      if (old.w > 0 && old.h > 0) {
        const c = camRef.current;
        setCam({ ...c, tx: c.tx + (width - old.w) / 2, ty: c.ty + (height - old.h) / 2 });
      }
      old = { w: width, h: height };
      setSize(old);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Frame both fencers on opening, on a new view and on another combination.
  const sized = size.w > 0 && size.h > 0;
  useEffect(() => {
    if (!drag.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sized, view, facing, s.combination.id]);

  // On another step, or when the strip is resized, refit only if someone has left the view.
  useEffect(() => {
    if (!sized || drag.current) return;
    const c = camRef.current;
    const out = FENCERS.some((f) => {
      const b = boxOf(framePoints(rigs[f]), view, facing);
      return c.tx + b.minU * c.k < 0 || c.tx + b.maxU * c.k > size.w || c.ty - b.maxV * c.k < 0 || c.ty - b.minV * c.k > size.h;
    });
    if (out) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownIndex, size.w, size.h]);

  // Zoom toward the pointer (a native listener, so the page does not scroll).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const c = camRef.current;
      const k = Math.min(3000, Math.max(15, c.k * Math.exp(-e.deltaY * 0.0015)));
      const u = (px - c.tx) / c.k;
      const v = (c.ty - py) / c.k;
      setCam({ k, tx: px - u * k, ty: py + v * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const X = (u: number) => cam.tx + u * cam.k;
  const Y = (v: number) => cam.ty - v * cam.k;
  const local = (e: ReactPointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  /** Make `f` the posing fencer, without turning a behind view round. */
  const posing = (f: FencerId) => {
    const st = useEditor.getState();
    if (st.active === f) return;
    ownSwitch.current = true;
    st.setActive(f);
  };

  const begin = (d: Drag, e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    svg.current?.setPointerCapture(e.pointerId);
    drag.current = d;
    setDragging(d.kind);
  };

  const onDotDown = (f: FencerId, dot: Dot) => (e: ReactPointerEvent) => {
    if (!editable || e.button !== 0) return;
    posing(f);
    const { x, y } = local(e);
    const st = useEditor.getState();
    const spots = st.spotsFor(f, keptInDrag(st.combination.fencers[f], st.keep, dot));
    begin({ kind: 'dot', f, dot, start: dots[f][dot].clone(), from: poses[f], stepId: currentStep(st).id, spots, id: nextDragId(), x0: x, y0: y, moved: false }, e);
  };

  const onFloorDown = (f: FencerId) => (e: ReactPointerEvent) => {
    if (!editable || e.button !== 0) return;
    posing(f);
    const { x, y } = local(e);
    const st = useEditor.getState();
    begin({ kind: 'floor', f, from: poses[f], stepId: currentStep(st).id, spots: st.spotsFor(f, keptInSlide(st.keep)), id: nextDragId(), x0: x, y0: y, moved: false }, e);
  };

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const { x, y } = local(e);
    begin({ kind: 'pan', cam: camRef.current, x0: x, y0: y }, e);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = local(e);
    if (d.kind === 'pan') {
      setCam({ ...d.cam, tx: d.cam.tx + x - d.x0, ty: d.cam.ty + y - d.y0 });
      return;
    }
    if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < CLICK_PX) return;
    d.moved = true;
    const st = useEditor.getState();
    if (st.active !== d.f) return;
    const c = camRef.current;
    if (d.kind === 'dot') {
      const target = toWorld(view, facing, (x - c.tx) / c.k, (c.ty - y) / c.k, d.start);
      // Always worked out from the pose the drag began with, so where the dot
      // is decides the pose, not the route the pointer took to get there.
      const r = dragDotKept(d.from, st.combination.fencers[d.f], HEADING[d.f], d.dot, target, st.keep, d.spots);
      st.dragPose(r.pose, d.id, { fencer: d.f, stepId: d.stepId, pose: d.from, spots: d.spots, cut: r.cut });
    } else {
      // Along the piste; from above, across it too.
      // Worked out from the pose the drag began with, like a dot. The feet
      // travel with the fencer; a kept hand or point stays where it was.
      const from = d.from.root;
      const rx = Math.max(-PISTE_HALF, Math.min(PISTE_HALF, from.x + (x - d.x0) / c.k));
      const rz = view === 'above' ? Math.max(-PISTE.width / 2, Math.min(PISTE.width / 2, from.z + (y - d.y0) / c.k)) : from.z;
      const r = slideFencer(d.from, st.combination.fencers[d.f], HEADING[d.f], rx, rz, st.keep, d.spots);
      st.dragPose(r.pose, d.id, { fencer: d.f, stepId: d.stepId, pose: d.from, spots: d.spots, cut: r.cut });
    }
  };

  const onUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    drag.current = null;
    setDragging(null);
    // A click on a dot picks its joint, so the keys and the controls work on it.
    if (d.kind === 'dot' && !d.moved) useEditor.getState().select(DOT_JOINT[d.dot], d.f);
    if (d.kind === 'floor' && !d.moved) useEditor.getState().select('pelvis', d.f);
  };

  // From behind, the two fencers lie on top of each other, so only the
  // opponent's blade is drawn: it is what the hand and the point are placed against.
  const marks = useMemo(
    () =>
      FENCERS.flatMap((f) => {
        const all = figure(rigs[f], s.combination.fencers[f], f, view, facing, f !== s.active);
        return view === 'behind' && f !== facing ? all.filter((m) => BLADE_MARKS.some((k) => m.key === `${f}.${k}`)) : all;
      }).sort((a, b) => a.depth - b.depth),
    [rigs, s.combination.fencers, view, facing, s.active],
  );

  const floorY = Y(0);
  const toes = useMemo(() => ({ A: frontToe(rigA, 'A'), B: frontToe(rigB, 'B') }), [rigA, rigB]);
  const floorDrag = dragging === 'floor';
  const showGap = view === 'side' || (view === 'above' && floorDrag);
  const gapY = view === 'side' ? floorY + 20 : Y(-PISTE.width / 2) + 20;
  const gap = Math.abs(toes.B.x - toes.A.x);
  const fencerOrder = FENCERS.filter((f) => f !== s.active).concat(s.active);

  return (
    <div className={`sketch sketch-${view}${dragging ? ' dragging' : ''}`}>
      <svg
        ref={svg}
        className="sketch-svg"
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={(e) => !(e.target as Element).closest('.sk-dot, .sk-marker') && fit()}
        role="img"
        aria-label="Stick-figure sketch of both fencers"
      >
        {sized && (
          <>
            {/* The floor and the piste's lines. */}
            {view === 'above' ? (
              <g className="sk-piste">
                <rect
                  x={X(-PISTE.rearLimit)}
                  y={Y(PISTE.width / 2)}
                  width={2 * PISTE.rearLimit * cam.k}
                  height={PISTE.width * cam.k}
                  rx={2}
                />
                {[-PISTE.enGarde, 0, PISTE.enGarde].map((u) => (
                  <line key={u} x1={X(u)} x2={X(u)} y1={Y(PISTE.width / 2)} y2={Y(-PISTE.width / 2)} />
                ))}
              </g>
            ) : (
              <g className="sk-floor">
                <line x1={0} x2={size.w} y1={floorY} y2={floorY} />
                {(view === 'side' ? [-PISTE.enGarde, 0, PISTE.enGarde] : [-PISTE.width / 2, PISTE.width / 2]).map((u) => (
                  <line key={u} className="tick" x1={X(u)} x2={X(u)} y1={floorY} y2={floorY + (u === 0 ? 10 : 6)} />
                ))}
              </g>
            )}

            {/* Far to near, so what is in front is drawn over what is behind. */}
            <g className="sk-figures">
              {marks.map((m) => {
                if (m.kind === 'stick')
                  return (
                    <line
                      key={m.key}
                      className={`sk-${m.tone}${m.other ? ' other' : ''}`}
                      x1={X(m.a.u)}
                      y1={Y(m.a.v)}
                      x2={X(m.b.u)}
                      y2={Y(m.b.v)}
                    />
                  );
                if (m.kind === 'head')
                  return <circle key={m.key} className={`sk-head${m.other ? ' other' : ''}`} cx={X(m.c.u)} cy={Y(m.c.v)} r={Math.max(4, m.r * cam.k)} />;
                // The guard: a short bar across the blade.
                const len = Math.hypot(m.dir.u, m.dir.v) || 1;
                const r = Math.max(4, m.r * cam.k);
                const nx = (-m.dir.v / len) * r;
                const ny = (-m.dir.u / len) * r;
                const cx = X(m.c.u);
                const cy = Y(m.c.v);
                return <line key={m.key} className={`sk-guard${m.other ? ' other' : ''}`} x1={cx - nx} y1={cy - ny} x2={cx + nx} y2={cy + ny} />;
              })}
            </g>

            {/* Distance between the front feet. */}
            {showGap && (
              <g className={`sk-gap${floorDrag ? ' on' : ''}`}>
                <line x1={X(toes.A.x)} x2={X(toes.B.x)} y1={gapY} y2={gapY} />
                <line x1={X(toes.A.x)} x2={X(toes.A.x)} y1={gapY - 4} y2={gapY + 4} />
                <line x1={X(toes.B.x)} x2={X(toes.B.x)} y1={gapY - 4} y2={gapY + 4} />
                <text x={(X(toes.A.x) + X(toes.B.x)) / 2} y={gapY - 5}>
                  {formatDistance(gap, s.units)}
                </text>
              </g>
            )}

            {/* Floor markers: slide a fencer along the piste. */}
            {view !== 'behind' &&
              fencerOrder.map((f) => {
                const p = dots[f].hips;
                const cx = X(p.x);
                const cy = view === 'side' ? floorY + 2 : Y(-p.z) + 26;
                return (
                  <g
                    key={f}
                    className={`sk-marker${f === s.active ? '' : ' other'}${hover === `${f}.floor` ? ' hover' : ''}${editable ? '' : ' off'}`}
                    onPointerDown={onFloorDown(f)}
                    onPointerEnter={() => setHover(`${f}.floor`)}
                    onPointerLeave={() => setHover(null)}
                  >
                    <title>{`Slide ${f} along the piste${view === 'above' ? ' (or across it)' : ''}; click to pick ${f}’s hips`}</title>
                    <rect x={cx - 12} y={cy - 4} width={24} height={20} />
                    <path d={`M${cx} ${cy}l7 10h-14z`} />
                  </g>
                );
              })}

            {/* The dots: the other fencer's first, the posing fencer's on top. */}
            {view === 'behind' &&
              (() => {
                const p = toFlat(view, facing, dots[facing === 'A' ? 'B' : 'A'].point);
                return <circle className="sk-their-point" cx={X(p.u)} cy={Y(p.v)} r={4} />;
              })()}
            {fencerOrder
              .filter((f) => view !== 'behind' || f === facing)
              .map((f) => {
              const kept = keptDots(s.combination.fencers[f], s.keep);
              return (
                <g key={f} className={`sk-dots${f === s.active ? '' : ' other'}${editable ? '' : ' off'}`}>
                  {DOTS.map((dot) => {
                    const p = toFlat(view, facing, dots[f][dot]);
                    const cx = X(p.u);
                    const cy = Y(p.v);
                    const id = `${f}.${dot}`;
                    const r = DOT_RADIUS[dot] * (hover === id ? 1.35 : 1);
                    const selected = f === s.active && s.selected === DOT_JOINT[dot];
                    return (
                      <g
                        key={dot}
                        className="sk-dot"
                        onPointerDown={onDotDown(f, dot)}
                        onPointerEnter={() => setHover(id)}
                        onPointerLeave={() => setHover(null)}
                      >
                        <title>{`${f}’s ${DOT_NAMES[dot]}${kept.includes(dot) ? ' (kept in place)' : ''}`}</title>
                        <circle className="hit" cx={cx} cy={cy} r={11} />
                        {selected && <circle className="selected" cx={cx} cy={cy} r={r + 3.5} />}
                        {/* A paper dot with a ring; filled in while it is kept in place. */}
                        <circle className={`fill${kept.includes(dot) ? ' kept' : ''}`} cx={cx} cy={cy} r={r} stroke={DOT_COLOR[dot]} />
                        {kept.includes(dot) && <circle className="pin" cx={cx} cy={cy} r={r * 0.3} />}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </>
        )}
      </svg>

      <div className="sketch-tools">
        <Toggle
          bare
          label="Sketch view"
          value={view}
          options={[
            ['side', 'Side'],
            ['above', 'Above'],
            ['behind', `Behind ${behind}`],
          ]}
          onChange={(v) => {
            // Choosing Behind again turns it to the fencer being posed.
            if (v === 'behind') setBehind(useEditor.getState().active);
            s.setSketchView(v);
          }}
        />
        <button onClick={fit} title="Frame the fencers (or double-click the background)">
          Fit
        </button>
      </div>
    </div>
  );
}
