import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { FromMesher, ToMesher } from '../worker/protocol.ts';
import { buildShape, type PartData, type ShapeData } from './vehicleShape.ts';

/** A shape's uncoloured geometry beside the quad materials that colour it. */
export interface Part {
  readonly data: PartData;
  readonly geometry: BufferGeometry;
}

export interface Shape {
  readonly solidBaseY: number;
  readonly solid: Part | undefined;
  readonly clear: Part | undefined;
}

/** Where shape requests go; the worker's replies come back through `VehicleShapes.receive`. */
export interface ShapePort {
  post: (message: Extract<ToMesher, { type: 'vehicle' }>) => void;
}

const partFrom = (data: PartData | undefined): Part | undefined => {
  if (!data) {
    return undefined;
  }
  const geometry = new BufferGeometry();
  for (const { name, array, itemSize } of data.attributes) {
    geometry.setAttribute(name, new BufferAttribute(array, itemSize));
  }
  geometry.setIndex(new BufferAttribute(data.index, 1));
  geometry.boundingSphere = new Sphere(new Vector3(...data.sphere.center), data.sphere.radius);
  return { data, geometry };
};

const shapeFrom = (data: ShapeData): Shape => ({
  solidBaseY: data.solidBaseY,
  solid: partFrom(data.solid),
  clear: partFrom(data.clear),
});

const keyOf = (blueprint: string, removed: readonly string[]) => JSON.stringify([blueprint, removed]);

/**
 * Vehicle shapes by blueprint and removed parts. With a port they are meshed off the main thread and `load` answers
 * once they arrive; without one they are meshed on the spot.
 */
export class VehicleShapes {
  private readonly shapes = new Map<string, Shape>();
  private readonly waiting = new Map<string, ((shape: Shape) => void)[]>();
  private readonly port: ShapePort | undefined;

  constructor(port?: ShapePort) {
    this.port = port;
  }

  /** Calls `done` with the shape: at once when it is known or there is no port, otherwise on its arrival. */
  load(blueprint: string, removed: readonly string[], done: (shape: Shape) => void): void {
    const key = keyOf(blueprint, removed);
    const known = this.shapes.get(key);
    if (known || !this.port) {
      done(known ?? this.now(blueprint, removed));
      return;
    }
    const queue = this.waiting.get(key);
    if (queue) {
      queue.push(done);
      return;
    }
    this.waiting.set(key, [done]);
    this.port.post({ type: 'vehicle', key, blueprint, removed });
  }

  /** The shape, meshed here if it is not known yet: for drawing a piece away from the world, which cannot wait. */
  now(blueprint: string, removed: readonly string[]): Shape {
    const key = keyOf(blueprint, removed);
    let shape = this.shapes.get(key);
    if (!shape) {
      shape = shapeFrom(buildShape(blueprint, removed));
      this.shapes.set(key, shape);
    }
    return shape;
  }

  /** Takes a worker's reply; a shape already known (meshed here meanwhile) keeps its geometry. */
  receive(reply: Extract<FromMesher, { type: 'vehicle' }>): void {
    const shape = this.shapes.get(reply.key) ?? shapeFrom(reply.shape);
    this.shapes.set(reply.key, shape);
    const queue = this.waiting.get(reply.key) ?? [];
    this.waiting.delete(reply.key);
    for (const done of queue) {
      done(shape);
    }
  }
}
