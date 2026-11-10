import type { SiteLayoutDef } from '../../src/core/schema.ts';
import type { AttemptPolicyDef } from '../../src/engine/content.ts';
import { fixtureLootContext } from '../economyFixtures.ts';

export const makeAttemptPolicy = (overrides: Partial<AttemptPolicyDef> = {}): AttemptPolicyDef => ({
  resumeStored: false,
  persist: false,
  exportFormat: 'metrics',
  countPaused: false,
  countHidden: false,
  compressionThreshold: 3,
  persistIntervalRealMs: 20,
  persistOnInterruption: true,
  limits: { history: 3, pockets: 2, marks: 2 },
  ...overrides,
});

export const makeAttemptLayout = (overrides: Partial<SiteLayoutDef> = {}): SiteLayoutDef => ({
  id: 'fixture_recording_layout',
  lootContext: fixtureLootContext(),
  bounds: { x0: -1, z0: -1, x1: 1, z1: 1 },
  ground: 0,
  terrain: [],
  buildings: [],
  player: { position: [0, 1, 0], bearing: 0 },
  shamblers: [],
  woodlands: [],
  tracks: [],
  attemptPolicy: makeAttemptPolicy(),
  ...overrides,
});
