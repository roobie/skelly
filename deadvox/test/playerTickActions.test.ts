import { describe, expect, it } from 'vitest';
import { traceItemLanding } from '../src/core/itemThrow.ts';
import { PlayerTickActions } from '../src/game/playerTickActions.ts';

const landingFor = (x: number) =>
  traceItemLanding({
    from: [x, 1.5, 0.5],
    direction: [1, 0, 0],
    distanceMetres: 0.02,
    blockSize: 1,
    minY: -5,
    isSolid: (_x, y) => y === 0,
  });

describe('PlayerTickActions', () => {
  it('resolves a released throw from the next player sample pose', () => {
    const actions = new PlayerTickActions();
    let sampledBodyX = 0.96;
    let liveLanding: ReturnType<typeof landingFor> | undefined;

    actions.enqueue(() => {
      liveLanding = landingFor(sampledBodyX);
    });
    expect(liveLanding).toBeUndefined();

    sampledBodyX = 1.02;
    const replayLanding = landingFor(sampledBodyX);
    actions.applyAtNextTick();

    expect(landingFor(0.96)).not.toEqual(replayLanding);
    expect(liveLanding).toEqual(replayLanding);
  });
});
