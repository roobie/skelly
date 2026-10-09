interface SimulationPage {
  evaluate: (sample: unknown, argument?: unknown) => Promise<unknown>;
  waitForFunction: (
    expression: string,
    argument: undefined,
    options: { timeout: number },
  ) => Promise<{ jsonValue: () => Promise<unknown>; dispose: () => Promise<unknown> }>;
}

interface SimulationWaitOptions {
  seconds: number;
  from?: number;
  label: string;
  record: (line: string) => Promise<unknown>;
  stop?: (() => Promise<unknown>) & { readonly keyUps?: readonly unknown[] };
}

export function waitForSimulation<Argument>(
  page: SimulationPage,
  sample: (argument: Argument) => { time: number; paused: boolean; reached: boolean },
  argument: Argument,
  options: SimulationWaitOptions,
): Promise<Record<string, unknown>>;
