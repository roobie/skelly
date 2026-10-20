import { describe, it } from 'vitest';
import { luau } from '../src/spikes/expressions/luau.ts';
import { wasmCases } from './expressionWasmCases.ts';

describe(luau.name, () => {
  for (const test of wasmCases(luau, 'luau')) {
    it(test.name, async () => {
      await test.run();
    });
  }
});
