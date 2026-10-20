import { Starlark } from 'starlark-wasm';
import wasmUrl from 'starlark-wasm/wasm?url';
import { type Candidate, checkedInputs, checkedResult, ExpressionIssue } from './contract.ts';
import { checkWasmProfile } from './wasmProfile.ts';

let initialized: Promise<void> | undefined;

export const starlark: Candidate = {
  name: 'starlark-wasm-0.0.4-scalar-profile-1',
  async load(source, schema, result) {
    const inputsSchema = Object.freeze({ ...schema });
    const names = checkWasmProfile(source, inputsSchema, 'starlark');
    initialized ??= Starlark.init(wasmUrl);
    await initialized;
    const moduleSource = `def rule(${names.join(',')}):\n    return (${source})\ndef validate():\n    return True\n`;
    const runtime = new Starlark({
      load: (filename) => {
        if (filename !== 'content-rule.star') {
          throw new Error('Imports are not available');
        }
        return Promise.resolve(moduleSource);
      },
      print: () => {
        throw new Error('Printing is not available');
      },
    });
    // A trusted no-op entry compiles the module without inventing inputs for the
    // rule. The published API cannot retain that compilation for evaluation.
    try {
      await runtime.run('content-rule.star', 'validate');
    } catch (error) {
      throw new ExpressionIssue(`starlark: expression: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
    return {
      canonical: source,
      async evaluate(inputs) {
        const copy = checkedInputs(inputs, inputsSchema);
        return checkedResult(
          await runtime.run(
            'content-rule.star',
            'rule',
            names.map((name) => copy[name]!),
          ),
          result,
        );
      },
    };
  },
};
