interface SimulationPage {
  evaluate: (sample: unknown, argument?: unknown) => Promise<unknown>;
  waitForFunction: (
    expression: string | ((argument: string) => unknown),
    argument?: string,
    options?: { timeout: number },
  ) => Promise<{ jsonValue: () => Promise<unknown>; dispose: () => Promise<unknown> }>;
  readonly keyboard: { down: (code: string) => Promise<unknown>; up: (code: string) => Promise<unknown> };
}

interface SimulationWaitOptions {
  seconds: number;
  from?: number;
  label: string;
  record: (line: string) => Promise<unknown>;
  /** An input action held for the wait, with the stop armed in the page before its key goes down. */
  hold?: string;
  /** A hold the caller already pressed; its key goes down before the stop is armed, so prefer `hold`. */
  stop?: (() => Promise<unknown>) & { readonly keyUps?: readonly unknown[] };
}

export function waitForSimulation<Argument>(
  page: SimulationPage,
  sample: (argument: Argument) => { time: number; paused: boolean; reached: boolean },
  argument: Argument,
  options: SimulationWaitOptions,
): Promise<Record<string, unknown>>;
