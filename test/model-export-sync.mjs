// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared contract assertions run inside the caller's Node test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const glbJson = (bytes) =>
  JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
const glbBinary = (bytes) => bytes.subarray(28 + bytes.readUInt32LE(12));
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const arrayDifference = (actual, expected, path) => {
  if (!(Array.isArray(actual) && Array.isArray(expected))) {
    return `${path} should be arrays`;
  }
  if (actual.length !== expected.length) {
    return `${path} array lengths differ`;
  }
  for (let i = 0; i < actual.length; i++) {
    const difference = exportDifference(actual[i], expected[i], `${path}[${i}]`);
    if (difference) {
      return difference;
    }
  }
  return null;
};
const recordDifference = (actual, expected, path) => {
  if (!(isRecord(actual) && isRecord(expected))) {
    return `${path} should be objects`;
  }
  const keys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, i) => key !== expectedKeys[i])) {
    return `${path} object keys differ`;
  }
  for (const key of expectedKeys) {
    const difference = exportDifference(actual[key], expected[key], `${path}.${key}`);
    if (difference) {
      return difference;
    }
  }
  return null;
};
export const exportDifference = (actual, expected, path = '$') => {
  if (typeof actual === 'number' || typeof expected === 'number') {
    if (typeof actual !== 'number' || typeof expected !== 'number') {
      return `${path} should be a number`;
    }
    const tolerance = 1e-12 * Math.max(1, Math.abs(actual), Math.abs(expected));
    return Math.abs(actual - expected) > tolerance ? `${path}: ${actual} differs from ${expected}` : null;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return arrayDifference(actual, expected, path);
  }
  if (isRecord(actual) || isRecord(expected)) {
    return recordDifference(actual, expected, path);
  }
  return Object.is(actual, expected) ? null : `${path} differs`;
};
export const assertExportSynced = ({ id, source, modelEntry, glb }, base, directory) => {
  assert.equal(modelEntry.id, id, `${source}: recipe identity was not used`);
  assert.equal(modelEntry.file, `assets/models/${id}.glb`, `${source}: recipe output path was not used`);
  // Node math varies in the last bits for geometric centres as well as linear colours.
  const committed = JSON.parse(readFileSync(join(base, directory, `${id}.model.json`), 'utf8'));
  assert.equal(exportDifference(committed, modelEntry), null, `${id}: ${source}`);
  const bytes = readFileSync(join(base, modelEntry.file));
  const exported = Buffer.from(glb);
  assert.equal(exportDifference(glbJson(bytes), glbJson(exported)), null, modelEntry.file);
  assert.ok(glbBinary(bytes).equals(glbBinary(exported)), `${modelEntry.file}: geometry differs from ${source}`);
};
export const assertRecipeCredits = (recipe, manifest) => {
  const credited = new Set(manifest.sources.flatMap(({ files }) => files));
  for (const { id } of recipe) {
    assert.ok(credited.has(`assets/models/${id}.glb`), `${id}: missing asset credit`);
  }
};
