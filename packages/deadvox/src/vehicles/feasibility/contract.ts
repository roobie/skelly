export type Tier = 'near' | 'coarse' | 'parked';
export type Fields = Record<string, number | string | boolean>;

export interface Fixture {
  id: string;
  positionMetres: number[];
  velocityMetresPerSecond: number[];
  groundHeightMetres: number;
  halfHeightMetres: number;
  resource: number;
  phasePeriodTicks: number;
  eventPeriodTicks: number;
}

export interface Work {
  drivingSteps: number;
  terrainCells: number;
  colliders: number;
  broadphasePairs: number;
  narrowphaseTests: number;
  ccdIterations: number;
  contacts: number;
  substeps: number;
  allocations: number;
  savedBytes: number;
}

export interface Observation {
  tick: number;
  state: Fields;
  events: Fields[];
  minimumGroundClearance: number;
  continuation: Uint8Array;
  work: Work;
}

export interface Adapter {
  advance: (input: Fields) => void;
  transition: (tier: Tier) => void;
  snapshot: () => Uint8Array;
  restore: (snapshot: Uint8Array) => void;
  observe: () => Observation;
  dispose: () => void;
}

export interface Candidate {
  identity: Fields;
  create: (fixture: Fixture, tickHz: number) => Adapter;
}
