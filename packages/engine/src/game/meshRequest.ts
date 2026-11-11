// What a mesher does with a mesh request, apart from how it is posted: the browser worker and the
// in-process meshers of tests share it, so a test meshes exactly as the game does.

import { CHUNK, type Vec3 } from '../core/coords.ts';
import { buildMesh, type MeshData } from '../core/mesher.ts';
import { paddedFrom, wideFrom } from '../core/meshInput.ts';
import type { MesherInit, MeshRequest } from './mesherProtocol.ts';

/** The mesh of the requested chunk, built from the neighbourhood it carries. */
export const buildRequestedMesh = (init: MesherInit, { key, neighbourhood }: MeshRequest): MeshData =>
  buildMesh(paddedFrom(neighbourhood), init.colors, {
    patterns: init.patterns,
    wide: wideFrom(neighbourhood, init.occluders),
    weatherable: init.weatherable,
    wireMeshes: init.wireMeshes,
    liquids: init.liquids,
    fencePosts: init.fencePosts,
    origin: key.split(',').map((coordinate) => Number(coordinate) * CHUNK) as Vec3,
  });
