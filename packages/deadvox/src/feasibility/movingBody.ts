import type { Adapter, Candidate, Fields, Fixture, Tier, Work } from './contract.ts';

const tiers: Tier[] = ['near', 'coarse', 'parked'];

class MovingBody implements Adapter {
  private values: number[];
  private tier: Tier = 'near';
  private disposed = false;
  private drivingSteps = 0;

  private readonly fixture: Fixture;
  private readonly tickHz: number;

  constructor(fixture: Fixture, tickHz: number) {
    this.fixture = fixture;
    this.tickHz = tickHz;
    this.values = [...fixture.positionMetres, ...fixture.velocityMetresPerSimSecond, 0, 0, fixture.resource, 0];
    if (this.values.length !== 10 || !this.values.every(Number.isFinite) || !(tickHz > 0)) {
      throw new Error('Invalid moving-body fixture');
    }
  }

  private live() {
    if (this.disposed) {
      throw new Error('Disposed adapter');
    }
  }

  advance(input: Fields): void {
    this.live();
    const v = this.values;
    v[6] = v[6]! + 1;
    if (this.tier !== 'parked') {
      for (let axis = 0; axis < 3; axis++) {
        v[axis] = v[axis]! + v[axis + 3]! / this.tickHz;
      }
      this.drivingSteps += 1;
      v[7] = (v[7]! + 1) % this.fixture.phasePeriodTicks;
      if (input.drive === true && v[8]! > 0) {
        v[8] = v[8]! - 1;
      }
    }
    if (v[6]! % this.fixture.eventPeriodTicks === 0) {
      v[9] = v[9]! + 1;
    }
  }

  transition(tier: Tier): void {
    this.live();
    this.tier = tier;
  }

  snapshot(): Uint8Array {
    this.live();
    const bytes = new Uint8Array((this.values.length + 1) * 8);
    const view = new DataView(bytes.buffer);
    this.values.forEach((value, index) => {
      view.setFloat64(index * 8, value, true);
    });
    view.setFloat64(this.values.length * 8, tiers.indexOf(this.tier), true);
    return bytes;
  }

  restore(bytes: Uint8Array): void {
    this.live();
    if (bytes.length !== (this.values.length + 1) * 8) {
      throw new Error('Invalid snapshot length');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values = this.values.map((_, index) => view.getFloat64(index * 8, true));
    const tier = tiers[view.getFloat64(values.length * 8, true)];
    if (!(values.every(Number.isFinite) && tier)) {
      throw new Error('Invalid snapshot values');
    }
    this.values = values;
    this.tier = tier;
  }

  observe() {
    this.live();
    const [x, y, z, vx, vy, vz, tick, phase, resource, eventId] = this.values as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const continuation = this.snapshot();
    const work: Work = {
      drivingSteps: this.drivingSteps,
      terrainCells: 0,
      colliders: 0,
      broadphasePairs: 0,
      narrowphaseTests: 0,
      ccdIterations: 0,
      contacts: 0,
      substeps: this.tier === 'parked' ? 0 : 1,
      allocations: 0,
      savedBytes: continuation.byteLength,
    };
    return {
      tick,
      state: { x, y, z, vx, vy, vz, phase, resource, eventId, tier: this.tier, owner: this.fixture.id },
      events:
        tick > 0 && tick % this.fixture.eventPeriodTicks === 0
          ? [{ id: eventId, tick, kind: 'probe-pulse', owner: this.fixture.id }]
          : [],
      minimumGroundClearance: y - this.fixture.halfHeightMetres - this.fixture.groundHeightMetres,
      continuation,
      work,
    };
  }

  dispose(): void {
    this.disposed = true;
  }
}

export const movingBody: Candidate = {
  identity: { candidate: 'harness-moving-body', precision: 'f64', collision: 'none' },
  create: (fixture, tickHz) => new MovingBody(fixture, tickHz),
};
