import {
  array,
  check,
  type InferOutput,
  literal,
  minLength,
  optional,
  picklist,
  pipe,
  regex,
  strictObject,
  string,
  union,
  boolean as vBoolean,
} from 'valibot';
import { HANDLING_FACTS, HANDLING_MECHANISMS } from '../guidanceFacts.ts';
import { Id, Name, Positive } from './primitives.ts';

const Key = pipe(string(), regex(/^[a-z0-9_.-]+$/, 'must be a guidance or action key'));
const Gate = strictObject({
  all: array(Key),
  any: optional(array(Key)),
  none: array(Key),
  handling: optional(Key),
});
const HintCondition = strictObject({
  inventoryOpen: optional(vBoolean()),
  lightOn: optional(vBoolean()),
  held: optional(array(Id)),
  carried: optional(Id),
  lesson: optional(strictObject({ track: Key, id: Key })),
});
const HintPart = union([
  strictObject({ text: Name }),
  strictObject({ action: Key, label: Name }),
  strictObject({ wield: Name }),
  strictObject({ use: Id, label: Name }),
  strictObject({ itemName: Id }),
  strictObject({ wieldItem: Id }),
  strictObject({ inventory: literal(true) }),
  strictObject({ lineBreak: literal(true) }),
]);
const Observation = union([
  strictObject({ kind: literal('displacement'), blocks: Positive }),
  strictObject({ kind: literal('turn'), radians: Positive }),
  strictObject({ kind: literal('door') }),
  strictObject({ kind: literal('loot') }),
  strictObject({ kind: literal('hands') }),
  strictObject({ kind: literal('light-cycle') }),
  strictObject({ kind: literal('crouch') }),
  strictObject({ kind: literal('area') }),
  strictObject({ kind: literal('pause') }),
  strictObject({ kind: literal('lit'), item: Id }),
  strictObject({ kind: literal('opened'), item: Id }),
  strictObject({ kind: literal('consumed'), item: Id }),
  strictObject({ kind: literal('battery-swapped'), item: Id }),
  strictObject({ kind: literal('unarmed-hit') }),
]);
const GuidanceFields = strictObject({
  observe: strictObject({
    door: optional(Id),
    searched: optional(Id),
    hands: optional(array(Id)),
    light: optional(Id),
  }),
  rules: array(strictObject({ id: Key, when: Observation, enabled: Gate, at: array(Key) })),
  handling: array(
    strictObject({
      id: Key,
      mechanism: picklist(HANDLING_MECHANISMS),
      reloadRequiresCaseRemoval: vBoolean(),
      lessons: pipe(
        array(strictObject({ id: Key, facts: pipe(array(picklist(HANDLING_FACTS)), minLength(1)) })),
        minLength(1),
      ),
    }),
  ),
  steps: pipe(
    array(
      strictObject({
        id: Key,
        enabled: Gate,
        complete: Gate,
        topics: array(Key),
        hints: pipe(array(strictObject({ when: HintCondition, parts: array(HintPart) })), minLength(1)),
        notes: array(Name),
      }),
    ),
    minLength(1),
  ),
  choices: array(strictObject({ id: Key, at: array(Key), label: Name, once: vBoolean() })),
  chrome: strictObject({
    inventory: Name,
    closeInventory: Name,
    wieldSelectedItem: Name,
    unsaved: Name,
    controls: Name,
    restart: Name,
  }),
});

export type GuidanceDef = InferOutput<typeof GuidanceFields>;
export type GuidanceGate = GuidanceDef['steps'][number]['complete'];

const factIds = (guide: GuidanceDef) => [...guide.rules, ...guide.choices].map(({ id }) => id);
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const identitiesUnique = (guide: GuidanceDef) =>
  unique(factIds(guide)) &&
  unique(guide.steps.map(({ id }) => id)) &&
  unique(guide.choices.map(({ id }) => id)) &&
  unique(guide.handling.map(({ id }) => id)) &&
  unique(guide.handling.map(({ mechanism }) => mechanism)) &&
  guide.handling.every((track) => unique(track.lessons.map(({ id }) => id)));

const referencesResolve = (guide: GuidanceDef) => {
  const steps = new Set(guide.steps.map(({ id }) => id));
  const facts = new Set(factIds(guide));
  const handling = new Map(guide.handling.map((track) => [track.id, track]));
  const gates = [
    ...guide.steps.flatMap((step) => [step.enabled, step.complete]),
    ...guide.rules.map(({ enabled }) => enabled),
  ];
  const gateResolves = (gate: GuidanceGate) =>
    [...gate.all, ...(gate.any ?? []), ...gate.none].every((id) => facts.has(id)) &&
    (gate.handling === undefined || handling.has(gate.handling));
  const hintResolves = ({ when }: GuidanceDef['steps'][number]['hints'][number]) =>
    !when.lesson || handling.get(when.lesson.track)?.lessons.some(({ id }) => id === when.lesson!.id);
  return (
    gates.every(gateResolves) &&
    [...guide.rules, ...guide.choices].every(({ at }) => at.every((id) => steps.has(id))) &&
    guide.steps.every((step) => step.hints.every(hintResolves))
  );
};

const observationsSelected = (guide: GuidanceDef) =>
  guide.rules.every(({ when }) => {
    switch (when.kind) {
      case 'door':
        return guide.observe.door !== undefined;
      case 'loot':
        return guide.observe.searched !== undefined;
      case 'hands':
        return (guide.observe.hands?.length ?? 0) > 0;
      case 'light-cycle':
        return guide.observe.light !== undefined;
      default:
        return true;
    }
  });

const hasTerminal = (guide: GuidanceDef) => {
  const terminal = guide.steps.at(-1)!;
  return (
    terminal.enabled.all.length === 0 &&
    terminal.enabled.none.length === 0 &&
    terminal.enabled.any === undefined &&
    terminal.enabled.handling === undefined &&
    terminal.complete.any?.length === 0 &&
    guide.steps.every((step) => Object.keys(step.hints.at(-1)!.when).length === 0)
  );
};

export const GuidanceSchema = pipe(
  GuidanceFields,
  check(
    (guide) => identitiesUnique(guide) && referencesResolve(guide) && observationsSelected(guide) && hasTerminal(guide),
    'guidance requires unique identities, resolving references, an unconditional terminal and final hint cases',
  ),
);
