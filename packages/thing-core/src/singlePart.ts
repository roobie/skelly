import type { Assembly, Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import type { DomainUnits } from '@skelly/engine/shapes/solid.ts';

export const singlePart = ({
  id,
  part,
  massKg,
  units,
}: {
  readonly id: string;
  readonly part: PartDef;
  readonly massKg: number;
  readonly units: DomainUnits;
}): { assembly: Assembly; domain: Domain; masses: Readonly<Record<string, number>> } => {
  if (!(Number.isFinite(massKg) && massKg >= 0)) {
    throw new Error('An authored part needs a finite non-negative mass');
  }
  return {
    assembly: { name: id, root: id, parts: { [id]: { family: part.family } }, connections: [] },
    domain: {
      name: id,
      units,
      axisRules: [],
      families: { [part.family]: { name: part.family, params: {}, build: () => part } },
    },
    masses: { [id]: massKg },
  };
};
