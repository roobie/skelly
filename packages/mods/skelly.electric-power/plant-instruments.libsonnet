local enamel = '#29483f';
local brass = '#ad8e53';
local ivory = '#e5dfbd';
local ink = '#34382f';
local amber = '#dca64b';
local box(position, size, color) = { position: position, size: size, color: color };
local from(at, offset) = [at[axis] + offset[axis] for axis in std.range(0, 2)];
{
  label(text, position, size): { text: text, position: position, size: size, color: ivory },
  // A slot's drop flag, its boxes standing from `at`: a point on the panel, or a slot anchor's flag mount.
  flag(slot, at=[0, 0, 0]): {
    slot: slot,
    raised: [
      box(from(at, [0, 0, 0]), [0.20, 0.24, 0.04], brass),
      box(from(at, [0, 0, -0.03]), [0.16, 0.20, 0.02], ink),
      box(from(at, [0, 0.08, -0.05]), [0.13, 0.02, 0.01], brass),
    ],
    dropped: [
      box(from(at, [0, -0.03, 0]), [0.20, 0.30, 0.04], brass),
      box(from(at, [0, -0.03, -0.03]), [0.16, 0.26, 0.02], amber),
      box(from(at, [0, -0.03, -0.05]), [0.11, 0.025, 0.01], ink),
      box(from(at, [0, -0.03, -0.05]), [0.025, 0.13, 0.01], ink),
    ],
  },
  // The panel with its RUN lamp and condition dial, mounted at `offset` from the origin cell's centre.
  look(offset, flags, labels=[]): {
    kind: 'plant',
    offset: offset,
    panel: [
      box([0.5, 0.55, -0.55], [1.65, 1.65, 0.12], brass),
      box([0.5, 0.55, -0.62], [1.57, 1.57, 0.04], enamel),
      box([0.5, 0.58, -0.65], [1.24, 0.93, 0.04], brass),
      box([0.5, 0.58, -0.68], [1.16, 0.85, 0.03], ivory),
    ],
    labels: [
      $.label('RUN', [0.54, 1.16, -0.72], [0.32, 0.10]),
      $.label('CONDITION', [0.5, 0.32, -0.72], [0.63, 0.08]) + { color: ink },
    ] + labels,
    run: { position: [0.83, 1.16, -0.72], size: [0.15, 0.15, 0.09], color: '#b9f2d0', emissive: 2, intensity: 0.8, radius: 4 },
    dial: {
      pivot: [0.5, 0.47, -0.73],
      steps: [-60, -30, 0, 30, 60],
      bands: { ruined: 1, 'badly damaged': 1, damaged: 2, worn: 3, pristine: 4 },
      stoppedStep: 0,
      stoppedColor: brass,
      tickBands: { '1': 'badly damaged', '2': 'damaged', '3': 'worn', '4': 'pristine' },
      tickRadius: 0.40,
      tickSize: [0.026, 0.08, 0.012],
      tickDepth: 0,
      pin: [box([0, 0.19, -0.02], [0.023, 0.40, 0.018], ink), box([0, 0, -0.03], [0.09, 0.09, 0.025], brass)],
      swayAmplitudeDegrees: 2,
      swayPeriodSimSeconds: 1.7,
    },
    flags: flags,
  },
}
