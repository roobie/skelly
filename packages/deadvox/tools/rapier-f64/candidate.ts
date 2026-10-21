import type { Candidate, Tier } from '../../src/vehicles/feasibility/contract.ts';
import type * as Rapier from '../../vendor/rapier-f64/rapier.js';

export function rapierCandidate(api: typeof Rapier, precision: string): Candidate {
  return {
    identity: { candidate: 'rapier-moving-body', precision, collision: 'none', hiddenWork: 'unmeasured' },
    create(fixture, tickHz) {
      let world = new api.World({ x: 0, y: 0, z: 0 });
      world.timestep = 1 / tickHz;
      const body = world.createRigidBody(
        api.RigidBodyDesc.dynamic()
          .setTranslation(fixture.positionMetres[0]!, fixture.positionMetres[1]!, fixture.positionMetres[2]!)
          .setLinvel(
            fixture.velocityMetresPerSimSecond[0]!,
            fixture.velocityMetresPerSimSecond[1]!,
            fixture.velocityMetresPerSimSecond[2]!,
          )
          .setCanSleep(false),
      );
      const { handle } = body;
      let tick = 0;
      let phase = 0;
      let { resource } = fixture;
      let eventId = 0;
      let tier: Tier = 'near';
      let drivingSteps = 0;
      const tiers: Tier[] = ['near', 'coarse', 'parked'];
      const snapshot = () => {
        const solver = world.takeSnapshot();
        const bytes = new Uint8Array(40 + solver.length);
        const view = new DataView(bytes.buffer);
        [tick, phase, resource, eventId, tiers.indexOf(tier)].forEach((value, index) => {
          view.setFloat64(index * 8, value, true);
        });
        bytes.set(solver, 40);
        return bytes;
      };
      return {
        advance(input) {
          tick += 1;
          if (tier !== 'parked') {
            world.step();
            drivingSteps += 1;
            phase = (phase + 1) % fixture.phasePeriodTicks;
            if (input.drive === true && resource > 0) {
              resource -= 1;
            }
          }
          if (tick % fixture.eventPeriodTicks === 0) {
            eventId += 1;
          }
        },
        transition(value) {
          tier = value;
        },
        snapshot,
        restore(bytes) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          tick = view.getFloat64(0, true);
          phase = view.getFloat64(8, true);
          resource = view.getFloat64(16, true);
          eventId = view.getFloat64(24, true);
          tier = tiers[view.getFloat64(32, true)]!;
          const restored = api.World.restoreSnapshot(bytes.slice(40));
          world.free();
          world = restored;
        },
        observe() {
          const current = world.getRigidBody(handle);
          const { x, y, z } = current.translation();
          const { x: vx, y: vy, z: vz } = current.linvel();
          const continuation = snapshot();
          return {
            tick,
            state: { x, y, z, vx, vy, vz, phase, resource, eventId, tier, owner: fixture.id },
            events:
              tick > 0 && tick % fixture.eventPeriodTicks === 0
                ? [{ id: eventId, tick, kind: 'probe-pulse', owner: fixture.id }]
                : [],
            minimumGroundClearance: y - fixture.halfHeightMetres - fixture.groundHeightMetres,
            continuation,
            // Only wrapper-visible operations are counted; this is not a solver work-bound proof.
            work: {
              drivingSteps,
              terrainCells: 0,
              colliders: 0,
              broadphasePairs: 0,
              narrowphaseTests: 0,
              ccdIterations: 0,
              contacts: 0,
              substeps: tier === 'parked' ? 0 : 1,
              allocations: 0,
              savedBytes: continuation.length,
            },
          };
        },
        dispose() {
          world.free();
        },
      };
    },
  };
}
