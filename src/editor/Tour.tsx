import { useState } from 'react';

const KEY = 'fencing-poser.toured';

const CARDS: { title: string; body: string }[] = [
  {
    title: 'Pose by dragging',
    body: 'Grab a coloured handle and drag: orange for a hand, red for the point, blue for a foot, purple for the hips. The rest of the body follows.',
  },
  {
    title: 'Or click a body part',
    body: 'Its controls appear beside it, with the keys that move it. Faint coloured paths show where each key takes it. Tab moves to the next joint.',
  },
  {
    title: 'Build the combination',
    body: '+ New step starts from the current pose. Give each step a label in the Step tab. Press Play (or Space) to watch it move, or drag the timeline.',
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
