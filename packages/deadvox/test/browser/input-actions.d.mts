export interface KeyboardPage {
  evaluate: (expression: string) => Promise<unknown>;
  readonly keyboard: { down: (code: string) => Promise<unknown>; up: (code: string) => Promise<unknown> };
}

export interface HoldOptions {
  includeGate?: boolean;
}

export interface KeyUp {
  readonly code: string;
  readonly key: string;
}

/** Releases the held keys from Node; waitForSimulation releases keyUps in the page first when this is its stop. */
export interface HeldKeys {
  (): Promise<void>;
  readonly keyUps: readonly KeyUp[];
}

export type Evaluate = (expression: string) => Promise<unknown>;
// Biome's resolver misses the type through playwright's re-export, so this references it by type import.
export type Send = import('playwright').CDPSession['send'];

export function actionSnapshotExpression(id: string): string;
export function holdAction(page: KeyboardPage, id: string, options?: HoldOptions): Promise<HeldKeys>;
export function pressAction(page: KeyboardPage, id: string, options?: HoldOptions): Promise<void>;
export function keyUpsForHold(page: KeyboardPage, id: string, options?: HoldOptions): Promise<HeldKeys['keyUps']>;
export function cdpKey(code: string): { code: string; key: string; windowsVirtualKeyCode?: number };
export function pressCdpAction(evaluate: Evaluate, send: Send, id: string): Promise<void>;
export function pressCdpActionBurst(evaluate: Evaluate, send: Send, id: string, count: number): Promise<void>;
