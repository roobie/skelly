---
read_if:
  - you're implementing or reviewing electricity balance, blackout history or power saves
  - you're integrating appliances with power catch-up or changing electrical content
  - you're checking the reasons for electricity priorities, storage losses or restart behaviour
---

# Electricity

## Dispatch and storage

Content priorities keep whole-consumer admission independent of controls and
process rate semantics. Stable identity breaks ties so insertion order cannot
change service. Player-managed priorities and proportional operation remain open;
neither is needed to make a blackout consequential. See `src/core/power.ts`,
`PowerNetwork`, and `src/core/powerContent.ts`, `PowerDeviceSchema`.

Ordered battery transfer keeps dispatch small without committing to balanced
utilisation or player-directed sharing. Unlimited transfer rates avoid a second
set of competing flow constraints; rate caps remain a later balancing option.
Content efficiencies preserve conversion losses without introducing chemistry.
Charging and discharging account for losses at their respective storage boundary,
rather than charging the same loss twice. See `src/core/power.ts`, `storageTransfer`.

A running generator burns at its full authored rate even without useful demand.
This avoids an automatic dispatch controller; demand-following control, startup
costs and minimum running loads remain open. See `src/core/power.ts`, `production`.

A consumer shed for insufficient energy must wait for full participating batteries
before restarting from storage. Waiting for full stores avoids instantaneous
charge/restart/drain oscillation without a separately tuned reserve threshold.
Direct generation can serve a whole consumer without drawing from storage.
A different reserve rule remains an explicit gameplay change, isolated at
`src/core/power.ts`, `PowerNetwork.storageAllowed`.

## Solar and elapsed time

Piecewise-constant phase output makes solar integration an event problem, not
numerical sampling. The world's day cycle remains the authority so solar cannot
drift onto a separate electrical clock. Smooth curves, weather and panel
orientation remain open. See `src/core/dayPhase.ts`, `dayPhaseAt`, and
`src/core/power.ts`, `PowerNetwork.solar`.

Elapsed time settles resource and phase boundaries before changing rates so a
load or wiring change cannot rewrite earlier service. Appliance owners receive
power transitions with simulation timestamps, rather than guessing away-time
service from the final powered flag. Returned histories belong to the caller;
consuming a history and saving appliance progress must share the same settlement
boundary. See `src/core/power.ts`, `PowerNetwork.advance`, `PowerTransition`,
`PowerNetwork.setEnabled`, `PowerNetwork.refuel` and `PowerNetwork.rewire`.

Absolute resource bounds preserve freedom to change integration algorithms while
making near-player disagreement visible. The integration spike's fixture bounds
require approval before appliance integration on d577; widening them to excuse a
failure is not a fix. See `test/powerFixture.ts`, `powerAgreementBounds`, and
`test/power.test.ts`, "agrees with ticking across fuel, storage, solar and a mid-run rate change".
The same event model is canonical beyond the player's simulation block; it needs
no renderer or streaming input. Cross-browser same-path identity is not relaxed
by the tick/catch-up bounds.

## Links and state

Logical links keep placement and routing gameplay separate from balance. A link
retains the creating item's identity so a later cable interaction can return to
its owner without guessing from endpoints. Unlimited, lossless links avoid a
network-flow solver; spatial damage, routing economics, capacity, resistance and
circuit protection remain open. See `src/core/power.ts`, `PowerLink`.

Saved fuel, stored energy, switches and restart eligibility preserve continuation
through a blackout. Topology membership is derived rather than saved, preventing
stale networks after restoration. Snapshots are detached from their owner so a
caller cannot edit live energy through saved data. See `src/core/power.ts`,
`PowerNetwork.snapshot`, and `src/core/powerGraph.ts`, `PowerGraph`.
