// The page side of `tools/building-sheet.mjs`: plans a building's or a whole site's sheet views from its
// placements and poses the game's own view for each. Why: `docs/building-sheet.md`.

import { formatClock } from '@skelly/engine/internal/core/clock.ts';
import { footprint, type Placement, placedPoint } from '@skelly/engine/internal/core/templates.ts';
import { LOOK_PITCH_LIMIT } from '@skelly/engine/internal/game/playerControls.ts';
import { CHUNK, compassBearing, toChunk, type Vec3 } from '@skelly/engine/world';
import { IDLE_REFRESH_EVERY } from '@skelly/presentation/internal/render/shadows.ts';
import { type Material, type Object3D, Plane, Vector3 } from 'three';
import { camValue } from '../../src/debug/camUrl.ts';
import { type Variants, variantSeed } from './buildingSheetVariants.ts';
import { type PlayTestHandle, renderedEngine } from './playTestHandle.ts';

/** A plan cuts this far above its storey's floor, through doors and windows, as an architect's plan does. */
export const PLAN_CUT_M = 1.25;
/** The clip box's reach past the building, so the ground it stands on and its eaves stay in the shot. */
const CLIP_MARGIN_M = 1;
/** How far the roofline view looks down: enough to see the whole roof without losing the walls. */
const ROOFLINE_PITCH = (40 * Math.PI) / 180;
/** The share of the frame's half-width a framed building may fill, leaving a border round it. */
const FRAME_FILL = 0.9;
/** The plan's look: as steep as the game's pitch clamp allows. */
const PLAN_PITCH = -LOOK_PITCH_LIMIT;
/** A plan without declared storeys has one, named for the file it lands in. */
const GROUND_STOREY = 'ground';
// The sun's map redraws at least every IDLE_REFRESH_EVERY frames, so one more still frame shows current shadows.
const SETTLED_FRAMES = IDLE_REFRESH_EVERY + 1;
const SKY_MESHES = new Set(['skyDome', 'openSky']);
/** How far in front of the building the player stands while the sheet streams it in. */
const STAND_OFF_M = 2;
/** A column remeshes when a neighbour arrives, so a clipped view waits for one ring of columns past its box. */
const KEEP_NEIGHBOUR_RING = 1;

/** The placement's world box in metres; `grade` is the ground floor's standing level. */
export interface BuildingBox {
  readonly min: Vec3;
  readonly max: Vec3;
  readonly grade: number;
}

/** The view camera's vertical field of view, aspect and near plane. */
export interface Lens {
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
}

/** A spectator pose: the eye in metres, and yaw and pitch in radians as the game's look controls hold them. */
export interface Pose {
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
}

/** The world region a view keeps; everything outside it is clipped. */
export interface KeepBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface SheetView {
  readonly file: string;
  readonly title: string;
  /** What the view shows and from which world direction, for its caption. */
  readonly direction: string;
  readonly pose: Pose;
  readonly keep?: KeepBox;
}

export interface SheetStorey {
  readonly id: string;
  /** The storey's standing level in metres. */
  readonly feet: number;
}

type Direction = readonly [number, number];

/** What one sheet draws: a placement, or several a site places, seen as one box with a front. */
export interface SheetSubject {
  readonly box: BuildingBox;
  /** The world direction the front looks out along: the face a player walks up to. */
  readonly front: Direction;
  /** The world direction the side elevation's face looks out along, a quarter turn from the front. */
  readonly side: Direction;
  readonly storeys: readonly SheetStorey[];
}

export const buildingBox = (placement: Placement, blockSize: number): BuildingBox => {
  const [width, depth] = footprint(placement);
  const [x, y, z] = placement.origin;
  const { size, groundLayer = 0 } = placement.template;
  return {
    min: [x * blockSize, y * blockSize, z * blockSize],
    max: [(x + width) * blockSize, (y + size[1]) * blockSize, (z + depth) * blockSize],
    grade: (y + groundLayer + 1) * blockSize,
  };
};

/** A template-local horizontal direction turned into the world, as the placement turns its cells. */
const placedDirection = (placement: Placement, [dx, dz]: Direction): [number, number] => {
  const from = placedPoint(placement, [0, 0, 0]);
  const to = placedPoint(placement, [dx, 0, dz]);
  return [to[0] - from[0], to[2] - from[2]];
};

const unit = ([x, z]: Direction): [number, number] => {
  const length = Math.hypot(x, z);
  return [x / length, z / length];
};

/**
 * One placement on its own. The front is the side the template's local z = 0 row faces, turned with the placement;
 * the side is its local +x side. A template without declared storeys has one plan, on its ground floor.
 */
export const placementSubject = (placement: Placement, blockSize: number): SheetSubject => {
  const { access, groundLayer = 0 } = placement.template;
  const storeys = access ? access.storeys : [{ id: GROUND_STOREY, floor: groundLayer + 1 }];
  return {
    box: buildingBox(placement, blockSize),
    front: unit(placedDirection(placement, [0, -1])),
    side: unit(placedDirection(placement, [1, 0])),
    storeys: storeys.map(({ id, floor }) => ({ id, feet: (placement.origin[1] + floor) * blockSize })),
  };
};

/**
 * Several placements as one site: the box round them all, fronted on the side the player starts, since a site
 * puts its approach there, with one plan at the lowest ground floor.
 */
export const siteSubject = (placements: readonly Placement[], blockSize: number, spawn: Vec3): SheetSubject => {
  const boxes = placements.map((placement) => buildingBox(placement, blockSize));
  const bound = (pick: (box: BuildingBox) => Vec3, extreme: (...values: number[]) => number): Vec3 => {
    const [x, y, z] = [0, 1, 2].map((axis) => extreme(...boxes.map((each) => pick(each)[axis]!)));
    return [x!, y!, z!];
  };
  const box = {
    min: bound(({ min }) => min, Math.min),
    max: bound(({ max }) => max, Math.max),
    grade: Math.min(...boxes.map(({ grade }) => grade)),
  };
  const [tx, tz] = [spawn[0] - (box.min[0] + box.max[0]) / 2, spawn[2] - (box.min[2] + box.max[2]) / 2];
  // The nearest axis, so the elevations stand square to a site laid out on the grid.
  const front: Direction = Math.abs(tx) > Math.abs(tz) ? [Math.sign(tx), 0] : [0, Math.sign(tz) || -1];
  return { box, front, side: [-front[1], front[0]], storeys: [{ id: GROUND_STOREY, feet: box.grade }] };
};

const WINDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

/** The compass word for where a camera at `yaw` looks. */
const lookingWind = (yaw: number): string => WINDS[Math.round(compassBearing(yaw) / 45) % WINDS.length]!;

/** The compass word for a face that looks out along `direction`. */
const faceName = ([x, z]: Direction): string => lookingWind(Math.atan2(-x, -z));

/** The camera's forward, right and up axes, matching the game's YXZ look rotation. */
const axes = (yaw: number, pitch: number) => {
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  return {
    forward: [-sy * cp, sp, -cy * cp] as const,
    right: [cy, 0, -sy] as const,
    up: [sy * sp, cp, cy * sp] as const,
  };
};

const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

/** Whether every point lands inside the framed part of the picture. */
export const frames = ({ eye, yaw, pitch }: Pose, points: readonly Vec3[], lens: Lens): boolean => {
  const { forward, right, up } = axes(yaw, pitch);
  const halfHeight = Math.tan((lens.fovDeg * Math.PI) / 360);
  return points.every((point) => {
    const offset = point.map((value, i) => value - eye[i]!);
    const depth = dot(offset, forward);
    return (
      depth > lens.near &&
      Math.abs(dot(offset, right)) <= FRAME_FILL * depth * halfHeight * lens.aspect &&
      Math.abs(dot(offset, up)) <= FRAME_FILL * depth * halfHeight
    );
  });
};

/** The nearest pose along `at(distance)` that frames every point. */
const framed = (at: (distance: number) => Pose, points: readonly Vec3[], lens: Lens): Pose => {
  let far = 1;
  while (!frames(at(far), points, lens)) {
    far *= 2;
    if (far > 1e6) {
      throw new Error('No camera distance frames the building');
    }
  }
  let near = 0;
  for (let step = 0; step < 40; step++) {
    const middle = (near + far) / 2;
    [near, far] = frames(at(middle), points, lens) ? [near, middle] : [middle, far];
  }
  return at(far);
};

const corners = (min: Vec3, max: Vec3): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => [
    corner & 1 ? max[0] : min[0],
    corner & 2 ? max[1] : min[1],
    corner & 4 ? max[2] : min[2],
  ]);

const keepAround = ({ min, max }: BuildingBox, top = max[1] + CLIP_MARGIN_M): KeepBox => ({
  min: [min[0] - CLIP_MARGIN_M, min[1] - CLIP_MARGIN_M, min[2] - CLIP_MARGIN_M],
  max: [max[0] + CLIP_MARGIN_M, top, max[2] + CLIP_MARGIN_M],
});

export interface SheetOptions {
  readonly blockSize: number;
  readonly lens: Lens;
  /** The player's eye height, which the street view stands at. */
  readonly eyeHeightM: number;
}

/**
 * The sheet's views of a subject: front, side and back elevations, a street-level three-quarter view, a roofline
 * view and one plan per storey.
 */
export const sheetViews = (
  { box, front, side, storeys }: SheetSubject,
  { blockSize, lens, eyeHeightM }: SheetOptions,
): SheetView[] => {
  const { min, max, grade } = box;
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  // Elevations show the building from its support layer up; a cellar stays in the ground.
  const above = corners([min[0], grade - blockSize, min[2]], max);
  const keep = keepAround(box);
  const elevation = (file: string, title: string, outward: Direction): SheetView => {
    const [ox, oz] = outward;
    const middle = (grade - blockSize + max[1]) / 2;
    const yaw = Math.atan2(ox, oz);
    const pose = framed(
      (distance) => ({ eye: [centre[0] + ox * distance, middle, centre[2] + oz * distance], yaw, pitch: 0 }),
      above,
      lens,
    );
    return { file, title, direction: `the ${faceName(outward)} face, looking ${lookingWind(yaw)}`, pose, keep };
  };
  const diagonal = ([ax, az]: Direction, [bx, bz]: Direction) => unit([ax + bx, az + bz]);
  const [sx, sz] = diagonal(front, side);
  const eyeY = grade + eyeHeightM;
  const street = framed(
    (distance) => ({
      eye: [centre[0] + sx * distance, eyeY, centre[2] + sz * distance],
      yaw: Math.atan2(sx, sz),
      pitch: Math.atan2(centre[1] - eyeY, distance),
    }),
    corners(min, max),
    lens,
  );
  const [rx, rz] = diagonal([-front[0], -front[1]], [-side[0], -side[1]]);
  const roofline = framed(
    (distance) => ({
      eye: [
        centre[0] + rx * Math.cos(ROOFLINE_PITCH) * distance,
        centre[1] + Math.sin(ROOFLINE_PITCH) * distance,
        centre[2] + rz * Math.cos(ROOFLINE_PITCH) * distance,
      ],
      yaw: Math.atan2(rx, rz),
      pitch: -ROOFLINE_PITCH,
    }),
    corners(min, max),
    lens,
  );
  const frontYaw = Math.atan2(front[0], front[1]);
  const frontFace = faceName(front);
  const plans = storeys.map(({ id, feet }): SheetView => {
    const cut = feet + PLAN_CUT_M;
    const { forward } = axes(frontYaw, PLAN_PITCH);
    const pose = framed(
      (distance) => ({
        eye: [centre[0] - forward[0] * distance, feet - forward[1] * distance, centre[2] - forward[2] * distance],
        yaw: frontYaw,
        pitch: PLAN_PITCH,
      }),
      corners([min[0], feet - blockSize, min[2]], [max[0], cut, max[2]]),
      lens,
    );
    return {
      file: `plan-${id}.png`,
      title: `Plan of storey ${id}`,
      direction: `cut ${PLAN_CUT_M} m above its floor, looking down with the ${frontFace} face at the bottom`,
      pose,
      keep: keepAround(box, cut),
    };
  });
  return [
    elevation('front.png', 'Front elevation', front),
    elevation('side.png', 'Side elevation', side),
    elevation('back.png', 'Back elevation', [-front[0], -front[1]]),
    {
      file: 'street.png',
      title: 'Street view',
      direction: `three-quarter view at eye height in its surroundings, looking ${lookingWind(street.yaw)}`,
      pose: street,
    },
    {
      file: 'roofline.png',
      title: 'Roofline',
      direction: `three-quarter view from above the back corner, looking ${lookingWind(roofline.yaw)} and down`,
      pose: roofline,
      keep,
    },
    ...plans,
  ];
};

/** One sheet a request draws: the placements it shows, by their index on the site, and the folder it lands in. */
export interface SheetPart {
  /** Empty when the request draws only this sheet. */
  readonly folder: string;
  readonly placements: readonly number[];
  /** The template or assembly ids it shows, in placement order. */
  readonly names: readonly string[];
}

const sitePlacements = ({ engine }: PlayTestHandle): readonly Placement[] => engine.site?.authoredPlacements ?? [];

const subjectOf = (handle: PlayTestHandle, placements: readonly number[]): SheetSubject => {
  const shown = placements.map((index) => sitePlacements(handle)[index]!);
  const { config, site } = handle.engine;
  return shown.length === 1
    ? placementSubject(shown[0]!, config.scale.blockSize)
    : siteSubject(shown, config.scale.blockSize, site!.spawn.pos);
};

/**
 * The sheets a request draws on the page's site: every placement of `id`, or without an id the whole site and then
 * each placement on its own. The error lists the ids the site places.
 */
export const sheetParts = (handle: PlayTestHandle, id: string | undefined): SheetPart[] => {
  const placements = sitePlacements(handle);
  const { site } = handle.engine.config;
  const own = (index: number): SheetPart => {
    const name = placements[index]!.template.id;
    return { folder: `${index}-${name}`, placements: [index], names: [name] };
  };
  if (id === undefined) {
    if (placements.length === 0) {
      throw new Error(`The site ${site} places no buildings`);
    }
    const whole: SheetPart = {
      folder: 'site',
      placements: placements.map((_, index) => index),
      names: placements.map(({ template }) => template.id),
    };
    return [whole, ...placements.map((_, index) => own(index))];
  }
  const indices = placements.flatMap(({ template }, index) => (template.id === id ? [index] : []));
  if (indices.length === 0) {
    const ids = [...new Set(placements.map(({ template }) => template.id))].sort();
    throw new Error(`The site ${site} places no ${id}; it places ${ids.join(', ') || 'no buildings'}`);
  }
  return indices.length === 1 ? [{ ...own(indices[0]!), folder: '' }] : indices.map(own);
};

/** How many seeds past the page's own the variant search tries before it gives up. */
const VARIANT_SEEDS = 4096;

/** The first of `seeds` that draws `variants` in every placement the parts show; the error says why there is none. */
const variantsSeed = (
  handle: PlayTestHandle,
  parts: readonly SheetPart[],
  variants: Variants,
  seeds: readonly number[],
): number | undefined => {
  const { registry, config } = handle.engine;
  // Only an authored layout places its buildings the same way at every seed, so only there does a seed choose
  // nothing but the draws.
  const layout = registry.layouts.get(config.site);
  if (!layout) {
    throw new Error(`Slot variants need a layout site; ${config.site} is generated, not a layout`);
  }
  const placements = [...new Set(parts.flatMap((part) => part.placements))];
  // A layout's showroom slot, placed after its buildings, has no slots of its own to draw.
  const indices = placements.filter((index) => index < layout.buildings.length);
  return variantSeed(registry, { layout, indices, variants, seeds });
};

/** The page's own seed first, so a sheet keeps it when it already draws the variants. */
const searchedSeeds = (own: number): number[] => [
  own,
  ...Array.from({ length: VARIANT_SEEDS }, (_, at) => at + 1).filter((seed) => seed !== own),
];

/**
 * A `cam` hash value that stands the player just outside the subject's front, facing it, so a reload streams it in
 * around the body.
 */
const camBeside = ({ box: { min, max, grade }, front: [fx, fz] }: SheetSubject): number[] => {
  const reach = Math.abs(fx * (max[0] - min[0])) / 2 + Math.abs(fz * (max[2] - min[2])) / 2 + STAND_OFF_M;
  const position: Vec3 = [(min[0] + max[0]) / 2 + fx * reach, grade, (min[2] + max[2]) / 2 + fz * reach];
  return camValue({ position, yaw: Math.atan2(fx, fz), pitch: 0, roll: 0 });
};

/**
 * What the scout page learns before the sheets are drawn: the sheets, where to stand for each, and, when variants
 * are chosen, the seed that draws them.
 */
export const scoutSheet = (handle: PlayTestHandle, id: string | undefined, variants: Variants | undefined) => {
  const parts = sheetParts(handle, id);
  const seed = variants && variantsSeed(handle, parts, variants, searchedSeeds(handle.engine.config.seed));
  if (variants && seed === undefined) {
    throw new Error(`No seed up to ${VARIANT_SEEDS} draws ${JSON.stringify(variants)} in every building drawn`);
  }
  return { parts: parts.map((part) => ({ ...part, cam: camBeside(subjectOf(handle, part.placements)) })), seed };
};

/** The variants a request chose and every part it draws, which the scout searched together. */
export interface ChosenVariants {
  readonly variants: Variants;
  readonly parts: readonly SheetPart[];
}

/**
 * The sheet's views of one part on the page's site, with the facts its captions name. With `chosen`, the page's own
 * seed must draw them, so a lost seed fails rather than drawing other variants.
 */
export const planSheet = (handle: PlayTestHandle, part: SheetPart, chosen: ChosenVariants | undefined) => {
  const { engine, session } = handle;
  const { camera, config } = engine;
  const variants = chosen?.variants;
  if (chosen && variantsSeed(handle, chosen.parts, chosen.variants, [config.seed]) === undefined) {
    throw new Error(`The page's seed ${config.seed} does not draw ${JSON.stringify(variants)}`);
  }
  const views = sheetViews(subjectOf(handle, part.placements), {
    blockSize: config.scale.blockSize,
    lens: { fovDeg: camera.fov, aspect: camera.aspect, near: camera.near },
    eyeHeightM: session.playerEyeHeightMetres,
  });
  return { views, site: config.site, seed: config.seed, clock: formatClock(session.sim.calendar) };
};

/** The active clip: its planes, and each clipped material's own clipping to put back. */
interface Clip {
  readonly planes: Plane[];
  readonly saved: Map<Material, Pick<Material, 'clippingPlanes' | 'clipShadows'>>;
}

let clip: Clip | undefined;

/** Clips every material in the scene but the sky's that the active clip doesn't hold yet. */
const clipMaterials = (scene: Object3D): void => {
  if (!clip) {
    return;
  }
  const { planes, saved } = clip;
  scene.traverse((object) => {
    if (SKY_MESHES.has(object.name) || !('material' in object)) {
      return;
    }
    const materials = [object.material].flat() as Material[];
    for (const material of materials) {
      if (!saved.has(material)) {
        saved.set(material, { clippingPlanes: material.clippingPlanes, clipShadows: material.clipShadows });
        Object.assign(material, { clippingPlanes: planes, clipShadows: true, needsUpdate: true });
      }
    }
  });
};

/** Clips every material but the sky's to `keep`, until the next call. */
const clipTo = (scene: Object3D, keep: KeepBox | undefined): void => {
  for (const [material, before] of clip?.saved ?? []) {
    Object.assign(material, before, { needsUpdate: true });
  }
  clip = keep && {
    planes: [0, 1, 2].flatMap((axis) => {
      const normal = new Vector3().setComponent(axis, 1);
      return [new Plane(normal, -keep.min[axis]!), new Plane(normal.clone().negate(), keep.max[axis]!)];
    }),
    saved: new Map(),
  };
  clipMaterials(scene);
};

/** The chunk columns a view of `keep` draws, with the ring round them. */
const keptColumns = (keep: KeepBox, blockSize: number): [number, number][] => {
  const span = (axis: 0 | 2) => [
    toChunk(Math.floor(keep.min[axis] / blockSize)) - KEEP_NEIGHBOUR_RING,
    toChunk(Math.floor(keep.max[axis] / blockSize)) + KEEP_NEIGHBOUR_RING,
  ];
  const [x0, x1] = span(0);
  const [z0, z1] = span(2);
  const columns: [number, number][] = [];
  for (let cz = z0!; cz <= z1!; cz++) {
    for (let cx = x0!; cx <= x1!; cx++) {
      columns.push([cx, cz]);
    }
  }
  return columns;
};

/**
 * Whether what the view draws is in its final state this frame. A clipped view draws only its kept columns, so
 * those the game meshes must be meshed and revealed; an unclipped view draws the world, so it waits for the game's
 * own settled view.
 */
const drawnFinal = ({ engine, session, worldLoading }: PlayTestHandle, keep: KeepBox | undefined): boolean => {
  if (!keep) {
    return worldLoading.viewSettled;
  }
  const { streamer, meshes, config } = engine;
  const [bodyX, , bodyZ] = session.body.pos;
  const columns = keptColumns(keep, config.scale.blockSize);
  // The game meshes only columns within the view radius of the body, so a kept column past it stays empty.
  return (
    streamer.unmeshedRecordedColumns(bodyX, bodyZ, columns) === 0 &&
    columns.every(([cx, cz]) => {
      const [x, z] = [cx * CHUNK, cz * CHUNK];
      return streamer.unmeshedColumns(x, z, 0) > 0 || meshes.isRevealed(x, z);
    })
  );
};

/** Resolves once the view has drawn SETTLED_FRAMES frames in which what it shows was final. */
const settled = (handle: PlayTestHandle, keep: KeepBox | undefined): Promise<void> =>
  new Promise((done) => {
    const { scene } = handle.engine;
    let still = 0;
    const tick = () => {
      // Columns keep arriving outside a clipped view, and a new mesh may bring a material of its own.
      clipMaterials(scene);
      const quiet = drawnFinal(handle, keep);
      still = quiet ? still + 1 : 0;
      if (still >= SETTLED_FRAMES) {
        done();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

/** Hides the avatar and detaches the camera, so the views fly free of the player. */
export const enterSheet = (handle: PlayTestHandle): void => {
  const { spectator, session, input, view } = handle;
  view.playerMeshes.group.visible = false;
  if (!spectator.enabled) {
    spectator.toggle(session.body, handle.eye(), input.controls.yaw, input.controls.pitch);
  }
};

/** Poses the view, clips the scene to the view's box and waits until the drawn frame shows both. */
export const showView = async (handle: PlayTestHandle, { pose, keep }: SheetView): Promise<void> => {
  const engine = renderedEngine(handle.engine);
  const { spectator, input } = handle;
  const flight = spectator.body;
  if (!flight) {
    throw new Error('The sheet camera is not detached; call enterSheet first');
  }
  const s = engine.config.scale.blockSize;
  flight.pos = [pose.eye[0] / s, pose.eye[1] / s, pose.eye[2] / s];
  input.controls.yaw = pose.yaw;
  input.controls.pitch = pose.pitch;
  clipTo(engine.scene, keep);
  await engine.renderer.compileAsync(engine.scene, engine.camera);
  await settled(handle, keep);
};

/** Puts back the materials' clipping and the camera, and shows the avatar again. */
export const leaveSheet = (handle: PlayTestHandle): void => {
  clipTo(handle.engine.scene, undefined);
  const { spectator, session, input, view } = handle;
  if (spectator.enabled) {
    spectator.toggle(session.body, handle.eye(), input.controls.yaw, input.controls.pitch);
  }
  view.playerMeshes.group.visible = true;
};
