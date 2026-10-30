import { aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { reachTuning } from '../src/core/reach.ts';
import { adjustLookPitch } from '../src/game/input.ts';
import { BindingRegistry, KeyboardInput } from '../src/game/inputBindings.ts';
import type { ReplayActionPayload } from '../src/game/replayCommands.ts';
import { WorldRepairSurface } from '../src/ui/worldRepairSurface.ts';
import { RECIPE, worldRepairFixture } from './worldRepairFixture.ts';

export const mountWorldRepairFixture = (root: HTMLElement, registry: Registry) => {
  const fixture = worldRepairFixture(registry);
  const keyboard = new KeyboardInput(new BindingRegistry(undefined, undefined));
  const intents: ReplayActionPayload[] = [];
  const look = { yaw: 0, pitch: 0 };
  const turn = (yaw: number, pitch: number) => {
    look.yaw += yaw;
    look.pitch = adjustLookPitch(look.pitch, pitch).pitch;
  };
  const aimedEntity = () => {
    const target = pickInteractionTarget({
      inventory: fixture.inventory,
      entities: fixture.inventory.entities,
      origin: [0, 1.5, 0],
      direction: aimDirection(look.yaw, look.pitch, NEUTRAL_AIM),
      maxDistance: reachTuning(fixture.registry).useReachMetres / 0.5,
      blockSize: 0.5,
      worldSeed: 1,
      isSolid: () => false,
      isOpaque: () => false,
      hasModel: () => false,
    });
    return target?.kind === 'furniture' ? target.entity.uid : undefined;
  };
  const surface = new WorldRepairSurface(root, {
    registry: fixture.registry,
    crafting: fixture.commands,
    keyboard,
    aimedEntity,
    turn,
    aimRadiansPerRealSecond: fixture.registry.player.get(CORE_CONTENT_IDS.player)!.aim
      .keyboardTargetRadiansPerRealSecond,
    emit: (intent) => intents.push(intent),
    returned: () => root.ownerDocument.querySelector<HTMLElement>('[data-enter-world]')?.focus(),
  });
  keyboard.context = () => ({ context: surface.context ?? 'menu', debug: false });
  keyboard.command = (command) => surface.onCommand(command);
  keyboard.cancelled = (_preserve, reason) => {
    if (reason) {
      surface.cancelInput(reason);
    }
  };
  keyboard.escape = () => surface.back();
  return { ...fixture, keyboard, surface, intents, look, turn, aimedEntity, open: () => surface.open(RECIPE) };
};
