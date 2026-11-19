import type { FurnitureDef } from '@skelly/engine/content';
import type { ConditionBand } from '@skelly/engine/inventory';
import type { ColumnReveal } from '@skelly/engine/mesh';
import { type BlockEntities, type BlockEntity, rotationOf, type SitePower } from '@skelly/engine/world';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';

type Look = NonNullable<NonNullable<FurnitureDef['power']>['instruments']>;
type Reading = NonNullable<ReturnType<SitePower['instruments']>>;
type Box = Look['panel'][number];
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Geometry is content; this owner only selects the owner's reading and decorates its selected detent. */
export function createPlantInstrument(look: Look, bands: readonly ConditionBand[]) {
  const group = new Group();
  const textures: CanvasTexture[] = [];
  const material = (color: string) => withHeightFog(new MeshLambertMaterial({ color }), 'furniture');
  const boxes = (rows: readonly Box[], parent: Group) => {
    for (const row of rows) {
      const mesh = new Mesh(new BoxGeometry(...row.size), material(row.color));
      mesh.position.set(...row.position);
      parent.add(castsAndReceives(mesh));
    }
  };
  boxes(look.panel, group);
  const labelMesh = (label: Look['labels'][number]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.max(1, Math.round((canvas.width * label.size[1]) / label.size[0]));
    const context = canvas.getContext('2d')!;
    context.fillStyle = label.color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `${canvas.height}px sans-serif`;
    context.fillText(label.text, canvas.width / 2, canvas.height / 2, canvas.width);
    const texture = new CanvasTexture(canvas);
    textures.push(texture);
    const mesh = new Mesh(
      new PlaneGeometry(...label.size),
      withHeightFog(new MeshLambertMaterial({ map: texture, transparent: true }), 'furniture'),
    );
    mesh.position.set(...label.position);
    mesh.rotation.y = Math.PI;
    return mesh;
  };
  for (const label of look.labels) {
    group.add(labelMesh(label));
  }
  const run = new Mesh(new SphereGeometry(1), material(look.run.color));
  run.name = 'run';
  run.position.set(...look.run.position);
  run.scale.set(...(look.run.size.map((value) => value / 2) as [number, number, number]));
  run.material.emissive.set(look.run.color);
  group.add(run);
  const { dial } = look;
  for (const [index, degrees] of dial.steps.entries()) {
    const word = dial.tickBands[String(index)];
    const color = index === dial.stoppedStep ? dial.stoppedColor : bands.find((band) => band.word === word)!.color;
    // The face looks toward -Z, so its viewer's right is local -X.
    const position: Look['dial']['pivot'] = [
      dial.pivot[0] - Math.sin(radians(degrees)) * dial.tickRadius,
      dial.pivot[1] + Math.cos(radians(degrees)) * dial.tickRadius,
      dial.pivot[2] + dial.tickDepth,
    ];
    const symbol = dial.symbols?.[String(index)];
    const tick = symbol
      ? labelMesh({ text: symbol, position, size: [dial.tickSize[0], dial.tickSize[1]], color })
      : new Mesh(new BoxGeometry(...dial.tickSize), material(color));
    tick.name = `tick:${index}`;
    tick.position.set(...position);
    if (!symbol) {
      tick.rotation.z = radians(degrees);
    }
    group.add(tick);
  }
  const pin = new Group();
  pin.name = 'pin';
  pin.position.set(...dial.pivot);
  boxes(dial.pin, pin);
  group.add(pin);
  const flags = look.flags.map((flag) => {
    const raised = new Group();
    const dropped = new Group();
    raised.name = `slot:${flag.slot}:raised`;
    dropped.name = `slot:${flag.slot}:dropped`;
    boxes(flag.raised, raised);
    boxes(flag.dropped, dropped);
    group.add(raised, dropped);
    return { slot: flag.slot, raised, dropped };
  });
  return {
    group,
    run,
    pin,
    flags,
    update(reading: Reading, time: number) {
      run.material.emissiveIntensity = reading.producing ? look.run.emissive : 0;
      const step = reading.producing ? dial.bands[reading.band!.word]! : dial.stoppedStep;
      const sway = reading.producing
        ? Math.sin((time * 2 * Math.PI) / dial.swayPeriodSimSeconds) * dial.swayAmplitudeDegrees
        : 0;
      pin.rotation.z = radians(dial.steps[step]! + sway);
      for (const flag of flags) {
        const failed = reading.failures.some(({ slot }) => slot === flag.slot);
        flag.raised.visible = !failed;
        flag.dropped.visible = failed;
      }
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshLambertMaterial).dispose();
        }
      });
      for (const texture of textures) {
        texture.dispose();
      }
      group.clear();
    },
  };
}

export class PlantInstruments {
  readonly group = new Group();
  private readonly entries = new Map<BlockEntity, ReturnType<typeof createPlantInstrument>>();
  private entities: BlockEntities | undefined;
  private drawn = -1;

  private readonly blockSize: number;
  private readonly bands: readonly ConditionBand[];
  private readonly reveal: ColumnReveal | undefined;

  constructor(blockSize: number, bands: readonly ConditionBand[], reveal?: ColumnReveal) {
    this.group.name = 'plant-instruments';
    this.blockSize = blockSize;
    this.bands = bands;
    this.reveal = reveal;
  }

  sync(entities: BlockEntities, read: (entity: BlockEntity) => Reading | undefined, time: number): void {
    if (this.entities !== entities) {
      this.dispose();
      this.entities = entities;
    }
    const changes = entities.standingChangesSince(this.drawn) ?? entities.all;
    this.drawn = entities.standing;
    for (const entity of changes) {
      this.restage(entities, entity);
    }
    for (const [entity, instrument] of this.entries) {
      const reading = read(entity);
      instrument.group.visible =
        reading !== undefined && (this.reveal?.isRevealed(entity.pos[0], entity.pos[2]) ?? true);
      if (reading) {
        instrument.update(reading, time);
      }
    }
  }

  private restage(entities: BlockEntities, entity: BlockEntity): void {
    const look = entities.defOf(entity).power?.instruments;
    const kept = this.entries.get(entity);
    if (!(look && entities.stands(entity))) {
      if (kept) {
        this.group.remove(kept.group);
        kept.dispose();
        this.entries.delete(entity);
      }
      return;
    }
    const instrument = kept ?? createPlantInstrument(look, this.bands);
    instrument.group.name = `plant-instrument:${entity.uid}`;
    if (!kept) {
      this.entries.set(entity, instrument);
      this.group.add(instrument.group);
    }
    const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
    instrument.group.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
    instrument.group.scale.setScalar(this.blockSize);
    const def = entities.defOf(entity);
    const local = look.offset.map((value, axis) => value + 0.5 - def.size[axis]! / 2) as [number, number, number];
    const offset = new Vector3(...local).applyQuaternion(instrument.group.quaternion);
    instrument.group.position.set(
      ...(entity.pos.map((value, axis) => (value + entity.size[axis]! / 2) * this.blockSize) as [
        number,
        number,
        number,
      ]),
    );
    instrument.group.position.addScaledVector(offset, this.blockSize);
  }

  dispose(): void {
    for (const instrument of this.entries.values()) {
      instrument.dispose();
    }
    this.entries.clear();
    this.group.clear();
    this.drawn = -1;
  }
}
