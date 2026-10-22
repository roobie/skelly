// The Slice 5 playtest wave, for that scenario's `eventRules`; `at` is the world cell its horde arrives from.
{
  rule(at):: {
    id: 'holding_wave',
    // Three elapsed scenario days: `SLICE-5.md`, "Settled event and playtest rules".
    trigger: { kind: 'elapsed', afterGameHours: 24 * 3 },
    effects: [{ kind: 'releaseHorde', zombie: 'shambler', count: 8, at: at }],
  },
}
