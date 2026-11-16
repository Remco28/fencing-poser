import { useState } from 'react';

const KEY = 'fencing-poser.toured';

const CARDS: { title: string; body: string }[] = [
  {
    title: 'Sketch the pose',
    body: 'Under the 3D view is a flat stick-figure sketch of the same two fencers. Drag any dot (a hand, a foot, a knee, the hips, the point) and the body follows; the feet stay planted. The marker under a fencer slides them along the piste. The same dots work on the 3D figure.',
  },
  {
    title: 'Or click a body part',
    body: 'Its controls appear beside it, with the keys that move it. Faint coloured paths show where each key takes it. Tab moves to the next joint.',
  },
  {
    title: 'Build the combination',
    body: 'Most steps are one click: under Actions, pick a distance, footwork, a parry or a hit, and the fencer does it. Turn on “New step for each action” and each click adds a step, named for you. Press Play (or Space) to watch it move. “Path in” sends a point under or over the opponent’s blade.',
  },
  {
    title: 'Share it',
    body: 'Share gives students a link and a QR code for their phones, or exports a picture, a printable handout or a video. Your work saves in this browser as you go; Library keeps backups.',
  },
];

export function hasToured(): boolean {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    return true;
  }
}

/** Four short cards on the first visit; reopened from the Help tab. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const finish = () => {
    try {
      localStorage.setItem(KEY, 'yes');
    } catch {
      // Only a convenience: the tour may show again.
    }
    onClose();
  };
  const card = CARDS[i];
  return (
    <div className="tour" role="dialog" aria-label="Quick tour">
      <p className="tour-count">
        {i + 1} of {CARDS.length}
      </p>
      <h2>{card.title}</h2>
      <p>{card.body}</p>
      <div className="buttons">
        {i + 1 < CARDS.length ? (
          <>
            <button className="primary" onClick={() => setI(i + 1)} autoFocus>
              Next
            </button>
            <button className="quiet" onClick={finish}>
              Skip
            </button>
          </>
        ) : (
          <button className="primary" onClick={finish} autoFocus>
            Start
          </button>
        )}
      </div>
    </div>
  );
}
