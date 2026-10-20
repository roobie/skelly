interface KeyboardPage {
  evaluate: (expression: string) => Promise<unknown>;
  readonly keyboard: { down: (code: string) => Promise<unknown>; up: (code: string) => Promise<unknown> };
}

interface HoldOptions {
  includeGate?: boolean;
}

/** Releases the held keys from Node; waitForSimulation releases keyUps in the page first when this is its stop. */
interface HeldKeys {
  (): Promise<void>;
  readonly keyUps: readonly { readonly code: string; readonly key: string }[];
}

type Evaluate = (expression: string) => Promise<unknown>;
type Send = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export function actionSnapshotExpression(id: string): string;
export function holdAction(page: KeyboardPage, id: string, options?: HoldOptions): Promise<HeldKeys>;
export function pressAction(page: KeyboardPage, id: string, options?: HoldOptions): Promise<void>;
export function cdpKey(code: string): { code: string; key: string; windowsVirtualKeyCode: number | undefined };
export function pressCdpAction(evaluate: Evaluate, send: Send, id: string): Promise<void>;
export function pressCdpActionBurst(evaluate: Evaluate, send: Send, id: string, count: number): Promise<void>;
