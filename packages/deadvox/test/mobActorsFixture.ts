import { type MobActorMeshesOptions, MobActorMeshes as RenderMobActorMeshes } from '../src/render/mobActors.ts';
import { LOOK_FIXTURE } from './lookFixture.ts';

export const CORPSE_LIFECYCLE = {
  lieSimSeconds: LOOK_FIXTURE.mobActors.corpseLieSimSeconds,
  sinkSimSeconds: LOOK_FIXTURE.mobActors.corpseSinkSimSeconds,
  sinkDepthMetres: LOOK_FIXTURE.mobActors.corpseSinkDepthMetres,
  maxCorpses: 7,
};
export const HEARING_GAZE_JITTER = {
  yawDeg: LOOK_FIXTURE.mobActors.hearingGazeJitter.yawDegrees,
  pitchDeg: LOOK_FIXTURE.mobActors.hearingGazeJitter.pitchDegrees,
};

export class MobActorMeshes extends RenderMobActorMeshes {
  constructor(
    blockSize: number,
    capacity: number | undefined,
    options: Omit<MobActorMeshesOptions, 'look' | 'maxCorpses'>,
  ) {
    super(blockSize, capacity, {
      ...options,
      look: LOOK_FIXTURE.mobActors,
      maxCorpses: CORPSE_LIFECYCLE.maxCorpses,
    });
  }
}
