import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { realSeconds } from '../src/core/time.ts';
import { LeverProps } from '../src/render/leverProps.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
const lever = registry.models.get(registry.items.get('frag_grenade')!.model!)!.lever!;
const BLOCK = 0.5;
const FLOOR = (_x: number, y: number) => y < 0;

/** A throwable resting above the floor: a body mesh and a lever mesh tagged with the content's piece. */
const throwable = (): Group => {
  const root = new Group();
  const material = new MeshBasicMaterial();
  const body = new Mesh(new BoxGeometry(0.06, 0.1, 0.06), material);
  const leverMesh = new Mesh(new BoxGeometry(0.01, 0.08, 0.02), material);
  leverMesh.geometry.userData.piece = lever.piece;
  leverMesh.position.set(0.035, 0, 0);
  leverMesh.visible = false;
  root.add(body, leverMesh);
  root.position.set(BLOCK / 2, BLOCK / 4, BLOCK / 2);
  return root;
};

const flying = (props: LeverProps) => props.group.children.filter((holder) => holder.visible);

describe('lever props', () => {
  it('flies one copy of the shed lever and lets it go after its lifetime', () => {
    const props = new LeverProps(BLOCK, FLOOR);
    props.spawn(throwable(), lever);
    expect(flying(props)).toHaveLength(1);
    expect(flying(props)[0]!.children.every((child) => child.visible)).toBe(true);
    props.update(lever.lifetimeRealSeconds / 2);
    expect(flying(props)).toHaveLength(1);
    props.update(lever.lifetimeRealSeconds / 2);
    expect(flying(props)).toHaveLength(0);
  });

  it('comes to rest on the floor it falls onto', () => {
    const props = new LeverProps(BLOCK, FLOOR);
    // Long-lived, so it is still drawn when it has landed whatever the content lifetime.
    props.spawn(throwable(), { ...lever, lifetimeRealSeconds: realSeconds(60) });
    const [holder] = flying(props);
    for (let frame = 0; frame < 300; frame++) {
      props.update(1 / 60);
    }
    expect(holder!.position.y).toBe(0);
  });

  it('launches nothing from a throwable drawn without a lever mesh', () => {
    const props = new LeverProps(BLOCK, FLOOR);
    props.spawn(new Group().add(new Mesh(new BoxGeometry(), new MeshBasicMaterial())), lever);
    props.spawn(undefined, lever);
    expect(flying(props)).toHaveLength(0);
  });
});
