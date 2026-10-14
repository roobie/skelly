import type { Vec3 } from './coords.ts';
import {
  DISCOVERY_EVENTS,
  type DiscoveryEvent,
  emptyDiscovery,
  type ScenarioDiscoveryState,
} from './scenarioDiscovery.ts';
import { freezeSnapshot } from './snapshotData.ts';

export interface ScenarioRunState {
  scenario: string;
  startedAtGameTimestamp: number;
  completedAtGameTimestamp: number | null;
  activeRealSeconds: number;
  distanceMetres: number;
  firstFurnitureReadAtGameTimestamp: number | null;
  firstLadderUseAtGameTimestamp: number | null;
  discovery: ScenarioDiscoveryState;
}

const discoveryTimestamps = (state: ScenarioDiscoveryState): (number | null)[] => {
  if (!state || DISCOVERY_EVENTS.some((event) => !(event in state))) {
    throw new Error('Invalid scenario discovery');
  }
  return DISCOVERY_EVENTS.map((event) => state[event]);
};

export const assertScenarioRun = (
  state: ScenarioRunState | null,
  { calendar, dead, scenario }: { calendar: number; dead: boolean; scenario?: string },
): void => {
  if (state === null) {
    if (scenario !== undefined) {
      throw new Error('Missing scenario run');
    }
    return;
  }
  if (
    !state ||
    typeof state.scenario !== 'string' ||
    !state.scenario ||
    (scenario !== undefined && scenario !== state.scenario) ||
    !Number.isFinite(state.startedAtGameTimestamp) ||
    state.startedAtGameTimestamp > calendar ||
    !Number.isFinite(state.activeRealSeconds) ||
    state.activeRealSeconds < 0 ||
    !Number.isFinite(state.distanceMetres) ||
    state.distanceMetres < 0
  ) {
    throw new Error('Invalid scenario run');
  }
  for (const timestamp of [
    ...discoveryTimestamps(state.discovery),
    state.completedAtGameTimestamp,
    state.firstFurnitureReadAtGameTimestamp,
    state.firstLadderUseAtGameTimestamp,
  ]) {
    if (
      timestamp !== null &&
      (!Number.isFinite(timestamp) ||
        timestamp < state.startedAtGameTimestamp ||
        timestamp > calendar ||
        (state.completedAtGameTimestamp !== null && timestamp > state.completedAtGameTimestamp))
    ) {
      throw new Error('Invalid scenario run timestamp');
    }
  }
  if (dead && state.completedAtGameTimestamp !== null) {
    throw new Error('Dead attempt cannot be won');
  }
};

export class ScenarioRun {
  private readonly state: ScenarioRunState;
  constructor(scenario: string, calendar: number, restored?: ScenarioRunState) {
    this.state = restored
      ? structuredClone(restored)
      : {
          scenario,
          startedAtGameTimestamp: calendar,
          completedAtGameTimestamp: null,
          activeRealSeconds: 0,
          distanceMetres: 0,
          firstFurnitureReadAtGameTimestamp: null,
          firstLadderUseAtGameTimestamp: null,
          discovery: emptyDiscovery(),
        };
  }
  get won(): boolean {
    return this.state.completedAtGameTimestamp !== null;
  }
  complete(calendar: number): void {
    if (!this.won) {
      this.state.completedAtGameTimestamp = calendar;
    }
  }
  observeFrame(seconds: number, active: boolean): void {
    if (!this.won && active && Number.isFinite(seconds) && seconds > 0) {
      this.state.activeRealSeconds += seconds;
    }
  }
  moved(before: Vec3, after: Vec3, blockSize: number): void {
    if (!this.won) {
      this.state.distanceMetres += Math.hypot(...after.map((value, axis) => value - before[axis]!)) * blockSize;
    }
  }
  read(calendar: number): void {
    if (!this.won) {
      this.state.firstFurnitureReadAtGameTimestamp ??= calendar;
    }
  }
  entered(calendar: number): void {
    if (!this.won) {
      this.state.firstLadderUseAtGameTimestamp ??= calendar;
    }
  }
  discover(event: DiscoveryEvent, calendar: number): void {
    if (!this.won) {
      this.state.discovery[event] ??= calendar;
    }
  }
  snapshot(): Readonly<ScenarioRunState> {
    return freezeSnapshot(structuredClone(this.state));
  }
}
