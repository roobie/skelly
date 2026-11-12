// The Slice 5 first wave, for the Holdout scenario's `eventRules`; `at` is the world cell its horde arrives from.
// The day defaults to the settled three; a debug pack passes a shorter one for looks, not a second rule.
{
  rule(at, afterGameHours=24 * 3):: {
    id: 'holding_wave',
    // Three elapsed scenario days by default: `SLICE-5.md`, "Settled event and playtest rules".
    trigger: { kind: 'elapsed', afterGameHours: afterGameHours },
    effects: [{ kind: 'releaseHorde', actor: 'shambler', count: 8, at: at }],
  },
}
