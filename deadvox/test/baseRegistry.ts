import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { inject } from 'vitest';
import type { Registry } from '../src/core/content.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    baseRegistryPath: string;
  }
}

// Deserialize per caller so even nested mutable content is never shared between fixtures.
export const baseRegistry = (): Registry => deserialize(readFileSync(inject('baseRegistryPath'))) as Registry;
