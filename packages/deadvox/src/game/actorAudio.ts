import type { SenseDef } from '@skelly/engine/content';

export type ActorVoiceTuning = SenseDef['actorVoice'];

/** A built body's standing height in metres (`packages/engine/src/core/schema/actors.ts`, `ActorBodySchema`). */
interface SizedBody {
  readonly height: number;
}

const bodyHeight = ({ height }: SizedBody): number => {
  if (!(height > 0 && Number.isFinite(height))) {
    throw new Error('Cannot size the voice of a body with invalid height');
  }
  return height;
};

const debugVoicePitch = (search: string, param: 'voicePitch' | 'voicePitchLarge'): number => {
  const params = new URLSearchParams(search);
  if (params.get('debug') !== '1' || params.get('site') !== 'voice_size') {
    return 1;
  }
  const factor = Number(params.get(param));
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

/**
 * The humanoid voice-pitch law, calibrated on the plain humanoid bodies the session loaded:
 * a falling power law between its smallest and tallest bodies, clamped around the smallest body's old-law pitch.
 * The smallest body is pitched at its anchor multiple of the old law and the tallest keeps its old-law pitch.
 */
export const actorVoiceLaw = (pool: readonly SizedBody[], tuning: ActorVoiceTuning) => {
  if (pool.length === 0) {
    throw new Error('The humanoid voice law needs at least one humanoid body');
  }
  const oldLawPitch = (height: number): number => Math.sqrt(tuning.oldLawReferenceHeightMetres / height);
  const poolHeights = pool.map(bodyHeight);
  const smallestHeight = Math.min(...poolHeights);
  const tallestHeight = Math.max(...poolHeights);
  const smallestOldLawPitch = oldLawPitch(smallestHeight);
  const pitchClamp = [
    tuning.clampMultiplier.min * smallestOldLawPitch,
    tuning.clampMultiplier.max * smallestOldLawPitch,
  ] as const;
  const defaultSmallestAnchor = tuning.smallestAnchorMultiplier * smallestOldLawPitch;
  const defaultTallestAnchor = oldLawPitch(tallestHeight);
  const clampPitch = (pitch: number): number => Math.max(pitchClamp[0], Math.min(pitchClamp[1], pitch));

  const bodyPitch = (body: SizedBody, search = ''): number => {
    const height = bodyHeight(body);
    const smallestAnchor = clampPitch(defaultSmallestAnchor * debugVoicePitch(search, 'voicePitch'));
    const tallestAnchor = Math.min(
      smallestAnchor,
      clampPitch(defaultTallestAnchor * debugVoicePitch(search, 'voicePitchLarge')),
    );
    if (tallestHeight === smallestHeight) {
      // An equal-height pool has no range to fall across, so every body takes the pitch a narrowing range
      // gives its midpoint: the anchors' geometric mean, which keeps the law continuous as heights converge.
      return Math.sqrt(smallestAnchor * tallestAnchor);
    }
    const exponent = Math.log(tallestAnchor / smallestAnchor) / Math.log(tallestHeight / smallestHeight);
    return clampPitch(smallestAnchor * (height / smallestHeight) ** exponent);
  };
  return { pitchClamp, bodyPitch };
};
