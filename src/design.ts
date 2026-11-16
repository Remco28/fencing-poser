// Every colour the 3D scene and the drawn overlays use, in one place.
// The same values for the page itself are the variables at the top of
// styles.css; when one changes, change its twin here. The decisions behind
// them are in docs/DECISIONS.md ("Look").

import type { FencerId } from './model/combination.ts';

/** Ink on paper: the page's text colour, and the one accent (ink blue). */
export const INK = '#26221d';
export const INK_SOFT = '#6f675c';
export const PAPER = '#fffdf9';
export const ACCENT = '#2748c9';

/** The scoring lights. Used for a touch and its target, and for nothing else. */
export const TOUCH_RED = '#d9382e';
export const TOUCH_GREEN = '#2b9a4c';

/** A warning that is not a touch (off balance). */
export const WARN = '#b4600f';

/** The desk in daylight, and the felt-topped board that is the piste. */
export const SCENE = {
  air: '#efe7d9',
  desk: '#f0e6d4',
  deskGrain: '#c4ab85',
  felt: '#5d7686',
  feltWarning: '#7b93a1',
  feltRunOff: '#4d6473',
  line: '#f6efe0',
  board: '#d9c29c',
  skyLight: '#fff8ec',
  groundLight: '#d8c6a8',
  sun: '#fff0d8',
  steel: '#767d86',
  steelHover: '#9aa1aa',
  grip: '#3a3a3a',
  point: '#222222',
  /** The pencil and notebook on the desk in the opening view. */
  things: {
    pencilWood: '#e3c69a',
    graphite: '#3a3835',
    ferrule: '#c9ccd1',
    eraser: '#d98c7c',
    cover: '#2c3f52',
    pages: '#f4eee2',
    band: '#1c2a38',
  },
};

export interface Wood {
  base: string;
  /** The darker lines of the grain. */
  streak: string;
  /** Joint balls, the neck and the back of the hand. */
  joint: string;
}

export type WoodName = 'maple' | 'walnut';

export const WOODS: Record<WoodName, Wood> = {
  maple: { base: '#e2bd8c', streak: '#b98a55', joint: '#bd8d5c' },
  walnut: { base: '#6a4530', streak: '#3d2416', joint: '#4a2f20' },
};

/** A is the light figure and B the dark one, everywhere they are drawn. */
export const WOOD_OF: Record<FencerId, WoodName> = { A: 'maple', B: 'walnut' };

/** The three movements of a joint, in the joint controls and on their paths. */
export const GUIDE_COLORS = ['#1c8a78', '#6a4fc4', '#b4600f'];

/** The type the page uses, for text drawn to a canvas. */
export const FONT_UI = "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_TITLE = "'Fraunces Variable', Fraunces, 'Iowan Old Style', 'Palatino Linotype', Georgia, serif";
