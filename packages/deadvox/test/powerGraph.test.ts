import { describe, expect, it } from 'vitest';
import { PowerGraph, type PowerWiring } from '../src/core/powerGraph.ts';

const wiring: PowerWiring = {
  nodes: ['generator', 'battery', 'lamp', 'isolated'],
  wires: [
    ['generator', 'battery'],
    ['battery', 'lamp'],
  ],
};

describe('PowerGraph', () => {
  it('reuses components until an effective rewire splits or joins a network', () => {
    const graph = new PowerGraph(wiring);
    const initial = graph.components;
    expect(initial).toEqual([['battery', 'generator', 'lamp'], ['isolated']]);
    expect(graph.components).toBe(initial);
    graph.replaceWiring({
      nodes: [...wiring.nodes].reverse(),
      wires: [
        ['lamp', 'battery'],
        ['battery', 'generator'],
        ['battery', 'lamp'],
      ],
    });
    expect(graph.components).toBe(initial);
    graph.replaceWiring({ nodes: wiring.nodes, wires: [['generator', 'battery']] });
    const split = graph.components;
    expect(split).not.toBe(initial);
    expect(split).toEqual([['battery', 'generator'], ['isolated'], ['lamp']]);
    graph.replaceWiring({
      nodes: wiring.nodes,
      wires: [...wiring.wires, ['isolated', 'lamp']],
    });
    expect(graph.components).toEqual([['battery', 'generator', 'isolated', 'lamp']]);
  });

  it('rebuilds topology when an isolated node is added or removed', () => {
    const graph = new PowerGraph(wiring);
    const initial = graph.components;
    graph.replaceWiring({ nodes: [...wiring.nodes, 'new'], wires: wiring.wires });
    expect(graph.components).toEqual([...initial, ['new']]);
    graph.replaceWiring(wiring);
    expect(graph.components).toEqual(initial);
  });

  it('round-trips wiring through JSON without sharing mutable caller data', () => {
    const nodes = [...wiring.nodes];
    const wires = wiring.wires.map(([a, b]): [string, string] => [a, b]);
    const graph = new PowerGraph({ nodes, wires });
    const snapshot = graph.snapshot();
    nodes.push('later');
    wires[0]![0] = 'later';
    const restored = new PowerGraph(JSON.parse(JSON.stringify(snapshot)) as PowerWiring);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.components).toEqual(graph.components);
    restored.replaceWiring({ nodes: [], wires: [] });
    expect(graph.snapshot()).toBe(snapshot);
    expect(graph.components).toEqual([['battery', 'generator', 'lamp'], ['isolated']]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nodes)).toBe(true);
    expect(Object.isFrozen(snapshot.wires)).toBe(true);
    expect(snapshot.wires.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(graph.components)).toBe(true);
    expect(graph.components.every(Object.isFrozen)).toBe(true);
  });

  it('rejects ambiguous node identity and dangling endpoints without altering the existing network', () => {
    const graph = new PowerGraph(wiring);
    const initial = graph.components;
    expect(() => graph.replaceWiring({ nodes: ['a', 'a'], wires: [] })).toThrow('Duplicate power node');
    expect(() => graph.replaceWiring({ nodes: wiring.nodes, wires: [['generator', 'missing']] })).toThrow(
      'Power wire endpoint is missing',
    );
    expect(graph.components).toBe(initial);
  });
});
