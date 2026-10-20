// Read-only debug presentation: physical-unit formatting and approximate byte counts.
import type { Object3D } from 'three';
import { formatClock } from '../core/clock.ts';
import type { Vec3 } from '../core/coords.ts';
import type { DebugReadout } from '../game/debugInterface.ts';

type Measurements = Omit<DebugReadout, 'movement' | 'position' | 'clock' | 'memoryBytes' | 'revealedZombies'>;

export interface PlayReadoutSource {
  readonly measurements: Measurements;
  readonly walking: boolean;
  readonly positionBlocks: Readonly<Vec3>;
  readonly blockSize: number;
  readonly calendar: number;
  readonly chunks: Iterable<{ readonly bytes: number }>;
  readonly drawn: readonly Object3D[];
  readonly revealedPositions: Iterable<Readonly<Vec3>>;
}

export const playReadout = (source: PlayReadoutSource): DebugReadout => {
  const { measurements, walking, positionBlocks, blockSize: s, calendar, chunks, drawn, revealedPositions } = source;
  let memoryBytes = 0;
  for (const chunk of chunks) {
    memoryBytes += chunk.bytes;
  }
  for (const child of drawn) {
    const mesh = child as unknown as {
      geometry?: { attributes?: Record<string, { array?: { byteLength: number } }> };
    };
    for (const attribute of Object.values(mesh.geometry?.attributes ?? {})) {
      memoryBytes += attribute.array?.byteLength ?? 0;
    }
  }
  return {
    ...measurements,
    movement: walking ? 'walking' : 'jogging',
    position: [positionBlocks[0] * s, positionBlocks[1] * s, positionBlocks[2] * s],
    clock: formatClock(calendar),
    memoryBytes,
    revealedZombies: Array.from(revealedPositions, (pos) => pos.map((v) => (v * s).toFixed(1)).join(',')).slice(0, 40),
  };
};
