// Browser stages are test runs, so the dev servers they create resolve the framework packages' test-only subpaths
// as the unit tests do; the product dev server and build never load this module. See
// `docs/decisions/0009-content-defined-products.md`, "Refactor gate".
import { createServer, defaultClientConditions, defaultServerConditions, mergeConfig } from 'vite';

const TEST_CONDITION = 'skelly-test';
// The URL prefix page code puts before a framework package specifier, e.g.
// `/@stage/@skelly/engine/internal/core/x.ts`.
const PAGE_PREFIX = '/@stage/';
const PAGE_MODULE = '\0stage-package:';
const PACKAGE_SPECIFIERS = ['@skelly/engine/', '@skelly/presentation/'];
const packageSpecifier = (specifier) => PACKAGE_SPECIFIERS.some((prefix) => specifier.startsWith(prefix));

/**
 * Code a stage runs in the page imports a framework package module as `/@stage/<package specifier>`. A plain
 * `/@id/` URL would load a second copy of the module beside the one the game imports; this serves a module that
 * re-exports the game's copy instead, so the page and the game share its classes and state. Framework modules have
 * no default export.
 */
function pagePackageModules() {
  return {
    name: 'skelly:stage-package-modules',
    enforce: 'pre',
    resolveId(id) {
      return id.startsWith(PAGE_PREFIX) && packageSpecifier(id.slice(PAGE_PREFIX.length))
        ? `${PAGE_MODULE}${id.slice(PAGE_PREFIX.length)}`
        : undefined;
    },
    async load(id) {
      if (!id.startsWith(PAGE_MODULE)) {
        return;
      }
      // The id can also arrive as a raw `/@id/` URL, so the specifier is checked again here.
      const specifier = id.slice(PAGE_MODULE.length);
      if (!packageSpecifier(specifier)) {
        throw new Error(`A stage page may load only framework package modules, not ${specifier}`);
      }
      const resolved = await this.resolve(specifier, undefined, { skipSelf: true });
      if (!resolved) {
        throw new Error(`Cannot resolve ${specifier} for a stage page`);
      }
      return `export * from ${JSON.stringify(resolved.id)};\n`;
    },
  };
}

/** A stage's inline Vite config with the test-only condition added to page and server resolution. */
export const stageServerConfig = (config) =>
  mergeConfig(config, {
    plugins: [pagePackageModules()],
    resolve: { conditions: [...defaultClientConditions, TEST_CONDITION] },
    ssr: { resolve: { conditions: [...defaultServerConditions, TEST_CONDITION] } },
  });

/** The dev server every browser stage creates. */
export const createStageServer = (config) => createServer(stageServerConfig(config));
