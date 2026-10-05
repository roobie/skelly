import ts from 'typescript';

const physical =
  /^(?:Key[A-Z]|Digit[0-9]|(?:Shift|Alt|Control|Meta)(?:Left|Right)|F(?:[1-9]|1[0-9]|2[0-4])|Escape|Space|Tab|Enter|Backspace|Backquote|Arrow(?:Up|Down|Left|Right)|PageUp|PageDown|Home|End|Insert|Delete|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Enter|Decimal))$/;
/** Lit tooling retains the JavaScript TypeScript parser; the native compiler package has no AST API. */
export const keyboardViolations = (text: string): string[] => {
  const file = ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true);
  const issues: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteralLike(node) &&
      (physical.test(node.text) || node.text === 'keydown' || node.text === 'keyup')
    ) {
      issues.push(node.getText(file));
    }
    if (
      node.kind === ts.SyntaxKind.RegularExpressionLiteral &&
      /(?:Digit|Key\[|Arrow|Keyboard)/.test(node.getText(file))
    ) {
      issues.push(node.getText(file));
    }
    // Naming the DOM type outside the owner catches casts and destructured/renamed event fields too.
    if (ts.isIdentifier(node) && node.text === 'KeyboardEvent') {
      issues.push(node.getText(file));
    }
    if (ts.isBinaryExpression(node)) {
      for (const [member, value] of [
        [node.left, node.right],
        [node.right, node.left],
      ]) {
        if (
          member &&
          value &&
          ts.isPropertyAccessExpression(member) &&
          ['code', 'key'].includes(member.name.text) &&
          ts.isStringLiteralLike(value) &&
          value.text.length === 1
        ) {
          issues.push(node.getText(file));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return issues;
};
