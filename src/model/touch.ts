import type { FencerId, Step } from './combination.ts';

/**
 * Who scores on this step, read from the target it marks: a hit marks the
 * place it lands on the other fencer. Shown as a light, red for A and green
 * for B, as on the scoring box (A stands on the left).
 */
export function touchOf(step: Step): FencerId | null {
  const hit = step.display?.targets?.[0];
  return hit ? (hit.fencer === 'A' ? 'B' : 'A') : null;
}
