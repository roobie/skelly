// Seeded generation from templates. The generator only makes choices; it
// never checks feasibility. That's the validator's job, so the two stay
// independent and the generator can be measured against it (PROJECT.md §9).

import { type Rng, chance, pick, seededRng } from './random.ts';
import { resolve } from './resolve.ts';
import type { Assembly, Connection, Domain, PartInstance } from './schema.ts';
import type { Choice, ConnectionTemplate, Template } from './template.ts';
import { type Report, validate } from './validate.ts';

const choose = <T>(rng: Rng, c: Choice<T>): T => (Array.isArray(c) ? pick(rng, c as readonly T[]) : (c as T));

const partOf = (ref: string): string => ref.slice(0, ref.indexOf('.'));

/**
 * Makes one assembly from a template. Deterministic: the same template,
 * domain and seed always give the same assembly.
 */
export const generate = (template: Template, domain: Domain, seed: number): Assembly => {
  const rng = seededRng(seed);

  // 1. Which parts, with which params.
  const parts: Record<string, PartInstance> = {};
  for (const slot of template.slots) {
    const present = slot.chance === undefined || slot.chance >= 1 || chance(rng, slot.chance);
    if (!present) continue;
    const params: Record<string, string> = {};
    for (const [name, c] of Object.entries(slot.params ?? {})) params[name] = choose(rng, c);
    parts[slot.id] = Object.keys(params).length > 0 ? { family: slot.family, params } : { family: slot.family };
  }

  // 2. Which connections. Slots are picked afterwards, once the parts they
  //    sit on are known (a port's slot count can depend on inherited params).
  const drafts: { conn: Connection; slot: ConnectionTemplate['slot'] }[] = [];
  for (const t of template.connections) {
    if (!(partOf(t.to) in parts)) continue;
    const froms = (Array.isArray(t.from) ? t.from : [t.from]) as readonly string[];
    const available = froms.filter((f) => partOf(f) in parts);
    if (available.length === 0) continue;
    if (t.chance !== undefined && t.chance < 1 && !chance(rng, t.chance)) continue;
    drafts.push({ conn: { from: pick(rng, available), to: t.to }, slot: t.slot });
  }

  // 3. Slots. Resolve the draft (every slotted connection at slot 0) to learn
  //    how many slots each port has.
  const draft = (): Assembly => ({
    name: template.name,
    root: template.root,
    parts,
    connections: drafts.map((d) => (d.slot === undefined ? d.conn : { ...d.conn, slot: 0 })),
  });
  const needsCount = drafts.some((d) => d.slot === 'any');
  const resolved = needsCount ? resolve(draft(), domain) : undefined;
  const connections = drafts.map(({ conn, slot }) => {
    if (slot === undefined) return conn;
    if (slot !== 'any') return { ...conn, slot: choose(rng, slot) };
    const [part, port] = [partOf(conn.from), conn.from.slice(conn.from.indexOf('.') + 1)];
    const count = resolved!.defs.get(part)?.ports.find((p) => p.id === port)?.slots?.count ?? 1;
    return { ...conn, slot: Math.floor(rng() * count) };
  });

  return {
    name: `${template.name}-${seed}`,
    description: `Generated from the "${template.name}" template with seed ${seed}.`,
    root: template.root,
    parts,
    connections,
  };
};

export interface ValidGeneration {
  readonly assembly: Assembly;
  readonly report: Report;
  /** The seed that produced it. */
  readonly seed: number;
  /** How many seeds were tried, including the one that worked. */
  readonly attempts: number;
}

/**
 * Tries seed, seed + 1, ... until one gives an assembly that passes every
 * rule, or `maxAttempts` run out.
 */
export const generateValid = (
  template: Template,
  domain: Domain,
  seed: number,
  maxAttempts = 100,
): ValidGeneration | undefined => {
  for (let i = 0; i < maxAttempts; i++) {
    const assembly = generate(template, domain, seed + i);
    const report = validate(assembly, domain);
    if (report.ok) return { assembly, report, seed: seed + i, attempts: i + 1 };
  }
  return undefined;
};
