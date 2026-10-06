import { calibreSlug } from '../ammo/calibreSlug.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import type { AppearanceContext, GlbAssetIdentity, GlbExportError, GlbExportResult } from '../core/design.ts';
import { exportGlb } from '../core/glb.ts';
import { length, type Vec3 } from '../core/math.ts';
import { type Resolved, resolve } from '../core/resolve.ts';
import type { Assembly } from '../core/schema.ts';
import { resolveGunAction } from './actionDescription.ts';
import { GUN_ANCHORS } from './anchorData.ts';
import { type AnchorSelectionError, GUN_ANCHOR_POLICY, type SelectedAnchors, selectGunAnchors } from './anchors.ts';
import type { CycleMode, CycleTimeline } from './cycle.ts';
import { gunDomain } from './domain.ts';
import { gripTurn, toFileAxes } from './exportFrame.ts';
import { GUN_PALETTE } from './palette.ts';
import { tubeMagazineCapacity } from './tubeCapacity.ts';

export type DeadvoxModelFile = `assets/models/${string}.glb`;

interface ActionPartMetadata {
  /** Exact glTF node name; the existing part node carries its geometry as a separate mesh. */
  readonly node: string;
  /** Unit travel direction in model coordinates. */
  readonly axis: Vec3;
  /** Carrier stroke length in metres. */
  readonly strokeMetres: number;
  /** Shared timelines this node follows; other modes leave it at home. */
  readonly modes: readonly CycleMode[];
}

interface CycleMetadata {
  readonly durationSeconds: number;
  readonly rearwardSeconds: number;
  readonly dwellSeconds: number;
  readonly forwardSeconds: number;
}

interface GunActionMetadata {
  readonly parts: Readonly<Record<string, ActionPartMetadata>>;
  readonly fire?: CycleMetadata;
  readonly hand: CycleMetadata;
  /** Stroke fraction at which the case leaves. */
  readonly ejectAt: number;
  /** Unit ejection direction in model coordinates. */
  readonly ejectDirection: Vec3;
  readonly holdOpen: boolean;
  readonly rpm?: number;
}

export interface DeadvoxModelEntry {
  readonly id: string;
  readonly file: DeadvoxModelFile;
  readonly grip?: { readonly at: Vec3; readonly turn: Vec3 };
  readonly anchors?: Readonly<Record<string, Vec3>>;
  /** Exact id from gungen/cartridges/, not a slug or display designation. */
  readonly calibre?: string;
  /** Present on magazine entries; one local pose per round slot, top to bottom. */
  readonly capacity?: number;
  /** Integral tube capacity in shells; unlike a detached box magazine, no round-pose column. */
  readonly tube?: { readonly capacity: number };
  readonly rounds?: readonly { readonly at: Vec3; readonly tilt: number }[];
  readonly action?: GunActionMetadata;
}

export interface GunDeadvoxModelEntry extends DeadvoxModelEntry {
  readonly grip: { readonly at: Vec3; readonly turn: Vec3 };
}

export interface GunExportMetadata {
  /** Cartridge loaded by this design; its id becomes the exact Deadvox `calibre` value. */
  readonly cartridge?: Cartridge;
}

interface GunModelEntryOptions extends GunExportMetadata {
  readonly handling?: GunActionExport;
  readonly tubeCapacity?: number;
}

export type GunAssetIdentity = GlbAssetIdentity;

export type GunExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: GunDeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError | AnchorSelectionError };

const round6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

const modelPoint = (point: Vec3, metresPerUnit: number): Vec3 => {
  const [x, y, z] = toFileAxes(point);
  return [round6(x * metresPerUnit), round6(y * metresPerUnit), round6(z * metresPerUnit)];
};

interface GunActionExport {
  readonly ejection: Vec3;
  readonly action: GunActionMetadata;
}

const cycleMetadata = (cycle: CycleTimeline): CycleMetadata => ({
  durationSeconds: cycle.durationSeconds,
  rearwardSeconds: cycle.rearwardSeconds,
  dwellSeconds: cycle.dwellSeconds,
  forwardSeconds: cycle.forwardSeconds,
});

const buildActionExport = (resolved: Resolved): GunActionExport | undefined => {
  const description = resolveGunAction(resolved);
  const cycle = description?.cycle;
  if (!(description?.ejection && cycle)) {
    return undefined;
  }
  const parts = Object.fromEntries(
    Object.entries(description.parts).map(([role, part]) => [
      role,
      {
        node: part.node,
        axis: toFileAxes(part.axis),
        strokeMetres: round6(length(part.travel) * resolved.domain.units.metresPerUnit),
        modes: part.modes,
      },
    ]),
  );
  return {
    ejection: description.ejection,
    action: {
      parts,
      ...(cycle.fire ? { fire: cycleMetadata(cycle.fire) } : {}),
      hand: cycleMetadata(cycle.hand),
      ejectAt: cycle.ejectAt,
      ejectDirection: cycle.ejectDirection,
      holdOpen: cycle.holdOpenOnEmpty,
      ...(cycle.rpm === undefined ? {} : { rpm: cycle.rpm }),
    },
  };
};

export const createGunModelEntry = (
  asset: GunAssetIdentity,
  anchors: SelectedAnchors,
  metresPerUnit: number,
  options: GunModelEntryOptions = {},
): GunDeadvoxModelEntry => {
  const { handling } = options;
  const calibre = options.cartridge?.id;
  if (calibre !== undefined) {
    calibreSlug(calibre);
  }
  const others = Object.entries(anchors.others).map(([name, frame]): [string, Vec3] => [
    name,
    modelPoint(frame.position, metresPerUnit),
  ]);
  return {
    id: asset.id,
    file: asset.file as DeadvoxModelFile,
    grip: { at: modelPoint(anchors.hold.position, metresPerUnit), turn: gripTurn() },
    ...(others.length > 0 || handling
      ? {
          anchors: {
            ...Object.fromEntries(others),
            ...(handling ? { ejection: modelPoint(handling.ejection, metresPerUnit) } : {}),
          },
        }
      : {}),
    ...(calibre === undefined ? {} : { calibre }),
    ...(handling ? { action: handling.action } : {}),
    ...(options.tubeCapacity === undefined ? {} : { tube: { capacity: options.tubeCapacity } }),
  };
};

/**
 * Exports a gun assembly: core writes the GLB, then this adapter selects gun anchors and builds the Deadvox entry.
 * Structural anchors are emitted independently of optional cartridge metadata.
 */
export const exportGunGlb = (
  assembly: Assembly,
  asset: GunAssetIdentity,
  appearance: AppearanceContext,
  metadata: GunExportMetadata = {},
): GunExportResult => {
  const resolved = resolve(assembly, gunDomain);
  // Broken assemblies get the core writer's structure report before anchor selection.
  if (resolved.issues.length > 0 || resolved.placed.size < Object.keys(assembly.parts).length) {
    const probe = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
    if (!probe.ok) {
      return probe;
    }
  }
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  if ('code' in anchors) {
    return { ok: false, error: anchors };
  }
  const result: GlbExportResult = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
  if (!result.ok) {
    return result;
  }
  const handling = buildActionExport(resolved);
  const tubeCapacity =
    metadata.cartridge?.kind === 'shotshell' ? tubeMagazineCapacity(resolved, metadata.cartridge) : undefined;
  return {
    ...result,
    modelEntry: createGunModelEntry(asset, anchors, resolved.domain.units.metresPerUnit, {
      ...metadata,
      ...(handling ? { handling } : {}),
      ...(tubeCapacity === undefined ? {} : { tubeCapacity }),
    }),
  };
};
