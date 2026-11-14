// Product code's only importer of the vendored Rapier f64 supply (`vendor/rapier-f64`): the one place the physics binary
// and its generated bindings enter the game, so every consumer shares one module instance and one binary
// identity (`docs/decisions/0009-rapier-f64-build.md`, "Decision"). The engine and presentation packages reach
// no product file (`docs/decisions/0009-content-defined-products.md`, "Package boundaries"), so wiring hands
// them what this module initializes instead of a vendor import.
import type * as Rapier from '../../vendor/rapier-f64/rapier.js';
import initRapierWasm from '../../vendor/rapier-f64/rapier_wasm3d.js';

export type RapierApi = typeof Rapier;
// biome-ignore lint/performance/noBarrelFile: one supply seam keeps every consumer on this module's bindings and init.
// biome-ignore lint/performance/noReExportAll: the bindings are re-exported whole so consumers never import the vendor directly.
export * from '../../vendor/rapier-f64/rapier.js';

let initialization: ReturnType<typeof initRapierWasm> | undefined;

/** The vendored WASM file, for hosts that read it from disk. */
export const rapierWasmUrl = (): URL => new URL('../../vendor/rapier-f64/rapier_wasm3d_bg.wasm', import.meta.url);

/**
 * Initialize the shared Rapier module once; further calls return the same promise, so a second init is a
 * no-op and no second module instance can appear. Browsers pass no argument: the generated init then loads
 * the WASM from the bundler's asset URL. Node and Vitest hosts have no bundler URL and cannot fetch files,
 * so their caller reads the vendored bytes (`rapierWasmUrl`) and passes them; the first call wins.
 */
export const awaitRapier = (wasm?: Uint8Array): ReturnType<typeof initRapierWasm> => {
  initialization ??=
    wasm === undefined
      ? initRapierWasm()
      : // biome-ignore lint/style/useNamingConvention: wasm-bindgen owns this initialization key
        initRapierWasm({ module_or_path: wasm });
  return initialization;
};
