// biome-ignore-all lint/correctness/noNodejsModules: the Vite transform asserts the browser-test observation contract
import assert from 'node:assert/strict';
import process from 'node:process';

export const logPhase = (phase, start) => {
  process.stdout.write(
    `PRIMARY_ACTION_TIMING ${JSON.stringify({ phase, milliseconds: Math.round(performance.now() - start) })}\n`,
  );
};

export const timePhase = async (phase, action) => {
  const start = performance.now();
  try {
    return await action();
  } finally {
    logPhase(phase, start);
  }
};

export const observationPlugin = {
  name: 'primary-action-test-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    const throwQueueMarker = `      pendingPlayerTickActions.enqueue(() => {
        applyToHeldItem(inventory.hands, hand, uid, (heldItem) => {
          throwHeldItem(heldItem, hand, distance, chargeProgress);
          syncThrowingStance();
        });
      });`;
    const playerTickMarker = '      pendingPlayerTickActions.applyAtNextTick();';
    const adsToggleMarker = `      case 'aim.ads-toggle':
        input.toggleAimingDownSights(replayPlayer !== undefined);
        break;`;
    assert(code.includes(marker), 'game-loop observation point exists');
    assert(code.includes(adsToggleMarker), 'ADS replay observation point exists');
    assert(code.includes(throwQueueMarker), 'stance throw queue observation point exists');
    assert(code.includes(playerTickMarker), 'player tick action observation point exists');
    let observedCode = code.replace(
      throwQueueMarker,
      `${throwQueueMarker}
      if (proof.quickbarTapAfterNextThrowCommit !== undefined) {
        const slot = proof.quickbarTapAfterNextThrowCommit;
        proof.quickbarTapAfterNextThrowCommit = undefined;
        quickbarTap(slot);
        const tappedItem = inventory.itemByUid(proof.quickbarTapItemUid);
        proof.quickbarTapCommitObservation = {
          itemMoveQueued: queue.jobs.some(
            (job) => job.kind === 'move' && job.itemUid === proof.quickbarTapItemUid,
          ),
          location: tappedItem ? inventory.locate(tappedItem)?.kind ?? null : null,
        };
      }
      if (proof.dropAfterNextThrowCommit) {
        proof.dropAfterNextThrowCommit = false;
        dropHeldItemForThrowingStance();
      }`,
    );
    observedCode = observedCode.replace(
      adsToggleMarker,
      `      case 'aim.ads-toggle': {
        const before = input.aimingDownSights;
        const replaying = replayPlayer !== undefined;
        input.toggleAimingDownSights(replaying);
        proof.adsToggleObservations.push({ before, after: input.aimingDownSights, replaying, locked: input.locked });
        break;
      }`,
    );
    observedCode = observedCode.replace(
      playerTickMarker,
      `${playerTickMarker}
      if (proof.quickbarTapCommitObservation && !proof.quickbarTapTickObservation) {
        const tappedItem = inventory.itemByUid(proof.quickbarTapItemUid);
        proof.quickbarTapTickObservation = {
          itemMoveQueued: queue.jobs.some(
            (job) => job.kind === 'move' && job.itemUid === proof.quickbarTapItemUid,
          ),
          location: tappedItem ? inventory.locate(tappedItem)?.kind ?? null : null,
        };
      }`,
    );
    return observedCode.replace(
      marker,
      `
  const proof = {
    input,
    inputTarget,
    keyboardInput,
    inventory,
    session,
    queue,
    view,
    streamer,
    survival,
    debugTools,
    engine,
    view,
    caseEffects,
    itemThrows,
    audio,
    feet,
    scale,
    performHandUse,
    quickbarActions,
    quickbar,
    screen,
    dispatchScreenCommand,
    get inputRecorder() { return inputRecorder; },
    captureSnapshot,
    dropAfterNextThrowCommit: false,
    quickbarTapAfterNextThrowCommit: undefined,
    quickbarTapItemUid: undefined,
    quickbarTapCommitObservation: undefined,
    quickbarTapTickObservation: undefined,
    adsToggleObservations: [],
    startInputReplayRecording: () => {
      previousInputRecorder = undefined;
      inputRecorder = new InputReplayRecorder(captureSnapshot(), undefined, streamer.generatedColumns(), {
        startState: captureReplayStartState(),
      });
    },
    hudOptions,
    beginItemThrow,
    getItemThrowLanding: (itemUid, heldSimSeconds) => {
      const item = inventory.itemByUid(itemUid);
      if (!item) return undefined;
      const distance = throwDistanceForItem(item, registry, itemThrowTuning, heldSimSeconds);
      const target = itemLandingTarget(distance);
      const landingDistance = target
        ? Math.hypot(target.pos[0] + 0.5 - body.pos[0], target.pos[2] + 0.5 - body.pos[2]) * s
        : undefined;
      return { target, fits: Boolean(target && inventory.planAdd(item, target).ok), landingDistance };
    },
    getItemThrowState: () => ({ startedAt: itemThrowStartedAt, itemUid: itemThrowItemUid, hand: itemThrowHand }),
    selectPrimaryAction,
    ignitionTargetForHand,
    interactionTargetAt,
    useTarget,
    useText,
    dominant: 'left', off: 'right', frames: 0, swings: [], attachments: [], trackAttachment: false,
    initialPlayerPosition: [...session.body.pos],
    getNotice: () => notice,
    isChargingItemThrow: () => itemThrowStartedAt !== undefined,
    isThrowingStance: () => throwingStance,
    clearNotice: () => showNotice(''),
    clearHand: (side) => {
      const held = inventory.hands[side];
      if (held) {
        const result = inventory.move(held, { kind: 'pile', pos: feet() });
        if (!result.ok) throw new Error('Could not drop fixture hand: ' + result.reason);
      }
    },
    setHand: (side, item) => {
      if (inventory.hands[side] === item) return;
      proof.clearHand(side);
      const from = inventory.locate(item);
      const result = from ? inventory.move(item, { kind: 'hand', side }) : inventory.add(item, { kind: 'hand', side });
      if (from ? !result.ok : !result) throw new Error('Could not place fixture hand');
    },
    placePocketed: (item) => {
      const definitions = inventory.registry.items;
      const { size } = definitions.get(item.type);
      const fits = (grid) =>
        (grid[0] >= size[0] && grid[1] >= size[1]) || (grid[0] >= size[1] && grid[1] >= size[0]);
      for (const { item: container, location } of inventory.items()) {
        if (location.kind !== 'worn' || !container.pockets) continue;
        const definition = definitions.get(container.type);
        for (let pocket = 0; pocket < definition.container.pockets.length; pocket += 1) {
          if (fits(definition.container.pockets[pocket].grid)) {
            if (inventory.add(item, { kind: 'pocket', owner: container, pocket })) return;
          }
        }
      }
      throw new Error('No worn pocket fits ' + item.type);
    },
  };
  Object.assign(globalThis, { primaryActionTest: proof });
  const proofFrame = session.frame.bind(session);
  session.frame = (...args) => { const result = proofFrame(...args); proof.frames++; return result; };
  const proofSwing = session.playerCombat.beginMeleeSwing.bind(session.playerCombat);
  session.playerCombat.beginMeleeSwing = (start) => {
    const result = proofSwing(start);
    proof.swings.push({ result, profile: start.profile, hand: session.playerCombat.activeMeleeAction?.hand ?? start.hand });
    return result;
  };
  const proofHeldUpdate = view.held.update.bind(view.held);
  view.held.update = (...args) => {
    proofHeldUpdate(...args);
    if (!proof.trackAttachment) return;
    const pose = args[1];
    const arm = view.held.arms.get(proof.off);
    const item = view.held.heldByHand.get(proof.off);
    const anchor = arm?.getObjectByName('grip-anchor');
    if (!anchor || !item) return;
    proof.attachments.push({
      gap: item.getWorldPosition(camera.position.clone()).distanceTo(anchor.getWorldPosition(camera.position.clone())),
      angle: item.getWorldQuaternion(camera.quaternion.clone()).angleTo(anchor.getWorldQuaternion(camera.quaternion.clone())),
      torsoYaw: pose?.torsoYaw ?? 0,
      movedOff: [...(pose?.[proof.off]?.offset ?? []), ...(pose?.[proof.off]?.rotation ?? [])].some(value => value !== 0),
    });
  };
${marker}`,
    );
  },
};
