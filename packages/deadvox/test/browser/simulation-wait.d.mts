import type { KeyUp } from './input-actions.d.mts';

export interface SimulationPage {
  /** Takes a sample function, or the expression string the hold's key lookup evaluates. */
  evaluate: <Argument>(sample: string | ((argument: Argument) => unknown), argument?: Argument) => Promise<unknown>;
  waitForFunction: (
    expression: string | ((argument: string) => unknown),
    argument?: string,
    options?: { timeout: number },
  ) => Promise<{ jsonValue: () => Promise<unknown>; dispose: () => Promise<unknown> }>;
  readonly keyboard: { down: (code: string) => Promise<unknown>; up: (code: string) => Promise<unknown> };
}

/** What a sample reports: the simulation clock, whether it paused, and whether the wait's goal is met. */
export interface SimulationSample {
  time: number;
  paused: boolean;
  reached: boolean;
}

export interface SimulationWaitOptions {
  seconds: number;
  from?: number;
  label: string;
  record: (line: string) => unknown;
  /** An input action held for the wait, with the stop armed in the page before its key goes down. */
  hold?: string;
  /** A hold the caller already pressed; its key goes down before the stop is armed, so prefer `hold`. */
  stop?: (() => Promise<unknown>) & { readonly keyUps?: readonly KeyUp[] };
}

export function waitForSimulation<Argument, Sample extends SimulationSample>(
  page: SimulationPage,
  sample: (argument: Argument) => Sample,
  argument: Argument,
  options: SimulationWaitOptions,
): Promise<Sample & { seconds: number }>;
