import { useState } from 'react';

const KEY = 'fencing-poser.toured';

const CARDS: { title: string; body: string }[] = [
  {
    title: 'Pick up a fencer',
    body: 'Click one of the wooden figures. Dots appear on the hands, feet, hips and point: drag one and the body follows. Click a body part for fine control of that joint. The tray beside them chooses what stays still while you drag, and keeps the poses you save.',
  },
  {
    title: 'Sketch it flat',
    body: 'The sheet of paper under the view shows the same two fencers as stick figures. Every joint is a dot to drag, and the feet stay planted. The marker under a fencer slides them along the piste.',
  },
  {
    title: 'Build the phrase',
    body: 'Pose the two fencers, then press New step: it starts from the pose you have, ready to change. Each step is a picture in the row along the bottom. Press Play (or Space) to watch them move from one to the next: the feet step by themselves.',
  },
  {
    title: 'Hand it to your students',
    body: 'Share gives them a link and a QR code for their phones, or you a picture, a printable handout or a video. Everything saves as you go. The arrow at the top left goes back to the desk and your other combinations.',
  },
];

export function hasToured(): boolean {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    return true;
  }
}

/** Four short cards on the first visit; reopened from Help. */
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
