import { World } from '../core/world.ts';

/** Resident blocks for drawing; the simulation owns a separate canonical store. */
export class RenderWorld extends World {
  readonly renderOnly = true;
}
