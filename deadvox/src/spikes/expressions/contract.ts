import type { ContentIssue } from '../../core/content.ts';

export type Scalar = boolean | number | string;
export type ValueType = 'boolean' | 'number' | 'string';
export type Schema = Readonly<Record<string, ValueType>>;
export type Inputs = Readonly<Record<string, Scalar>>;
export interface Program {
  readonly canonical: string;
  evaluate: (inputs: Inputs) => Scalar | Promise<Scalar>;
  dispose?: () => void;
}
export function serializeIdentity(candidate: Candidate, program: Program, schema: Schema, result: ValueType): string {
  return JSON.stringify({
    profile: candidate.name,
    schema: Object.entries(schema).sort(([a], [b]) => {
      if (a === b) {
        return 0;
      }
      return a < b ? -1 : 1;
    }),
    result,
    source: program.canonical,
  });
}

export interface Candidate {
  readonly name: string;
  load: (source: string, schema: Schema, result: ValueType) => Program | Promise<Program>;
}
export class ExpressionIssue extends Error {
  override readonly name = 'ExpressionIssue';
}

export async function loadContentRule(
  candidate: Candidate,
  location: { source: string; path: string; expression: string },
  schema: Schema,
  result: ValueType,
): Promise<{ program: Program | undefined; issues: ContentIssue[] }> {
  try {
    return { program: await candidate.load(location.expression, schema, result), issues: [] };
  } catch (error) {
    if (!(error instanceof ExpressionIssue)) {
      throw error;
    }
    return { program: undefined, issues: [{ source: location.source, path: location.path, message: error.message }] };
  }
}

export function checkedInputs(inputs: Inputs, schema: Schema): Record<string, Scalar> {
  const copy: Record<string, Scalar> = Object.create(null);
  for (const [key, type] of Object.entries(schema)) {
    const descriptor = Object.getOwnPropertyDescriptor(inputs, key);
    if (
      !(descriptor && 'value' in descriptor) ||
      typeof descriptor.value !== type ||
      (type === 'number' && !Number.isFinite(descriptor.value))
    ) {
      throw new Error(`Invalid expression input: ${key} must be a finite ${type}`);
    }
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

export function checkedResult(value: unknown, type: ValueType): Scalar {
  if (typeof value !== type || (typeof value === 'number' && !Number.isFinite(value))) {
    throw new Error(`Invalid expression result: expected ${type}`);
  }
  return value as Scalar;
}

export const sleepSchema: Schema = {
  recoveryPerGameHour: 'number',
  calories: 'number',
  hydration: 'number',
  fatigue: 'number',
  caloriesFloor: 'number',
  hydrationFloor: 'number',
  hasCeiling: 'boolean',
  fatigueCeiling: 'number',
};
export const panelSchema: Schema = { powered: 'boolean', authorized: 'boolean', doorOpen: 'boolean' };

// The effect's target is engine-bound, not chosen by untrusted content.
export function applyPanelEffect(
  description: Scalar,
  boundDoor: string,
  doors: ReadonlyMap<string, boolean>,
): Map<string, boolean> {
  if (!doors.has(boundDoor)) {
    throw new Error('Unknown bound door');
  }
  if (description !== 'open-door' && description !== 'none') {
    throw new Error('Unsupported panel effect');
  }
  const next = new Map(doors);
  if (description === 'open-door') {
    next.set(boundDoor, true);
  }
  return next;
}
