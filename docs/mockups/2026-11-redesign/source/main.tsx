import { Canvas } from '@react-three/fiber';
import { useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasTexture, Vector3 } from 'three';
import { DEFAULT_SETUP } from '@app/model/types.ts';
import { jointPosition, solveRig, type Rig } from '@app/rig/kinematics.ts';
import { Cam, Desk, Fencers, INK_BLUE, preset, type StepPoses } from './Scene.tsx';
import './ui.css';

const STEPS: (StepPoses & { touch?: 'red' | 'green'; shot?: boolean; shaped?: boolean })[] = [
  { label: 'En garde', A: preset('en-garde', -1.75), B: preset('en-garde', 1.75), shot: true },
  { label: 'A: Beat 6', A: preset('en-garde', -1.55, 'parry-6'), B: preset('en-garde', 1.75) },
  { label: 'A: Disengage, lunge under the hand', A: preset('lunge', -0.86), B: preset('en-garde', 1.75, 'parry-4'), touch: 'red', shaped: true, shot: true },
  { label: 'B: Attacks', A: preset('en-garde', -1.75), B: preset('lunge', 0.95) },
  { label: 'A: Parry 6', A: preset('en-garde', -1.75, 'parry-6'), B: preset('lunge', 0.95) },
  { label: 'A: Riposte to the body', A: preset('en-garde', -1.6, 'extension'), B: preset('lunge', 0.95), touch: 'red' },
];

const q = new URLSearchParams(location.search);
const mode = q.get('m') ?? 'scene';
const W = Number(q.get('w') ?? 1440);
const H = Number(q.get('h') ?? 900);
const camQ = q.get('cam')?.split(',').map(Number);

type CamSpec = { pos: [number, number, number]; look: [number, number, number]; fov: number; shiftX?: number; shiftY?: number };
const SIDE: CamSpec = { pos: [0, 1.05, 9], look: [0, 0.92, 0], fov: 21 };

function World({ step, cam, props, ghost, handles, dpr = 1 }: { step: number; cam: CamSpec; props?: boolean; ghost?: number; handles?: boolean; dpr?: number }) {
  return (
    <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={dpr}>
      <Cam {...cam} />
      <Desk props={props} />
      <Fencers step={STEPS[step]} ghost={ghost === undefined ? undefined : STEPS[ghost]} />
      {handles && <Handles step={STEPS[step]} />}
    </Canvas>
  );
}

/** Drag handles on the fencer being posed: paper dots with an ink ring. */
function Handles({ step }: { step: StepPoses }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d')!;
    g.beginPath();
    g.arc(48, 48, 34, 0, Math.PI * 2);
    g.fillStyle = '#fffdf9';
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = INK_BLUE;
    g.stroke();
    return new CanvasTexture(c);
  }, []);
  const rig = useMemo(() => solveRig(DEFAULT_SETUP, step.A, 0), [step]);
  const pts = [jointPosition(rig, 'wrist_r'), rig.tip, jointPosition(rig, 'ankle_r'), jointPosition(rig, 'ankle_l'), jointPosition(rig, 'pelvis'), jointPosition(rig, 'chest')];
  return (
    <>
      {pts.map((p, i) => (
        <sprite key={i} position={p} scale={i === 1 ? 0.085 : 0.11} renderOrder={10}>
          <spriteMaterial map={tex} depthTest={false} transparent />
        </sprite>
      ))}
    </>
  );
}

const I = {
  back: <path d="M10 3 5 8l5 5" />,
  undo: <path d="M6 3 2.5 6.5 6 10M3 6.5h6.5a4 4 0 0 1 0 8H7" />,
  redo: <path d="M10 3l3.5 3.5L10 10M13 6.5H6.5a4 4 0 0 0 0 8H9" />,
  eye: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.8" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3.3 3.3" />
    </>
  ),
  share: <path d="M8 10V2.5M5 5l3-3 3 3M3 9v3.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />,
  chev: <path d="m6 3 5 5-5 5" />,
  arrow: <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />,
  curve: <path d="M2.5 10C4 4 7 4 8 8s4 4 5.5-2M11 5l2.5 1L12.7 8.6" />,
  pencil: <path d="m3 13 .6-3L11 2.6l2.4 2.4L6 12.4 3 13Z" />,
  folder: <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" />,
  more: (
    <>
      <circle cx="3.5" cy="8" r="0.9" />
      <circle cx="8" cy="8" r="0.9" />
      <circle cx="12.5" cy="8" r="0.9" />
    </>
  ),
  loop: <path d="M3 7a4 4 0 0 1 4-4h4.5M9.5 1 11.5 3l-2 2M13 9a4 4 0 0 1-4 4H4.5M6.5 15l-2-2 2-2" />,
};
const Icon = ({ d }: { d: ReactNode }) => (
  <svg className="i" viewBox="0 0 16 16">
    {d}
  </svg>
);
const PlayIcon = () => (
  <svg viewBox="0 0 16 16">
    <path d="M4 2.5v11l9-5.5-9-5.5Z" />
  </svg>
);

function Thumb({ step }: { step: number }) {
  return (
    <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true }} dpr={2} frameloop="demand">
      <Cam pos={[0, 1.0, 9]} look={[0, 0.84, 0]} fov={16.5} />
      <Desk />
      <Fencers step={STEPS[step]} />
    </Canvas>
  );
}

function Storyboard({ on }: { on: number }) {
  return (
    <div className="card abs board row">
      <div className="play">
        <button className="go" aria-label="Play">
          <PlayIcon />
        </button>
        <span className="row muted" style={{ gap: 5, fontSize: 12 }}>
          <Icon d={I.loop} /> Loop
        </span>
      </div>
      {STEPS.map((s, i) => (
        <div key={i} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
          {i > 0 && (
            <span className={`link${s.shaped ? ' shaped' : ''}`}>
              <Icon d={s.shaped ? I.curve : I.arrow} />
            </span>
          )}
          <div className={`shot${i === on ? ' on' : ''}`}>
            <div className="pic">
              <Thumb step={i} />
              {s.touch && <span className={`lamp ${s.touch}`} />}
              {s.shot && (
                <span className="badge" title="Students see this step from a view you chose">
                  <Icon d={I.eye} />
                </span>
              )}
            </div>
            <div className="cap">
              <b>{i + 1}</b>
              <span>{s.label}</span>
            </div>
          </div>
        </div>
      ))}
      <span className="link" />
      <button className="add">
        <Icon d={I.plus} />
        New step
      </button>
    </div>
  );
}

function TopBar() {
  return (
    <>
      <div className="card abs top-left row">
        <button className="icon-btn" aria-label="Back to the desk">
          <Icon d={I.back} />
        </button>
        <span className="title">Beat, disengage under the hand</span>
        <span className="sep" />
        <span className="faint" style={{ fontSize: 12 }}>
          Saved
        </span>
      </div>
      <div className="card abs top-right row">
        <button className="icon-btn" aria-label="Undo">
          <Icon d={I.undo} />
        </button>
        <button className="icon-btn" aria-label="Redo">
          <Icon d={I.redo} />
        </button>
        <button className="btn ink" style={{ marginLeft: 6 }}>
          <Icon d={I.share} /> Share
        </button>
      </div>
    </>
  );
}

function Views({ sketch, behind }: { sketch: boolean; behind?: boolean }) {
  return (
    <div className="card abs views row">
      <span className="v">Side</span>
      <span className="v">Above</span>
      {behind && <span className="v">Behind A</span>}
      <span className="v">Fit</span>
      <span className="sep" />
      <span className="v">
        <Icon d={I.eye} /> Show
      </span>
      <span className={`v${sketch ? ' on' : ''}`}>
        <Icon d={I.pencil} /> Sketch
      </span>
    </div>
  );
}

function Tray() {
  return (
    <div className="card abs tray">
      <div className="line">
        <span className="wood a" />
        <h2 className="grow">Fencer A</h2>
        <span className="seg">
          <span className="on">A</span>
          <span>B</span>
        </span>
      </div>
      <p className="sub muted">
        Right-handed · pistol grip · 1.78 m <span style={{ color: 'var(--blue)', fontWeight: 500 }}>Change</span>
      </p>
      <hr />
      <div className="line">
        <span className="caps grow">Do next</span>
        <span className="muted" style={{ fontSize: 12 }}>
          as a new step
        </span>
        <span className="switch on" />
      </div>
      <div className="act">
        <span>Feet</span>
        <div>
          {['Advance', 'Retreat', 'Lunge', 'Flèche', 'Recover'].map((t) => (
            <button key={t} className="chip">
              {t}
            </button>
          ))}
        </div>
        <span>Blade</span>
        <div>
          {['Extend', 'Beat 4', 'Beat 6', 'Take 4', 'Take 6'].map((t) => (
            <button key={t} className="chip">
              {t}
            </button>
          ))}
        </div>
        <span>Parry</span>
        <div>
          {[1, 2, 3, 4, 6, 7, 8].map((t) => (
            <button key={t} className="chip num">
              {t}
            </button>
          ))}
        </div>
        <span>Hit</span>
        <div>
          {['Mask', 'Body', 'Arm', 'Hand', 'Leg', 'Foot'].map((t) => (
            <button key={t} className="chip">
              {t}
            </button>
          ))}
          <span className="row muted" style={{ gap: 6, fontSize: 12, marginTop: 2 }}>
            with
            <span className="seg">
              <span>Arm</span>
              <span className="on">Lunge</span>
              <span>Flèche</span>
            </span>
          </span>
        </div>
      </div>
      <hr />
      <div className="line">
        <span className="grow" style={{ fontWeight: 500 }}>
          Poses
        </span>
        <span className="faint" style={{ fontSize: 12 }}>
          16 ready, 3 of yours
        </span>
        <Icon d={I.chev} />
      </div>
      <div className="line" style={{ marginTop: 12 }}>
        <span className="caps grow">Keep still</span>
        <button className="chip on">Feet</button>
        <button className="chip">Hand</button>
        <button className="chip">Point</button>
      </div>
    </div>
  );
}

/** The flat drawing of the same pose: pencil on paper. */
function SketchSheet({ step, bottom, height }: { step: StepPoses; bottom: number; height: number }) {
  const w = W - 40;
  const scale = 76;
  const cx = w / 2 + 40;
  const ground = height - 28;
  const P = (v: Vector3): [number, number] => [cx + v.x * scale, ground - v.y * scale];
  const figure = (rig: Rig, key: string, active: boolean) => {
    const J = (n: Parameters<typeof jointPosition>[1]) => jointPosition(rig, n);
    const Hh = rig.layout.height;
    const head = new Vector3(0.008 * Hh, 0.092 * Hh, 0).applyMatrix4(rig.world.neck);
    const toe = (s: 'r' | 'l') => new Vector3(rig.layout.toe, -rig.layout.ankleHeight, 0).applyMatrix4(rig.world[`ankle_${s}`]);
    const heel = (s: 'r' | 'l') => new Vector3(-rig.layout.heel, -rig.layout.ankleHeight, 0).applyMatrix4(rig.world[`ankle_${s}`]);
    const line = (pts: Vector3[], cls: string, k: string) => <polyline key={k} className={cls} points={pts.map((p) => P(p).join(',')).join(' ')} />;
    const far = 'l';
    const near = 'r';
    const limbs = (s: 'r' | 'l', cls: string) => [
      line([J(`shoulder_${s}`), J(`elbow_${s}`), J(`wrist_${s}`)], cls, `arm${s}`),
      line([J(`hip_${s}`), J(`knee_${s}`), J(`ankle_${s}`)], cls, `leg${s}`),
      line([heel(s), toe(s)], cls, `foot${s}`),
    ];
    const dots: [Vector3, boolean][] = [
      [J('pelvis'), true],
      [J('chest'), false],
      [J('elbow_r'), false],
      [J('elbow_l'), false],
      [J('knee_r'), false],
      [J('knee_l'), false],
      [J('wrist_l'), true],
      [J('wrist_r'), true],
      [J('ankle_r'), true],
      [J('ankle_l'), true],
      [rig.tip, true],
    ];
    const [hx, hy] = P(head);
    return (
      <g key={key} className={active ? 'fig active' : 'fig'}>
        {limbs(far, 'far')}
        {line([J('pelvis'), J('abdomen'), J('chest'), J('neck')], 'near', 'spine')}
        <circle className="near" cx={hx} cy={hy} r={0.07 * Hh * scale} />
        {limbs(near, 'near')}
        {line([J('wrist_r'), rig.guard], 'near', 'grip')}
        {line([rig.guard, rig.tip], 'blade', 'blade')}
        {dots.map(([p, big], i) => {
          const [x, y] = P(p);
          return <circle key={i} className={big ? 'dot big' : 'dot'} cx={x} cy={y} r={big ? 5.2 : 3.4} />;
        })}
      </g>
    );
  };
  const a = solveRig(DEFAULT_SETUP, step.A, 0);
  const b = solveRig(DEFAULT_SETUP, step.B, 180);
  const [ax] = P(new Vector3(rig_toe(a), 0, 0));
  const [bx] = P(new Vector3(rig_toe(b), 0, 0));
  return (
    <div className="abs sheet" style={{ bottom, height }}>
      <span className="grab" />
      <svg className="draw" viewBox={`0 0 ${w} ${height}`}>
        <defs>
          <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" />
          </filter>
        </defs>
        <style>{`
          .fig polyline, .fig circle { fill: none; stroke-linecap: round; stroke-linejoin: round; }
          .fig .near { stroke: #6b665f; stroke-width: 2.6; }
          .fig .far { stroke: #b3aca0; stroke-width: 2.6; }
          .fig .blade { stroke: #6b665f; stroke-width: 1.3; }
          .fig.active .near { stroke: #35322e; }
          .fig.active .far { stroke: #9a948a; }
          .fig.active .blade { stroke: #35322e; }
          .fig .dot { fill: #fbf7ee; stroke: #8d877d; stroke-width: 1.4; }
          .fig.active .dot { stroke: #35322e; }
          .fig.active .dot.big { fill: #fffdf9; stroke: ${INK_BLUE}; stroke-width: 2.4; }
          .ground { stroke: #8d877d; stroke-width: 1.4; stroke-linecap: round; }
          .dim { stroke: #a39c90; stroke-width: 1; }
          .dimt { font: 500 11px Inter, sans-serif; fill: #6f675c; }
        `}</style>
        <line className="ground" x1={90} x2={w - 30} y1={ground} y2={ground} />
        {[-2, 0, 2].map((x) => (
          <line key={x} className="ground" x1={cx + x * scale} x2={cx + x * scale} y1={ground} y2={ground + 6} />
        ))}
        <g filter="url(#pencil)">
          {figure(b, 'b', false)}
          {figure(a, 'a', true)}
        </g>
        <line className="dim" x1={ax} x2={bx} y1={ground + 14} y2={ground + 14} />
        <line className="dim" x1={ax} x2={ax} y1={ground + 10} y2={ground + 18} />
        <line className="dim" x1={bx} x2={bx} y1={ground + 10} y2={ground + 18} />
        <rect x={(ax + bx) / 2 - 24} y={ground + 7} width={48} height={14} fill="#fbf7ee" />
        <text className="dimt" x={(ax + bx) / 2} y={ground + 18} textAnchor="middle">
          {(Math.abs(rig_toe(b) - rig_toe(a))).toFixed(2)} m
        </text>
      </svg>
      <div className="tag row">
        <b>Sketch</b>
        <span className="seg">
          <span className="on">Side</span>
          <span>Above</span>
          <span>Behind A</span>
        </span>
      </div>
    </div>
  );
}
/** Where the front toe is along the piste. */
function rig_toe(rig: Rig): number {
  const t = (s: 'r' | 'l') => new Vector3(rig.layout.toe, -rig.layout.ankleHeight, 0).applyMatrix4(rig.world[`ankle_${s}`]).x;
  const mid = jointPosition(rig, 'pelvis').x;
  const a = t('r');
  const b = t('l');
  return Math.abs(a) < Math.abs(b) === Math.abs(mid) > Math.abs(a) ? a : Math.abs(a) < Math.abs(b) ? a : b;
}

function Frame({ children, cls = '' }: { children: ReactNode; cls?: string }) {
  return (
    <div className={`frame ${cls}`} style={{ width: W, height: H }}>
      {children}
    </div>
  );
}

function PoseScreen() {
  const sketchH = 192;
  const boardTop = 16 + 128 + 12;
  const cam: CamSpec = camQ
    ? { pos: [camQ[0], camQ[1], camQ[2]], look: [camQ[3], camQ[4], camQ[5]], fov: camQ[6], shiftX: camQ[7], shiftY: camQ[8] }
    : { pos: [1.3, 1.5, 9.3], look: [0.2, 0.92, 0], fov: 27, shiftX: 175, shiftY: 150 };
  return (
    <Frame>
      <div className="world">
        <World step={2} cam={cam} ghost={1} handles />
      </div>
      <div className="vignette" />
      <TopBar />
      <Tray />
      <Views sketch behind />
      <SketchSheet step={STEPS[2]} bottom={boardTop} height={sketchH} />
      <Storyboard on={2} />
    </Frame>
  );
}

function CalmScreen() {
  const cam: CamSpec = camQ
    ? { pos: [camQ[0], camQ[1], camQ[2]], look: [camQ[3], camQ[4], camQ[5]], fov: camQ[6], shiftX: camQ[7], shiftY: camQ[8] }
    : { pos: [0.8, 1.7, 8.6], look: [0, 0.9, 0], fov: 27, shiftY: 60 };
  return (
    <Frame>
      <div className="world">
        <World step={4} cam={cam} />
      </div>
      <div className="vignette" />
      <TopBar />
      <Views sketch={false} />
      <div className="abs hint" style={{ bottom: 16 + 128 + 16 }}>
        Click a fencer to pose them
      </div>
      <Storyboard on={4} />
    </Frame>
  );
}

const LIBRARY = [
  { name: 'Beat, disengage under the hand', meta: '6 steps · edited today', step: 2, on: true },
  { name: 'False advance-lunge, overcut to the arm', meta: '5 steps · yesterday', step: 3 },
  { name: 'Parry 6, riposte', meta: '4 steps · 9 Nov · Cadets', step: 4 },
  { name: 'Second intention to the foot', meta: '7 steps · 2 Nov · Cadets', step: 5 },
];

function DeskScreen() {
  const cam: CamSpec = camQ
    ? { pos: [camQ[0], camQ[1], camQ[2]], look: [camQ[3], camQ[4], camQ[5]], fov: camQ[6], shiftX: camQ[7], shiftY: camQ[8] }
    : { pos: [-3.2, 5.2, 10.5], look: [0.2, 0.5, 0], fov: 30, shiftX: 215, shiftY: 0 };
  return (
    <Frame>
      <div className="world">
        <World step={0} cam={cam} props />
      </div>
      <div className="vignette" />
      <div className="card abs home">
        <h1>Fencing Poser</h1>
        <p className="lead">Set the figures, plot the phrase, hand it to your students.</p>
        <button className="btn ink big" style={{ alignSelf: 'flex-start' }}>
          <Icon d={I.plus} /> New combination
        </button>
        <div className="search">
          <Icon d={I.search} /> Search 23 combinations
        </div>
        <div className="row" style={{ margin: '10px 0 4px' }}>
          <span className="caps grow">Recent</span>
          <span className="seg">
            <span className="on">All</span>
            <span>Cadets</span>
            <span>Seniors</span>
          </span>
        </div>
        {LIBRARY.map((c) => (
          <div key={c.name} className={`combo${c.on ? ' on' : ''}`}>
            <div className="pic">
              <Thumb step={c.step} />
            </div>
            <div className="grow">
              <div className="name">{c.name}</div>
              <div className="meta">{c.meta}</div>
            </div>
          </div>
        ))}
        <div className="foot">
          <Icon d={I.folder} />
          <span className="grow">Saved here and in “Fencing”</span>
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Back up</span>
        </div>
      </div>
    </Frame>
  );
}

function PhoneScreen() {
  const sceneH = 440;
  const cam: CamSpec = camQ
    ? { pos: [camQ[0], camQ[1], camQ[2]], look: [camQ[3], camQ[4], camQ[5]], fov: camQ[6], shiftX: camQ[7], shiftY: camQ[8] }
    : { pos: [0.1, 1.05, 10.6], look: [0.1, 0.84, 0], fov: 30 };
  return (
    <Frame cls="phone">
      <div className="abs" style={{ top: 0, left: 0, right: 0, height: sceneH + 30 }}>
        <World step={2} cam={cam} dpr={2} />
      </div>
      <div className="abs bar">
        <span className="t">Beat, disengage under the hand</span>
        <span className="icon-btn" style={{ background: 'rgba(252,249,243,.8)' }}>
          <Icon d={I.more} />
        </span>
      </div>
      <div className="abs panel" style={{ top: sceneH }}>
        <div className="ticks">
          {STEPS.map((_, i) => (
            <i key={i} className={i < 2 ? 'done' : i === 2 ? 'now' : ''} />
          ))}
        </div>
        <div className="row">
          <span className="caps grow">Step 3 of 6</span>
          <span className="row" style={{ gap: 7, fontSize: 12, fontWeight: 600 }}>
            <span className="lamp red" /> Touch for A
          </span>
        </div>
        <h3>A: Disengage, lunge under the hand</h3>
        <p>The point drops under B’s guard as the arm straightens. The lunge starts only once the arm is out.</p>
        <div className="ctl">
          <span className="rnd">
            <svg className="i" viewBox="0 0 16 16">
              <path d="M10 3 5 8l5 5" />
            </svg>
          </span>
          <span className="rnd main">
            <PlayIcon />
          </span>
          <span className="rnd">
            <svg className="i" viewBox="0 0 16 16">
              <path d="m6 3 5 5-5 5" />
            </svg>
          </span>
        </div>
        <div className="mode">
          <span className="seg">
            <span className="on">Step by step</span>
            <span>Smooth</span>
          </span>
        </div>
      </div>
    </Frame>
  );
}

function Bare() {
  const c = camQ ?? [0, 1.9, 8.2, 0, 0.85, 0, 30];
  return (
    <Frame>
      <div className="world">
        <World step={Number(q.get('step') ?? 2)} cam={{ pos: [c[0], c[1], c[2]], look: [c[3], c[4], c[5]], fov: c[6] }} props={q.has('props')} />
      </div>
    </Frame>
  );
}

void SIDE;
const screens: Record<string, () => ReactNode> = { scene: Bare, pose: PoseScreen, calm: CalmScreen, desk: DeskScreen, phone: PhoneScreen };
const Screen = (screens[mode] ?? Bare) as () => ReactNode;
createRoot(document.getElementById('root')!).render(<Screen />);
