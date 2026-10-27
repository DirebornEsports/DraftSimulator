// Captain's Mode configuration (current as of patch 7.41f).
// Patch 7.40 changed the first and third ban phases; 7.41-7.41f changed nothing in the draft.
// Source: dota2.com/patches/7.40 (Captains Mode section).
// Team 1 = first-pick team, Team 2 = second-pick team.

export const STEPS = [
  // Ban phase 1: F F S S F S S
  ['ban', 1], ['ban', 1], ['ban', 2], ['ban', 2], ['ban', 1], ['ban', 2], ['ban', 2],
  // Pick phase 1: F S
  ['pick', 1], ['pick', 2],
  // Ban phase 2: F F S
  ['ban', 1], ['ban', 1], ['ban', 2],
  // Pick phase 2: S F F S S F
  ['pick', 2], ['pick', 1], ['pick', 1], ['pick', 2], ['pick', 2], ['pick', 1],
  // Ban phase 3: F S F S
  ['ban', 1], ['ban', 2], ['ban', 1], ['ban', 2],
  // Pick phase 3: F S
  ['pick', 1], ['pick', 2],
].map(([type, team], i) => ({ i, type, team }));

export const PHASES = [
  { from: 0, to: 6, name: 'Ban phase 1' },
  { from: 7, to: 8, name: 'Pick phase 1' },
  { from: 9, to: 11, name: 'Ban phase 2' },
  { from: 12, to: 17, name: 'Pick phase 2' },
  { from: 18, to: 21, name: 'Ban phase 3' },
  { from: 22, to: 23, name: 'Pick phase 3' },
];

// Timer defaults (seconds). Keep in sync with the current patch.
export const TIMER = {
  firstBanPhase: 15,
  perStep: 30,
  reserve: 130,
};

export function phaseOf(step) {
  return PHASES.find((p) => step >= p.from && step <= p.to) || null;
}

export function stepTime(step) {
  return step <= 6 ? TIMER.firstBanPhase : TIMER.perStep;
}

// Which team number the user controls, given the session settings.
export function userTeamNumber(order) {
  return order === 'second' ? 2 : 1;
}

export const DEFAULT_SETTINGS = {
  mode: 'live',       // 'live' | 'blind'
  side: 'radiant',    // 'radiant' | 'dire'
  order: 'first',     // 'first' | 'second'
  level: 'hard',      // 'easy' | 'hard' | 'team'
  teamId: null,       // saved team used for 'team' level
};

export function loadSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem('dl.settings');
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s) {
  try { window.localStorage.setItem('dl.settings', JSON.stringify(s)); } catch {}
}
