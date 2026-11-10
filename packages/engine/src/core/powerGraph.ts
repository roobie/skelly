type PowerWire = readonly [string, string];
type PowerComponent = readonly string[];

export interface PowerWiring {
  readonly nodes: readonly string[];
  readonly wires: readonly PowerWire[];
}

const compareId = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
};
const compareWire = (a: PowerWire, b: PowerWire): number => compareId(a[0], b[0]) || compareId(a[1], b[1]);

const canonicalWiring = ({ nodes, wires }: PowerWiring): PowerWiring => {
  const ids = new Set(nodes);
  if (ids.size !== nodes.length) {
    throw new Error('Duplicate power node');
  }
  const edges: PowerWire[] = wires
    .map(([a, b]) => {
      if (!(ids.has(a) && ids.has(b))) {
        throw new Error('Power wire endpoint is missing');
      }
      return Object.freeze(compareId(a, b) <= 0 ? ([a, b] as const) : ([b, a] as const));
    })
    .sort(compareWire);
  return Object.freeze({
    nodes: Object.freeze([...ids].sort(compareId)),
    wires: Object.freeze(edges.filter((edge, i) => i === 0 || compareWire(edge, edges[i - 1]!) !== 0)),
  });
};

const sameWiring = (a: PowerWiring, b: PowerWiring): boolean =>
  a.nodes.length === b.nodes.length &&
  a.nodes.every((id, i) => id === b.nodes[i]) &&
  a.wires.length === b.wires.length &&
  a.wires.every((wire, i) => compareWire(wire, b.wires[i]!) === 0);

const connectedComponents = ({ nodes, wires }: PowerWiring): readonly PowerComponent[] => {
  const adjacent = new Map(nodes.map((id) => [id, [] as string[]]));
  for (const [a, b] of wires) {
    adjacent.get(a)!.push(b);
    adjacent.get(b)!.push(a);
  }
  const visited = new Set<string>();
  const components: PowerComponent[] = [];
  for (const id of nodes) {
    if (visited.has(id)) {
      continue;
    }
    const pending = [id];
    visited.add(id);
    const component: string[] = [];
    while (pending.length > 0) {
      const next = pending.pop()!;
      component.push(next);
      for (const neighbor of adjacent.get(next)!) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    components.push(Object.freeze(component.sort(compareId)));
  }
  return Object.freeze(components);
};

export class PowerGraph {
  private wiring: PowerWiring;
  private cachedComponents: readonly PowerComponent[] | undefined;

  constructor(wiring: PowerWiring) {
    this.wiring = canonicalWiring(wiring);
  }

  replaceWiring(wiring: PowerWiring): void {
    const next = canonicalWiring(wiring);
    if (!sameWiring(this.wiring, next)) {
      this.wiring = next;
      this.cachedComponents = undefined;
    }
  }

  get components(): readonly PowerComponent[] {
    this.cachedComponents ??= connectedComponents(this.wiring);
    return this.cachedComponents;
  }

  snapshot(): PowerWiring {
    return this.wiring;
  }
}
