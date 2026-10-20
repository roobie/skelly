// biome-ignore lint/correctness/noNodejsModules: Node CLI checks need the same sibling-source alias as Vite and TypeScript.
import { registerHooks } from 'node:module';

const mobgenSrc = new URL('../../mobgen/src/', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@mobgen/')) {
      return nextResolve(specifier, context);
    }

    return nextResolve(new URL(specifier.slice('@mobgen/'.length), mobgenSrc).href, context);
  },
});
