import { describe, expect, it } from 'vitest';
import {
  AimController,
  type AimWobbleNoiseTuning,
  advanceBreathHold,
  type BreathCue,
  type BreathHoldState,
  INITIAL_BREATH_HOLD,
} from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { PlayerStance } from '../src/core/playerStance.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';
import { type MoveIntent, PLAYER, type StanceToggle } from './playerFixture.ts';

const registry = baseRegistry();
const firearmsTuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
const { breathHold } = firearmsTuning;
const { windedBelow } = registry.body.get('player')!.needs.stamina;
const DT = 1 / 60;

const aimWith = (sigmaRadiansPerSqrtSecond: number) => {
  const wobbleNoise: AimWobbleNoiseTuning = {
    reversionRatePerSimSecond: firearmsTuning.wobbleNoiseReversionRatePerSimSecond,
    sigmaRadiansPerSqrtSecond,
    smoothingSimSeconds: firearmsTuning.wobbleNoiseSmoothingSimSeconds,
  };
  return new AimController({
    tuning: PLAYER.aim,
    wobbleLimitRadians: firearmsTuning.wobbleLimitRadians,
    wobbleShape: {
      verticalToHorizontalRatio: firearmsTuning.wobbleVerticalToHorizontalRatio,
      archPower: firearmsTuning.wobbleLuneArchPower,
      phaseOffsetRadians: firearmsTuning.wobbleLunePhaseOffsetRadians,
    },
    wobbleSeed: 73,
    wobbleNoise,
    breathHold,
  });
};
const stillStep = (breath?: { wanted: boolean; stamina: number }) => ({
  dt: DT,
  velocity: [0, 0, 0] as Vec3,
  blockSize: 0.5,
  yaw: 0,
  pitch: 0,
  variance: 1,
  firing: false,
  recoilRecoveryRate: 1,
  stridePhase: 0,
  ...(breath ? { breath: { ...breath, windedBelow, steadying: 0.5 } } : {}),
});
const magnitude = ({ yaw, pitch }: { yaw: number; pitch: number }): number => Math.hypot(yaw, pitch);

describe('holding breath (`DESIGN.md`, "Holding breath")', () => {
  it('damps the drift of a held aim and leaves recoil to its owner', () => {
    const free = aimWith(firearmsTuning.wobbleNoiseSigmaRadiansPerSqrtSecond);
    const held = aimWith(firearmsTuning.wobbleNoiseSigmaRadiansPerSqrtSecond);
    for (let tick = 0; tick < 60; tick++) {
      const freeFrame = free.advance(stillStep());
      const heldFrame = held.advance(stillStep({ wanted: true, stamina: 100 }));
      expect(held.breathHeld).toBe(true);
      expect(magnitude(freeFrame)).toBeGreaterThan(0);
      expect(magnitude(heldFrame)).toBeLessThan(magnitude(freeFrame));
    }

    const quietFree = aimWith(0);
    const quietHeld = aimWith(0);
    quietFree.advance(stillStep());
    quietHeld.advance(stillStep({ wanted: true, stamina: 100 }));
    quietFree.recordShot(5, 0.02);
    quietHeld.recordShot(5, 0.02);
    expect(quietHeld.frame).toEqual(quietFree.frame);
  });

  it('refuses to start a hold while winded', () => {
    const step = advanceBreathHold(
      INITIAL_BREATH_HOLD,
      DT,
      { wanted: true, stamina: windedBelow - 1, windedBelow },
      breathHold.recoverySimSeconds,
    );
    expect(step.state.held).toBe(false);
    expect(step.cue).toBeUndefined();
  });

  it('gives out at the winded line, then refuses a new hold until recovery ends, with worse drift meanwhile', () => {
    const aim = aimWith(firearmsTuning.wobbleNoiseSigmaRadiansPerSqrtSecond);
    const free = aimWith(firearmsTuning.wobbleNoiseSigmaRadiansPerSqrtSecond);
    const cues: BreathCue[] = [];
    const step = (stamina: number): void => {
      free.advance(stillStep());
      aim.advance(stillStep({ wanted: true, stamina }));
      if (aim.breathCue) {
        cues.push(aim.breathCue);
      }
    };
    step(windedBelow + 1);
    expect(aim.breathHeld).toBe(true);
    step(windedBelow);
    expect(aim.breathHeld).toBe(false);
    expect(cues).toEqual(['inhale', 'gasp']);

    // Breath is back above the line and the key is still held, but recovery refuses the hold.
    let refusedSimSeconds = 0;
    step(100);
    while (!aim.breathHeld && refusedSimSeconds < breathHold.recoverySimSeconds + 1) {
      expect(magnitude(aim.frame)).toBeGreaterThan(magnitude(free.frame));
      refusedSimSeconds += DT;
      step(100);
    }
    expect(aim.breathHeld).toBe(true);
    expect(refusedSimSeconds).toBeGreaterThanOrEqual(breathHold.recoverySimSeconds - DT);
    expect(refusedSimSeconds).toBeLessThanOrEqual(breathHold.recoverySimSeconds + DT);
    expect(cues).toEqual(['inhale', 'gasp', 'inhale']);
  });

  it('lets go with an exhale when the key is released', () => {
    let state: BreathHoldState = INITIAL_BREATH_HOLD;
    const cues: (BreathCue | undefined)[] = [];
    for (const wanted of [true, true, false]) {
      const { state: next, cue } = advanceBreathHold(
        state,
        DT,
        { wanted, stamina: 100, windedBelow },
        breathHold.recoverySimSeconds,
      );
      state = next;
      cues.push(cue);
    }
    expect(cues).toEqual(['inhale', undefined, 'exhale']);
    expect(state).toEqual(INITIAL_BREATH_HOLD);
  });
});

const makeRuntime = (restore?: Readonly<SaveSnapshot>) => {
  let intent: MoveIntent = { ...IDLE };
  let aimingDownSights = true;
  let stanceToggle: StanceToggle | undefined;
  const played: Readonly<SoundEmission>[] = [];
  const session = createSession({
    registry,
    ...(restore ? { restore } : {}),
    world: new World(),
    isSolid: (_x, y) => y === 0,
    isOpaque: (_x, y) => y === 0,
    scale: makeScale(0.5),
    seed: 73,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      consumeStanceToggle: () => {
        const pressed = stanceToggle;
        stanceToggle = undefined;
        return pressed;
      },
      readyHeld: () => true,
      aimingDownSights: () => aimingDownSights,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: (sound) => played.push(sound) },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const noises = session.sim.events.reader();
  return {
    session,
    played,
    noises,
    advance: (frames: number) => {
      for (let i = 0; i < frames; i++) {
        session.frame(DT);
      }
    },
    setStance: (stance: Exclude<PlayerStance, 'standing'>) => {
      stanceToggle = stance === 'crouching' ? 'crouch' : 'prone';
    },
    setIntent: (next: Partial<MoveIntent>) => {
      intent = { ...IDLE, ...next };
    },
    setAimingDownSights: (value: boolean) => {
      aimingDownSights = value;
    },
  };
};

/** A runtime standing still with a rifle raised, sights up and the sprint key not yet held. */
const readiedRuntime = () => {
  const runtime = makeRuntime();
  const rifle = runtime.session.inventory.create('rifle_assault');
  if (!runtime.session.inventory.add(rifle, { kind: 'hand', side: 'right' })) {
    throw new Error('Could not hold the rifle');
  }
  runtime.advance(120);
  if (!(runtime.session.firearms.isReady(rifle.uid) && runtime.session.body.onGround)) {
    throw new Error('The rifle is not raised on the ground');
  }
  return runtime;
};
const breathSounds = (played: readonly Readonly<SoundEmission>[]) =>
  played.filter(({ event }) => event.startsWith('breath_'));
const snapshotOf = (session: ReturnType<typeof makeRuntime>['session']) =>
  session.snapshot({ worldId: 'world-73', characterId: 'character-1' });

describe('holding breath in play', () => {
  it('steadies drift more when crouched and most when prone', () => {
    const runtimes = (['standing', 'crouching', 'prone'] as const).map((stance) => {
      const runtime = readiedRuntime();
      if (stance !== 'standing') {
        runtime.setStance(stance);
      }
      runtime.advance(1);
      expect(runtime.session.stance).toBe(stance);
      return runtime;
    });
    for (let tick = 0; tick < 30; tick++) {
      for (const runtime of runtimes) {
        runtime.advance(1);
      }
      const amplitudes = runtimes.map(({ session }) => magnitude(session.aim.frame));
      expect(amplitudes[0]).toBeGreaterThan(amplitudes[1]!);
      expect(amplitudes[1]).toBeGreaterThan(amplitudes[2]!);
      expect(amplitudes[2]).toBeGreaterThan(0);
    }
  });

  it('starts holding breath and steadies drift while prone', () => {
    const free = readiedRuntime();
    const held = readiedRuntime();
    for (const runtime of [free, held]) {
      runtime.setStance('prone');
    }
    held.setIntent({ sprint: true });
    for (let tick = 0; tick < 30; tick++) {
      free.advance(1);
      held.advance(1);
      expect(held.session.stance).toBe('prone');
      expect(held.session.aim.breathHeld).toBe(true);
      expect(magnitude(free.session.aim.frame)).toBeGreaterThan(0);
      expect(magnitude(held.session.aim.frame)).toBeLessThan(magnitude(free.session.aim.frame));
      expect(held.session.sprinting).toBe(false);
    }
  });

  it('holds with the sprint key in ADS and spends stamina, but not while moving or outside ADS', () => {
    const runtime = readiedRuntime();
    const { session } = runtime;
    runtime.setIntent({ sprint: true });
    runtime.advance(1);
    expect(session.aim.breathHeld).toBe(true);
    const before = session.sim.needs.stamina;
    runtime.advance(30);
    expect(session.sim.needs.stamina).toBeLessThan(before);
    expect(session.sprinting).toBe(false);

    runtime.setIntent({ sprint: true, forward: 1 });
    runtime.advance(1);
    expect(session.aim.breathHeld).toBe(false);
    runtime.advance(30);
    expect(session.aim.breathHeld).toBe(false);

    runtime.setIntent({ sprint: true });
    runtime.setAimingDownSights(false);
    runtime.advance(30);
    expect(session.aim.breathHeld).toBe(false);
  });

  it('gives out at the winded line with a gasp that no shambler can hear', () => {
    const runtime = readiedRuntime();
    const { session } = runtime;
    runtime.noises.read();
    runtime.setIntent({ sprint: true });
    let ticks = 0;
    runtime.advance(1);
    let staminaAtGiveOut = session.sim.needs.stamina;
    while (session.aim.breathHeld && ticks < 60 * 60) {
      staminaAtGiveOut = session.sim.needs.stamina;
      runtime.advance(1);
      ticks += 1;
    }
    expect(session.aim.breathHeld).toBe(false);
    expect(staminaAtGiveOut).toBeLessThanOrEqual(windedBelow);
    expect(staminaAtGiveOut).toBeGreaterThan(windedBelow - breathHold.staminaPerSimSecond * DT - 1e-9);
    const sounds = breathSounds(runtime.played);
    expect(sounds.map(({ event }) => event)).toEqual(['breath_inhale', 'breath_gasp']);
    expect(sounds.every(({ emittedAsNoise }) => !emittedAsNoise)).toBe(true);
    expect(runtime.noises.read().filter((event) => event.kind === 'noise')).toEqual([]);
  });

  it('keeps a held breath and a recovery across save and restore', () => {
    const holding = readiedRuntime();
    holding.setStance('prone');
    holding.setIntent({ sprint: true });
    holding.advance(10);
    expect(holding.session.aim.breathHeld).toBe(true);
    const heldSave = snapshotOf(holding.session);
    const restoredHold = makeRuntime(heldSave);
    expect(restoredHold.session.aim.breathHeld).toBe(true);
    expect(restoredHold.session.stance).toBe('prone');
    restoredHold.setIntent({ sprint: true });
    restoredHold.advance(1);
    expect(restoredHold.session.aim.breathHeld).toBe(true);
    expect(breathSounds(restoredHold.played)).toEqual([]);

    while (holding.session.aim.breathHeld) {
      holding.advance(1);
    }
    const recoverySave = snapshotOf(holding.session);
    expect(recoverySave.character.aim.breath.recoveryRemainingSimSeconds).toBeGreaterThan(0);
    const restoredRecovery = makeRuntime(recoverySave);
    restoredRecovery.setIntent({ sprint: true });
    restoredRecovery.advance(1);
    expect(restoredRecovery.session.aim.breathHeld).toBe(false);
    expect(snapshotOf(restoredRecovery.session).character.aim.breath.recoveryRemainingSimSeconds).toBeGreaterThan(0);
  });
});
