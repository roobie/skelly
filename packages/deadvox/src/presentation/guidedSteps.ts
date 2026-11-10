import type { GuidanceDef, GuidanceGate } from '../../../engine/src/content.ts';
import { insideStageArea, type Rect } from '../../../engine/src/sim.ts';
import type { Vec3 } from '../../../engine/src/world.ts';
import { HandlingLessons } from './handlingLessons.ts';

export interface GuidanceObservation {
  position: Vec3;
  yaw: number;
  crouching: boolean;
  doorOpen: boolean;
  searched: boolean;
  looted: boolean;
  wielded: boolean;
  lightOn: boolean;
  litType: string | undefined;
  paused: boolean;
}

type Rule = GuidanceDef['rules'][number];

/** Ordinary action owners supply facts; the projection never commands the simulation. */
export class GuidedSteps {
  private readonly achieved = new Set<string>();
  private lightWasOn = false;
  readonly weapons: HandlingLessons;

  private readonly spawn: Vec3;
  private readonly startingYaw: number;
  private readonly exit: Rect;
  readonly definition: GuidanceDef;

  constructor(spawn: Vec3, startingYaw: number, exit: Rect, definition: GuidanceDef) {
    this.spawn = spawn;
    this.startingYaw = startingYaw;
    this.exit = exit;
    this.definition = definition;
    this.weapons = new HandlingLessons(definition.handling);
  }

  private holds(gate: GuidanceGate): boolean {
    return (
      gate.all.every((id) => this.achieved.has(id)) &&
      (gate.any === undefined || gate.any.some((id) => this.achieved.has(id))) &&
      gate.none.every((id) => !this.achieved.has(id)) &&
      (gate.handling === undefined || this.weapons.lesson(gate.handling) === undefined)
    );
  }

  get step(): GuidanceDef['steps'][number] {
    const step = this.definition.steps.find((row) => this.holds(row.enabled) && !this.holds(row.complete));
    if (!step) {
      throw new Error('Guidance has no active step');
    }
    return step;
  }

  get stage(): string {
    return this.step.id;
  }

  canChoose(id: string): boolean {
    const choice = this.definition.choices.find((row) => row.id === id);
    return Boolean(choice?.at.includes(this.stage) && !(choice.once && this.achieved.has(id)));
  }

  choose(id: string): void {
    if (this.canChoose(id) && this.definition.choices.find((row) => row.id === id)?.action === 'choose') {
      this.achieved.add(id);
    }
  }

  private record(matches: (when: Rule['when']) => boolean): void {
    for (const rule of this.definition.rules) {
      if (this.holds(rule.enabled) && (rule.at.length === 0 || rule.at.includes(this.stage)) && matches(rule.when)) {
        this.achieved.add(rule.id);
      }
    }
  }

  batterySwapped(type: string): void {
    this.record((when) => when.kind === 'battery-swapped' && when.item === type);
  }

  opened(type: string): void {
    this.record((when) => when.kind === 'opened' && when.item === type);
  }

  consumed(type: string): void {
    this.record((when) => when.kind === 'consumed' && when.item === type);
  }

  unarmedHit(): void {
    this.record((when) => when.kind === 'unarmed-hit');
  }

  observe(state: GuidanceObservation): void {
    this.lightWasOn ||= state.lightOn;
    this.record((when) => {
      switch (when.kind) {
        case 'displacement':
          return Math.hypot(state.position[0] - this.spawn[0], state.position[2] - this.spawn[2]) >= when.blocks;
        case 'turn':
          return Math.abs(state.yaw - this.startingYaw) > when.radians;
        case 'door':
          return state.doorOpen;
        case 'loot':
          return state.searched && state.looted;
        case 'hands':
          return state.wielded;
        case 'light-cycle':
          return this.lightWasOn && !state.lightOn;
        case 'crouch':
          return state.crouching;
        case 'area':
          return insideStageArea(this.exit, state.position);
        case 'pause':
          return state.paused;
        case 'lit':
          return state.litType === when.item;
        default:
          return false;
      }
    });
  }
}
