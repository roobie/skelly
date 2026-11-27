import type { Object3D, Object3DEventMap } from 'three';

/**
 * Every object under a root, kept from the graph's own add and remove events, so passes that run each frame read
 * a flat set instead of walking the tree. Graph edits that bypass `add` and `remove` (assigning `children`) are
 * not seen, so only a pass that restores the graph within one synchronous scope may make them.
 */
export class SceneObjects {
  private readonly members = new Set<Object3D>();
  private changes = 0;

  constructor(root: Object3D) {
    this.enter(root);
  }

  get objects(): ReadonlySet<Object3D> {
    return this.members;
  }

  /** Changes whenever an object joins or leaves. */
  get version(): number {
    return this.changes;
  }

  private readonly added = ({ child }: Object3DEventMap['childadded']): void => this.enter(child);

  private readonly removed = ({ child }: Object3DEventMap['childremoved']): void => this.leave(child);

  private enter(object: Object3D): void {
    object.traverse((member) => {
      this.members.add(member);
      member.addEventListener('childadded', this.added);
      member.addEventListener('childremoved', this.removed);
    });
    this.changes += 1;
  }

  private leave(object: Object3D): void {
    object.traverse((member) => {
      this.members.delete(member);
      member.removeEventListener('childadded', this.added);
      member.removeEventListener('childremoved', this.removed);
    });
    this.changes += 1;
  }
}

const shared = new WeakMap<Object3D, SceneObjects>();

/** The one index of `root`, so passes over the same scene share its listeners. */
export const sceneObjectsOf = (root: Object3D): SceneObjects => {
  let objects = shared.get(root);
  if (!objects) {
    objects = new SceneObjects(root);
    shared.set(root, objects);
  }
  return objects;
};
