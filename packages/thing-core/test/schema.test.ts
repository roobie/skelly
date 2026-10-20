import { optional, safeParse, strictObject, string } from 'valibot';
import { describe, expect, it } from 'vitest';
import { MATERIALS, MaterialSchema } from '../src/materials.ts';
import { modelSchema, NeutralModelSchema } from '../src/schema.ts';

const model = {
  id: 'fixture',
  file: 'assets/models/fixture.glb',
  grip: { at: [0, 0, 0] },
  parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } },
};

describe('neutral model envelope', () => {
  it('validates pack-owned named blocks without accepting their fields at the top level', () => {
    const schema = modelSchema({ fixturePack: optional(strictObject({ choice: string() })) });
    expect(safeParse(schema, { ...model, fixturePack: { choice: 'fixture' } }).success).toBe(true);
    expect(safeParse(schema, { ...model, choice: 'fixture' }).success).toBe(false);
    expect(safeParse(schema, { ...model, fixturePack: { unknown: true } }).success).toBe(false);
  });

  it('rejects pack blocks that would replace a neutral field', () => {
    expect(() => modelSchema({ grip: optional(string()) })).toThrow();
  });

  it('requires finite physical parts, rejecting missing parts and scalar mass', () => {
    const { parts: _parts, ...withoutParts } = model;
    expect(safeParse(NeutralModelSchema, withoutParts).success).toBe(false);
    expect(safeParse(NeutralModelSchema, { ...model, parts: {} }).success).toBe(false);
    expect(safeParse(NeutralModelSchema, { ...model, massKg: 1 }).success).toBe(false);
    for (const massKg of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        safeParse(NeutralModelSchema, { ...model, parts: { body: { ...model.parts.body, massKg } } }).success,
      ).toBe(false);
    }
    expect(
      safeParse(NeutralModelSchema, { ...model, parts: { body: { massKg: 1, centreOfMass: [0, Number.NaN, 0] } } })
        .success,
    ).toBe(false);
  });

  it('rejects nonfinite model-frame coordinates', () => {
    expect(safeParse(NeutralModelSchema, model).success).toBe(true);
    expect(
      safeParse(NeutralModelSchema, { ...model, anchors: { fixture: [0, Number.POSITIVE_INFINITY, 0] } }).success,
    ).toBe(false);
  });
});

describe('material table', () => {
  it('requires valid colour, finish and positive finite density together', () => {
    const material = {
      colour: [0.2, 0.3, 0.4],
      finish: { metallic: 0, roughness: 0.5 },
      densityKgPerM3: 1000,
      source: 'fixture',
    };
    expect(Object.keys(MATERIALS).length).toBeGreaterThan(0);
    expect(safeParse(MaterialSchema, material).success).toBe(true);
    for (const densityKgPerM3 of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(safeParse(MaterialSchema, { ...material, densityKgPerM3 }).success).toBe(false);
    }
    expect(safeParse(MaterialSchema, { ...material, colour: [0, 0, 2] }).success).toBe(false);
    expect(safeParse(MaterialSchema, { ...material, finish: { metallic: 0 } }).success).toBe(false);
  });
});
