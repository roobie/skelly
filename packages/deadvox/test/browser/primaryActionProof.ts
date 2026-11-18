// The primary-action stages' page proof: play state under the names the stages read, the fixture moves they
// make, and the observations play's own owners record for them. See `primary-action-observation.mjs`,
// `installPrimaryActionProof`.
import type { FurnitureDef } from '@skelly/engine/content';
import { InputReplayRecorder } from '@skelly/engine/input';
import { movableRefusal } from '@skelly/engine/internal/core/furnitureMove.ts';
import { throwDistanceForItem } from '@skelly/engine/internal/core/itemThrow.ts';
import { dropTarget } from '@skelly/engine/internal/core/options.ts';
import { ignitionTargetForHand, selectPrimaryAction } from '@skelly/engine/internal/game/primaryAction.ts';
import { QuickbarActions } from '@skelly/engine/internal/game/quickbarActions.ts';
import { type HandSide, Inventory, type Item } from '@skelly/engine/inventory';
import { nextTimeOfDay } from '@skelly/engine/sim';
import { contentLookup } from '@skelly/presentation/ui';
import type { PlayTestHandle } from './playTestHandle.ts';

type Session = PlayTestHandle['session'];
type MeleeSwingStart = Parameters<Session['playerCombat']['beginMeleeSwing']>[0];

interface QuickbarTapObservation {
  readonly itemMoveQueued: boolean;
  readonly location: string | null;
}

/** What the stages arm, set and read back between their steps. */
interface ProofState {
  /** Armed, the next live throw commit is followed in its own turn by a throwing-stance drop. */
  dropAfterNextThrowCommit: boolean;
  /** Armed with a slot, the next live throw commit is followed in its own turn by that slot's quickbar tap. */
  quickbarTapAfterNextThrowCommit: number | undefined;
  quickbarTapItemUid: Session['quickbar']['slots'][number] | undefined;
  quickbarTapCommitObservation: QuickbarTapObservation | undefined;
  quickbarTapTickObservation: QuickbarTapObservation | undefined;
  readonly adsToggleObservations: { before: boolean; after: boolean; replaying: boolean; locked: boolean }[];
  readonly throwSpawnObservations: Record<
    Item['uid'],
    { readonly active: boolean; readonly names: string[]; readonly durationSimSeconds: number }
  >;
  dominant: HandSide;
  off: HandSide;
  frames: number;
  swings: {
    result: ReturnType<Session['playerCombat']['beginMeleeSwing']>;
    profile: MeleeSwingStart['profile'];
    hand: MeleeSwingStart['hand'];
  }[];
  attachments: { gap: number; angle: number; torsoYaw: number; movedOff: boolean }[];
  trackAttachment: boolean;
}

const initialState = (): ProofState => ({
  dropAfterNextThrowCommit: false,
  quickbarTapAfterNextThrowCommit: undefined,
  quickbarTapItemUid: undefined,
  quickbarTapCommitObservation: undefined,
  quickbarTapTickObservation: undefined,
  adsToggleObservations: [],
  throwSpawnObservations: {},
  dominant: 'left',
  off: 'right',
  frames: 0,
  swings: [],
  attachments: [],
  trackAttachment: false,
});

/** The fixture moves the stages make through Inventory, without the handling queue. */
const fixtureMoves = ({ session, engine }: PlayTestHandle) => {
  const { inventory, feet } = session;
  const clearHand = (side: HandSide): void => {
    const item = inventory.hands[side];
    if (item) {
      const result = inventory.move(item, dropTarget(inventory, item, feet()).target);
      if (!result.ok) {
        throw new Error(`Could not drop fixture hand: ${result.reason}`);
      }
    }
  };
  const setHand = (side: HandSide, item: Item): void => {
    if (inventory.hands[side] === item) {
      return;
    }
    clearHand(side);
    const placed = inventory.locate(item)
      ? inventory.move(item, { kind: 'hand', side }).ok
      : Boolean(inventory.add(item, { kind: 'hand', side }));
    if (!placed) {
      throw new Error('Could not place fixture hand');
    }
  };
  const placePocketed = (item: Item): void => {
    const definitions = engine.registry.items;
    const { size } = definitions.get(item.type)!;
    const fits = (grid: readonly [number, number] | undefined) =>
      grid !== undefined && ((grid[0] >= size[0] && grid[1] >= size[1]) || (grid[0] >= size[1] && grid[1] >= size[0]));
    for (const { item: container, location } of inventory.items()) {
      if (location.kind !== 'worn' || !container.pockets) {
        continue;
      }
      const pockets = definitions.get(container.type)?.container?.pockets ?? [];
      for (const [pocket, { grid }] of pockets.entries()) {
        if (fits(grid) && inventory.add(item, { kind: 'pocket', owner: container, pocket })) {
          return;
        }
      }
    }
    throw new Error(`No worn pocket fits ${item.type}`);
  };
  return { clearHand, setHand, placePocketed };
};

/**
 * Calls `onCommit` right after a live stance throw queues its tick commit, in that same turn, for each recorder
 * handed to `watch`. The router records each live command right before it queues that command's commit, so the
 * last action the recorder took names the commit being queued, and another commit queued meanwhile, such as a
 * worn-light toggle's, is told apart.
 */
const throwCommits = ({ pendingPlayerTickActions: ticks }: PlayTestHandle, onCommit: () => void) => {
  let lastRecordedAction: string | undefined;
  const enqueue = ticks.enqueue.bind(ticks);
  ticks.enqueue = (action) => {
    enqueue(action);
    const throwCommit = lastRecordedAction === 'item.throw';
    lastRecordedAction = undefined;
    if (throwCommit) {
      onCommit();
    }
  };
  return {
    watch: (recorder: InputReplayRecorder): void => {
      const queueAction = recorder.queueAction.bind(recorder);
      recorder.queueAction = (action, ...rest) => {
        lastRecordedAction = action;
        queueAction(action, ...rest);
      };
    },
  };
};

const quickbarTapObservation = ({ session }: PlayTestHandle, state: ProofState): QuickbarTapObservation => {
  const { inventory, queue } = session;
  const uid = state.quickbarTapItemUid;
  const tappedItem = typeof uid === 'number' ? inventory.itemByUid(uid) : undefined;
  return {
    itemMoveQueued: queue.jobs.some((job) => job.kind === 'move' && job.itemUid === uid),
    location: tappedItem ? (inventory.locate(tappedItem)?.kind ?? null) : null,
  };
};

/** Runs what the stage armed for the throw commit just queued, each at most once. */
const afterThrowCommit = (play: PlayTestHandle, state: ProofState): void => {
  if (state.quickbarTapAfterNextThrowCommit !== undefined) {
    const slot = state.quickbarTapAfterNextThrowCommit;
    state.quickbarTapAfterNextThrowCommit = undefined;
    play.router.quickbarTap(slot);
    state.quickbarTapCommitObservation = quickbarTapObservation(play, state);
  }
  if (state.dropAfterNextThrowCommit) {
    state.dropAfterNextThrowCommit = false;
    play.router.dropHeldItemForThrowingStance();
  }
};

/** Has play's owners record into `state` what the stages read back. */
const recordPlay = (play: PlayTestHandle, state: ProofState): void => {
  const { input, session, view } = play;
  const ticks = play.pendingPlayerTickActions;
  const applyAtNextTick = ticks.applyAtNextTick.bind(ticks);
  ticks.applyAtNextTick = () => {
    applyAtNextTick();
    if (state.quickbarTapCommitObservation && !state.quickbarTapTickObservation) {
      state.quickbarTapTickObservation = quickbarTapObservation(play, state);
    }
  };

  const { controls } = input;
  const toggleAimingDownSights = controls.toggleAimingDownSights.bind(controls);
  controls.toggleAimingDownSights = (replaying = false) => {
    const before = controls.aimingDownSights;
    toggleAimingDownSights(replaying);
    state.adsToggleObservations.push({ before, after: controls.aimingDownSights, replaying, locked: input.locked });
  };

  const { itemThrows } = view;
  const spawn = itemThrows.spawn.bind(itemThrows);
  itemThrows.spawn = (launch, owner) => {
    spawn(launch, owner);
    const names: string[] = [];
    itemThrows.group.traverse((node) => {
      if (node.name) {
        names.push(node.name);
      }
    });
    const itemUid = launch.itemUid ?? launch.item.uid;
    // Capture presentation at its owner; a short flight can retire before Playwright's next poll.
    state.throwSpawnObservations[itemUid] = {
      active: itemThrows.hiddenItemUids.has(itemUid),
      names,
      durationSimSeconds: launch.flight.durationSimSeconds,
    };
  };

  const frame = session.frame.bind(session);
  session.frame = (...args) => {
    const result = frame(...args);
    state.frames += 1;
    return result;
  };

  const combat = session.playerCombat;
  const beginMeleeSwing = combat.beginMeleeSwing.bind(combat);
  combat.beginMeleeSwing = (start) => {
    const result = beginMeleeSwing(start);
    state.swings.push({ result, profile: start.profile, hand: combat.activeMeleeAction?.hand ?? start.hand });
    return result;
  };

  const { held } = view;
  const heldUpdate = held.update.bind(held);
  held.update = (main, pose, ...rest) => {
    heldUpdate(main, pose, ...rest);
    const attachment = state.trackAttachment ? held.heldItemGripOffset(state.off) : undefined;
    if (!attachment) {
      return;
    }
    const offPose = pose?.[state.off];
    state.attachments.push({
      gap: attachment.gapMetres,
      angle: attachment.angleRadians,
      torsoYaw: pose?.torsoYaw ?? 0,
      // En-garde before the click raises the off hand by design, so neutrality is checked only mid-swing.
      movedOff:
        combat.activeMeleeAction !== undefined &&
        [...(offPose?.offset ?? []), ...(offPose?.rotation ?? [])].some((value) => value !== 0),
    });
  };
};

/** Builds the proof on a play that has published its handle and not yet run a frame. */
export const primaryActionProof = (play: PlayTestHandle) => {
  const { engine, session, view, router, input } = play;
  const { inventory, queue, feet, survival } = session;
  const { registry } = engine;
  const commits = throwCommits(play, () => afterThrowCommit(play, proof));
  const proof = {
    ...initialState(),
    ...fixtureMoves(play),
    input,
    inputTarget: play.inputTarget,
    keyboardInput: play.keyboardInput,
    inventory,
    session,
    queue,
    view,
    simulationWorld: engine.simulationWorld,
    survival,
    get debugTools() {
      return play.debugTools;
    },
    thirdPerson: play.thirdPerson,
    engine,
    debugGunPose: play.debugGunPose,
    opticZoom: play.opticZoom,
    caseEffects: view.caseEffects,
    itemThrows: view.itemThrows,
    audio: play.audio,
    feet,
    scale: engine.config.scale,
    performHandUse: router.performHandUse,
    // The router builds its own quickbar actions; this one has the same owners and holds no state of its own.
    quickbarActions: new QuickbarActions({
      inventory,
      queue,
      feet,
      survival,
      notice: (text) => play.showRefusal(text, session.sim.time),
    }),
    quickbar: session.quickbar,
    screen: play.screen,
    dispatchScreenCommand: router.dispatchScreenCommand,
    get inputRecorder() {
      return play.inputRecording.recorder;
    },
    captureSnapshot: play.captureSnapshot,
    startInputReplayRecording: (): void => {
      const recorder = new InputReplayRecorder(play.captureSnapshot(), undefined, engine.streamer.generatedColumns(), {
        startState: play.captureReplayStartState(),
        contentLookup: (...query) => contentLookup(registry, ...query),
      });
      commits.watch(recorder);
      play.inputRecording.previous = undefined;
      play.inputRecording.recorder = recorder;
    },
    hudOptions: play.hudOptions,
    beginItemThrow: router.beginItemThrow,
    getItemThrowLanding: (itemUid: Item['uid'], heldSimSeconds: number) => {
      const item = inventory.itemByUid(itemUid);
      if (!item) {
        return;
      }
      const distance = throwDistanceForItem(item, registry, play.itemThrowTuning, heldSimSeconds);
      const location = inventory.locate(item);
      const hand = location?.kind === 'hand' ? location.side : session.throwCharge.throwHand();
      const flight = router.itemThrowFlight(item, hand, distance);
      const target = flight.landing ? { kind: 'pile' as const, pos: flight.landing } : undefined;
      const { pos } = session.body;
      const landingDistance =
        target &&
        Math.hypot(target.pos[0] + 0.5 - pos[0], target.pos[2] + 0.5 - pos[2]) * engine.config.scale.blockSize;
      return { target, fits: Boolean(target && inventory.planAdd(item, target).ok), landingDistance, distance };
    },
    getItemThrowState: () => ({
      startedAt: session.throwCharge.startedAt,
      itemUid: session.throwCharge.itemUid,
      hand: session.throwCharge.hand,
    }),
    selectPrimaryAction,
    nextTimeOfDay,
    ignitionTargetForHand,
    liftsWhole: (def: FurnitureDef): boolean => {
      const probe = new Inventory(registry);
      const piece = probe.furnish({ type: def.id, pos: [0, 0, 0], size: def.size, facing: 'n' });
      return piece !== undefined && movableRefusal(probe, piece) === undefined;
    },
    interactionTargetAt: play.interactionTargetAt,
    useTarget: router.useTarget,
    useText: play.useText,
    initialPlayerPosition: [...session.body.pos],
    getNotice: () => play.notice,
    isChargingItemThrow: () => session.throwCharge.startedAt !== undefined,
    isThrowingStance: () => router.throwingStance(),
    clearNotice: () => play.showNotice(''),
  };

  recordPlay(play, proof);
  return proof;
};
