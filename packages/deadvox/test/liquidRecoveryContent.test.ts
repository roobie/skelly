import { describe, expect, it } from 'vitest';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { RESULT } from './liquidCraftFixture.ts';
import { liquidRecoveryData } from './liquidRecoveryFixture.ts';

const DISASSEMBLY_RECOVERY = /\.disassembly\.liquidRecovery$/;
const SALVAGE_RECOVERY = /\.salvageLiquidRecovery$/;
const SALVAGE_RECOVERY_SKILL = /\.salvageLiquidRecovery\.skill$/;
const TOOL_QUALITY = /\.toolModifier\.quality$/;

const pack = () => {
  const data = liquidRecoveryData();
  const result = data.items.find((item) => item.id === RESULT)!;
  if (!('disassembly' in result)) {
    throw new Error('Missing fixture recovery');
  }
  return { data, result };
};
const issuesFor = (data: unknown) => buildFixtureRegistry([{ source: 'fixture-liquid-recovery', data }]).issues;

describe('liquid recovery content admission', () => {
  it('accepts independent disassembly and salvage recovery metadata', () => {
    expect(issuesFor(pack().data)).toEqual([]);
  });
  it.each(['disassembly', 'salvage'] as const)('requires %s recovery for a liquid recipe result', (operation) => {
    const { data, result } = pack();
    if (operation === 'disassembly') {
      Reflect.deleteProperty(result.disassembly, 'liquidRecovery');
    } else {
      Reflect.deleteProperty(result, 'salvageLiquidRecovery');
    }
    const issues = issuesFor(data);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toMatch(operation === 'disassembly' ? DISASSEMBLY_RECOVERY : SALVAGE_RECOVERY);
  });
  it('validates the salvage skill independently of the disassembly skill', () => {
    const { data, result } = pack();
    result.salvageLiquidRecovery.skill = 'fixture_missing_skill';
    const issues = issuesFor(data);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toMatch(SALVAGE_RECOVERY_SKILL);
  });
  it.each(['disassembly', 'salvage'] as const)('validates the %s liquid recovery tool reference', (operation) => {
    const { data, result } = pack();
    const recovery = operation === 'disassembly' ? result.disassembly.liquidRecovery : result.salvageLiquidRecovery;
    recovery.toolModifier.quality = 'fixture_missing_quality';
    const issues = issuesFor(data);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toMatch(TOOL_QUALITY);
  });
  it('rejects salvage liquid metadata without a salvage capability', () => {
    const { data, result } = pack();
    Reflect.deleteProperty(result, 'salvage');
    Reflect.deleteProperty(result, 'salvageTimeGameMinutes');
    const issues = issuesFor(data);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toMatch(SALVAGE_RECOVERY);
  });
  it('does not require recovery metadata for a result with only solid recipe routes', () => {
    const { data, result } = pack();
    data.recipes = data.recipes.filter((recipe) =>
      recipe.components.every((group) => group.every((row) => 'item' in row)),
    );
    Reflect.deleteProperty(result.disassembly, 'liquidRecovery');
    Reflect.deleteProperty(result, 'salvageLiquidRecovery');
    expect(issuesFor(data)).toEqual([]);
  });
});
