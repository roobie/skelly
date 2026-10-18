import { type ASTNode, Environment, serialize } from '@marcbachmann/cel-js';
import type { Candidate, ValueType } from './contract.ts';
import { checkedInputs, checkedResult, ExpressionIssue } from './contract.ts';

const celTypes: Record<ValueType, string> = { boolean: 'bool', number: 'double', string: 'string' };

// No calls, object traversal, comprehensions or arithmetic: the spike measures a bounded profile, not all CEL.
function checkProfile(node: ASTNode): void {
  switch (node.op) {
    case 'value':
      if (
        !['string', 'number', 'boolean'].includes(typeof node.args) ||
        (typeof node.args === 'number' && !Number.isFinite(node.args))
      ) {
        throw new Error('profile permits only finite double, boolean and string literals');
      }
      return;
    case 'id':
      return;
    case '!_':
      checkProfile(node.args);
      return;
    case '&&':
    case '||':
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '?:':
      for (const child of node.args) {
        checkProfile(child);
      }
      return;
    default:
      throw new Error(`operator ${node.op} is outside the deterministic spike profile at offset ${node.start}`);
  }
}

export const cel = {
  name: 'cel-js-8.0.0-profile-1',
  load(source, schema, result) {
    try {
      if (source.length > 4096) {
        throw new Error('source exceeds spike limit');
      }
      const inputsSchema = Object.freeze({ ...schema });
      const environment = new Environment({
        unlistedVariablesAreDyn: false,
        limits: { maxAstNodes: 256, maxDepth: 64, maxListElements: 0, maxMapEntries: 0, maxCallArguments: 0 },
      });
      for (const [key, type] of Object.entries(inputsSchema)) {
        environment.registerVariable(key, celTypes[type]);
      }
      const parsed = environment.parse(source);
      checkProfile(parsed.ast);
      const checked = parsed.check();
      if (!checked.valid) {
        throw checked.error;
      }
      if (checked.type !== celTypes[result]) {
        throw new Error(`result must be ${result}, got ${checked.type}`);
      }
      return {
        canonical: serialize(parsed.ast),
        evaluate: (inputs) => checkedResult(parsed(checkedInputs(inputs, inputsSchema)), result),
      };
    } catch (error) {
      throw new ExpressionIssue(`cel: expression: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  },
} satisfies Candidate;
