import { actionText, fillText } from '../core/actionText.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { countText } from '../core/numberText.ts';
import type { InputContext } from './inputBindings.ts';
import type { InputReplayRecorder } from './inputReplay.ts';
import type { PlayerTickActions } from './playerTickActions.ts';
import type { ReplayActionPayload } from './replayCommands.ts';

export interface ScreenCommandDispatcherPorts {
  readonly isReplaying: () => boolean;
  readonly inputRecorder: () => Pick<InputReplayRecorder, 'queueAction'> | undefined;
  readonly inputContext: () => InputContext;
  readonly pendingPlayerTickActions: Pick<PlayerTickActions, 'enqueue'>;
  readonly apply: (payload: ReplayActionPayload) => string | undefined;
  readonly inventory: Pick<Inventory, 'itemByUid' | 'name' | 'registry'>;
  readonly notice: (text: string) => void;
  readonly refusal: (reason: string) => void;
}

export const createScreenCommandDispatcher =
  (ports: ScreenCommandDispatcherPorts) =>
  (payload: ReplayActionPayload): string | undefined => {
    if (ports.isReplaying()) {
      return undefined;
    }
    const assigned = (item: Item, slot: number): string =>
      fillText(actionText(ports.inventory.registry).play.onQuickbar, {
        item: ports.inventory.name(item),
        slot: countText(slot + 1),
      });
    const recorder = ports.inputRecorder();
    if (!recorder) {
      const item = payload.kind === 'inventory.assign' ? ports.inventory.itemByUid(payload.itemUid) : undefined;
      const reason = ports.apply(payload);
      if (!reason && item && payload.kind === 'inventory.assign') {
        ports.notice(assigned(item, payload.slot));
      }
      return reason;
    }
    recorder.queueAction(payload.kind, 'down', ports.inputContext(), { payload });
    ports.pendingPlayerTickActions.enqueue(() => {
      const item = payload.kind === 'inventory.assign' ? ports.inventory.itemByUid(payload.itemUid) : undefined;
      const reason = ports.apply(payload);
      if (reason) {
        ports.refusal(reason);
      } else if (item && payload.kind === 'inventory.assign') {
        ports.notice(assigned(item, payload.slot));
      }
    });
    return undefined;
  };
