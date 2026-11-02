import { array, exactOptional, minLength, picklist, pipe, strictObject, string } from 'valibot';

// Action ids are code-owned and dotted, so `Id` does not fit; `controlRowIssue` checks them against the actions.
export const ControlSchema = strictObject({
  id: pipe(string(), minLength(1)),
  keys: array(
    strictObject({
      code: pipe(string(), minLength(1)),
      modifier: exactOptional(picklist(['shift', 'alt', 'ctrl', 'meta'])),
    }),
  ),
});
