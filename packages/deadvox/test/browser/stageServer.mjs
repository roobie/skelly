// Browser stages are test runs, so the dev servers they create resolve the engine's test-only subpath as the unit
// tests do; the product dev server and build never load this module. See
// `docs/decisions/0009-content-defined-products.md`, "Refactor gate".
import { createServer, defaultClientConditions, defaultServerConditions, mergeConfig } from 'vite';

const ENGINE_TEST_CONDITION = 'skelly-engine-test';
// The URL prefix page code puts before a runtime package specifier, e.g. `/@stage/@skelly/engine/internal/core/x.ts`.
const PAGE_PREFIX = '/@stage/';
const PAGE_MODULE = '\0stage-engine:';

/**
 * Code a stage runs in the page imports a runtime module as `/@stage/<package specifier>`. A plain `/@id/` URL
 * would load a second copy of the module beside the one the game imports; this serves a module that re-exports the
 * game's copy instead, so the page and the game share its classes and state. Engine modules have no default export.
 */
function pageEngineModules() {
  return {
    name: 'skelly:stage-engine-modules',
    enforce: 'pre',
    resolveId(id) {
      return id.startsWith(`${PAGE_PREFIX}@skelly/engine/`) ? `${PAGE_MODULE}${id.slice(PAGE_PREFIX.length)}` : undefined;
    },
    async load(id) {
      if (!id.startsWith(PAGE_MODULE)) {
        return undefined;
      }
      const resolved = await this.resolve(id.slice(PAGE_MODULE.length), undefined, { skipSelf: true });
      if (!resolved) {
        throw new Error(`Cannot resolve ${id.slice(PAGE_MODULE.length)} for a stage page`);
      }
      return `export * from ${JSON.stringify(resolved.id)};\n`;
    },
  };
}

/** A stage's inline Vite config with the engine's test-only condition added to page and server resolution. */
export const stageServerConfig = (config) =>
  mergeConfig(config, {
    plugins: [pageEngineModules()],
    resolve: { conditions: [...defaultClientConditions, ENGINE_TEST_CONDITION] },
    ssr: { resolve: { conditions: [...defaultServerConditions, ENGINE_TEST_CONDITION] } },
  });

/** The dev server every browser stage creates. */
export const createStageServer = (config) => createServer(stageServerConfig(config));
