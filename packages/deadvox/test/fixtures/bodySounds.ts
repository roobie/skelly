import { simSeconds } from '../../src/core/time.ts';
import type { BodyTuningDef } from '../../src/engine/content.ts';

export const bodySoundIds = (
  body: Pick<BodyTuningDef, 'sounds'> & { heartbeat: Pick<BodyTuningDef['heartbeat'], 'sounds'> },
): string[] => [
  ...Object.values(body.heartbeat.sounds),
  body.sounds.hurt.light,
  body.sounds.hurt.heavy,
  body.sounds.strain,
  body.sounds.landing,
  ...Object.values(body.sounds.block),
  ...Object.values(body.sounds.breath),
];

export const fixtureBodySounds = (body: BodyTuningDef) =>
  [...new Set(bodySoundIds(body))].map((id) => ({
    id,
    description: 'fixture body sound',
    variants: ['assets/audio/fixture-body.ogg'],
    gain: 1,
    pitchJitter: [1, 1],
    gainJitter: [1, 1],
    minIntervalSimSeconds: simSeconds(0),
    category: 'body',
    noise: { enabled: false, radiusMetres: 1 },
  }));
