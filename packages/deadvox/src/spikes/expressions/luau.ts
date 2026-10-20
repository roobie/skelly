import { LuauState } from 'luau-web';
import { type Candidate, checkedInputs, checkedResult, ExpressionIssue } from './contract.ts';
import { checkWasmProfile } from './wasmProfile.ts';

let sharedState: Promise<LuauState> | undefined;

export const luau: Candidate = {
  name: 'luau-web-1.4.0-scalar-profile-1',
  async load(source, schema, result) {
    const inputsSchema = Object.freeze({ ...schema });
    const names = checkWasmProfile(source, inputsSchema, 'luau');
    sharedState ??= LuauState.createAsync();
    const state = await sharedState;
    try {
      const chunk = state.loadstring(
        `return function(${names.join(',')}) return (${source}) end`,
        'content-rule',
        true,
      );
      const [rule] = await chunk();
      return {
        canonical: source,
        async evaluate(inputs) {
          const copy = checkedInputs(inputs, inputsSchema);
          const [value] = await rule(...names.map((name) => copy[name]));
          return checkedResult(value, result);
        },
      };
    } catch (error) {
      throw new ExpressionIssue(`luau: expression: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  },
};
