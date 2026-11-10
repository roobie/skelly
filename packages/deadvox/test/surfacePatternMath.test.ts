import { ShaderChunk, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { startupContent } from './baseRegistry.ts';

const INCLUDE = /^[ \t]*#include +<([\w./]+)>/gm;
const DECLARATION = /^(?:\w+\s+)?varying\s/;
const NAME = /varying\s+\w+\s+(\w+)/;
const PLAIN = /^varying\s/;
const CENTROID = /^centroid varying /;

const chunks = ShaderChunk as unknown as Record<string, string>;
const resolveIncludes = (source: string): string =>
  source.replace(INCLUDE, (_, name: string) => resolveIncludes(chunks[name] ?? ''));

const varyings = (source: string): string[] =>
  resolveIncludes(source)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => DECLARATION.test(line));

const nameOf = (declaration: string): string => NAME.exec(declaration)![1]!;

describe('surface shader interpolation contracts', () => {
  it('declares every varying the chunk material adds or replaces centroid, except the flat pattern id', () => {
    const { material } = new ChunkMeshes(0.5, startupContent().registry);
    const { lambert } = ShaderLib;
    const shader = {
      uniforms: {},
      vertexShader: lambert.vertexShader,
      fragmentShader: lambert.fragmentShader,
    } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    for (const [patched, stock] of [
      [shader.vertexShader, lambert.vertexShader],
      [shader.fragmentShader, lambert.fragmentShader],
    ] as const) {
      const stockDeclarations = new Set(varyings(stock));
      const declarations = varyings(patched);
      const own = declarations.filter((declaration) => !stockDeclarations.has(declaration));
      const ownNames = new Set(own.map(nameOf));
      expect(ownNames).toContain('vColor');
      expect(ownNames).toContain('vPattern');
      for (const declaration of own) {
        if (nameOf(declaration) === 'vPattern') {
          expect(declaration).toBe('flat varying float vPattern;');
        } else {
          expect(declaration).toMatch(CENTROID);
        }
      }
      const plain = declarations.filter((declaration) => PLAIN.test(declaration));
      expect(plain.filter((declaration) => ownNames.has(nameOf(declaration)))).toEqual([]);
    }
  });
});
