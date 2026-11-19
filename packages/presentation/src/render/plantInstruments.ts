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
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { anchorTurn } from './slotSockets.ts';

type Look = NonNullable<NonNullable<FurnitureDef['power']>['instruments']>;
type Reading = NonNullable<ReturnType<SitePower['instruments']>>;
type Box = Look['panel'][number];
type SlotAnchor = NonNullable<FurnitureDef['slotAnchors']>[number];
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Places a slot's flag on its anchor's mount, in the frame of the panel that stands at `offset`. */
const mountFlag = (frame: Group, { position, orientationDegrees, flagMount }: SlotAnchor, offset: Look['offset']) => {
  const anchor = anchorTurn(orientationDegrees);
  frame.quaternion.copy(anchor).multiply(anchorTurn(flagMount!.orientationDegrees));
  frame.position
    .set(...flagMount!.position)
    .applyQuaternion(anchor)
    .add(new Vector3(...position))
    .sub(new Vector3(...offset));
};

/**
 * Geometry is content; this owner only selects the owner's reading and decorates its selected detent. With `anchors`,
 * each slot's flag stands on its anchor's flag mount; without them, on the panel.
 */
export function createPlantInstrument(look: Look, bands: readonly ConditionBand[], anchors?: readonly SlotAnchor[]) {
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
    const frame = new Group();
    const anchor = anchors?.find(({ slot }) => slot === flag.slot);
    if (anchor) {
      mountFlag(frame, anchor, look.offset);
    }
    const raised = new Group();
    const dropped = new Group();
    raised.name = `slot:${flag.slot}:raised`;
    dropped.name = `slot:${flag.slot}:dropped`;
    boxes(flag.raised, raised);
    boxes(flag.dropped, dropped);
    frame.add(raised, dropped);
    group.add(frame);
    return { slot: flag.slot, raised, dropped };
  });
  const pose = (name: string, rows: readonly Box[]) => {
    const posed = new Group();
    posed.name = name;
    boxes(rows, posed);
    group.add(posed);
    return posed;
  };
  const switchPoses = look.switch && {
    on: pose('switch:on', look.switch.on),
    off: pose('switch:off', look.switch.off),
  };
  return {
    group,
    run,
    pin,
    flags,
    update(reading: Reading, time: number) {
      if (switchPoses) {
        switchPoses.on.visible = reading.enabled;
        switchPoses.off.visible = !reading.enabled;
      }
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

/** A model drawn away from the world; `dispose` frees what the depiction built, never what it borrowed. */
export interface Depiction {
  readonly model: Object3D;
  readonly dispose: () => void;
}

interface Staged {
  readonly instrument: ReturnType<typeof createPlantInstrument>;
  /** As the last `sync` read it; none hides the instrument. */
  reading: Reading | undefined;
}

export class PlantInstruments {
  readonly group = new Group();
  private readonly entries = new Map<BlockEntity, Staged>();
  private entities: BlockEntities | undefined;
  private drawn = -1;
  private syncedSimSeconds = 0;

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
    this.syncedSimSeconds = time;
    for (const [entity, staged] of this.entries) {
      staged.reading = read(entity);
      staged.instrument.group.visible =
        staged.reading !== undefined && (this.reveal?.isRevealed(entity.pos[0], entity.pos[2]) ?? true);
      if (staged.reading) {
        staged.instrument.update(staged.reading, time);
      }
    }
  }

  /**
   * `piece`, drawn away from the world as it stands there, with instruments of its own showing the reading the last
   * `sync` showed, so the world's later readings leave the depiction as drawn. `piece` stays its owner's.
   */
  depicted(entity: BlockEntity, piece: Object3D): Depiction {
    const reading = this.entries.get(entity)?.reading;
    if (!reading) {
      return { model: piece, dispose: () => undefined };
    }
    const def = this.entities!.defOf(entity);
    const look = def.power!.instruments!;
    const instrument = createPlantInstrument(look, this.bands, def.slotAnchors);
    this.place(instrument.group, entity, def, look);
    instrument.update(reading, this.syncedSimSeconds);
    return { model: new Group().add(piece, instrument.group), dispose: () => instrument.dispose() };
  }

  private restage(entities: BlockEntities, entity: BlockEntity): void {
    const def = entities.defOf(entity);
    const look = def.power?.instruments;
    const kept = this.entries.get(entity)?.instrument;
    if (!(look && entities.stands(entity))) {
      if (kept) {
        this.group.remove(kept.group);
        kept.dispose();
        this.entries.delete(entity);
      }
      return;
    }
    const instrument = kept ?? createPlantInstrument(look, this.bands, def.slotAnchors);
    instrument.group.name = `plant-instrument:${entity.uid}`;
    if (!kept) {
      this.entries.set(entity, { instrument, reading: undefined });
      this.group.add(instrument.group);
    }
    this.place(instrument.group, entity, def, look);
  }

  private place(group: Group, entity: BlockEntity, def: FurnitureDef, look: Look): void {
    housingFrame(entity, def, this.blockSize)
      .multiply(new Matrix4().makeTranslation(...look.offset))
      .decompose(group.position, group.quaternion, group.scale);
  }

  dispose(): void {
    for (const { instrument } of this.entries.values()) {
      instrument.dispose();
    }
    this.entries.clear();
    this.group.clear();
    this.drawn = -1;
  }
}

/** The world transform of a housing's own frame, where instrument looks and slot anchors stand. */
export const housingFrame = (entity: BlockEntity, def: FurnitureDef, blockSize: number): Matrix4 => {
  const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
  const origin = new Vector3()
    .fromArray(def.size.map((size) => 0.5 - size / 2))
    .applyQuaternion(rotation)
    .add(new Vector3().fromArray(entity.pos.map((value, axis) => value + entity.size[axis]! / 2)))
    .multiplyScalar(blockSize);
  return new Matrix4().compose(origin, rotation, new Vector3().setScalar(blockSize));
};
