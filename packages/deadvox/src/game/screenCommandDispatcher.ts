import type { Inventory } from '../core/inventory.ts';
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
  readonly inventory: Pick<Inventory, 'itemByUid' | 'name'>;
  readonly notice: (text: string) => void;
  readonly refusal: (reason: string) => void;
}

export const createScreenCommandDispatcher =
  (ports: ScreenCommandDispatcherPorts) =>
  (payload: ReplayActionPayload): string | undefined => {
    if (ports.isReplaying()) {
      return undefined;
    }
    const recorder = ports.inputRecorder();
    if (!recorder) {
      const item = payload.kind === 'inventory.assign' ? ports.inventory.itemByUid(payload.itemUid) : undefined;
      const reason = ports.apply(payload);
      if (!reason && item && payload.kind === 'inventory.assign') {
        ports.notice(`${ports.inventory.name(item)} on quickbar ${payload.slot + 1}`);
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
        ports.notice(`${ports.inventory.name(item)} on quickbar ${payload.slot + 1}`);
      }
    });
    return undefined;
  };
