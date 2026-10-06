// biome-ignore lint/correctness/noNodejsModules: this resolver only runs in the Node benchmark.
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
