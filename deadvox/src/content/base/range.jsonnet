// The debug test range (`deadvox/docs/content.md`, "Handling range"). Fire runs down the lane from the
// firing line, so each target sits at its own lateral offset: a nearer one never hides a farther one.
{
  handlingRange: [{
    id: 'test_range',
    gap: 8,
    blend: 8,
    length: 82,
    width: 40,
    firingLine: { offset: 8, depth: 2, inset: 3 },
    target: { halfWidth: 2, height: 4 },
    targets: [
      { offset: 28, lateral: -8 },
      { offset: 48, lateral: 8 },
      { offset: 68, lateral: 0 },
    ],
    table: { offset: 3, lateral: -1 },
  }],
}
