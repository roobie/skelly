---
read_if:
  - you're implementing or reviewing electricity balance, blackout history or power saves
  - you're integrating appliances with power catch-up or changing electrical content
  - you're checking the reasons for electricity priorities, storage losses or restart behaviour
  - you're designing better solar panels and panel damage
  - you're wiring authored building devices into session power or changing player power controls
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

The approved per-phase output is authored in `src/content/base/power.jsonnet`,
`solar_panel`. There is no manufacturing grade: a better panel is another item
type with more authored output, and damage lowers output. Better and less damaged
panels are therefore worth seeking out and repairing. Player-directed panel placement
and damage integration remain outside authored building wiring.

Elapsed time settles old service before changing rates so a load or wiring
change cannot rewrite earlier work. Completion must feed demand back into the
same electrical advance: releasing demand only at the request target would deny
another consumer service and miscount stored energy. The appliance owner retains
work and completion effects; the network retains electrical dispatch. See
`src/core/power.ts`, `PowerWork` and `PowerNetwork.run`.

Tied completions settle together before rebalancing to prevent iteration order
from exposing transient service. A command at completion settles the old interval
first. An interruption pauses work instead of erasing already served time. Saved
work and power must share a settled boundary; neither a final powered flag nor
an undelivered transition history is a progress snapshot. See
`test/powerWork.test.ts`, and `src/core/power.ts`, `PowerNetwork.setEnabled`,
`PowerNetwork.refuel` and `PowerNetwork.rewire`. The same event model is canonical
beyond the player's simulation block; it needs no renderer or streaming input.

## Integer units

Tick play and catch-up agree exactly, because fuel, stored energy and on/off time
count whole units in state, saves and both paths. Exact agreement gives
determinism with nothing to tune, and a harmless refactor cannot break it the way
it can erode a tolerance. A failing agreement run is a defect, never a bound to
widen. See `test/power.test.ts`, "agrees exactly with ticking across fuel, storage, solar and a mid-run rate change".

Content keeps authoring litres, watt-hours, watts and seconds, converted once at
load. A value with no whole unit count is invalid content rather than silently
rounded, so authored decimals keep their meaning. Rates count units per game
millisecond, so the clock ratio cannot change how they round. The scales leave
safe-integer headroom for long absences. See `src/core/powerContent.ts`,
`POWER_UNITS`.

Each storage rate rounds once per balance, always in the same direction, so
splitting a span at a tick cannot change the result. See `src/core/power.ts`,
`storageTransfer`.

## Authored building wiring

An authored facility is one electrical grid because its floors belong to one place,
not separate power puzzles. Build from finished placements rather than streamed
entities so a remote floor draws power before the player visits it. See
`src/core/sitePower.ts`, `placedPowerDevices` and `SitePower`, and
`src/game/worldSetup.ts`, `createWorldSetup`.

Generator control and a main breaker serve different purposes: stopping a generator
saves fuel without disabling independent solar and storage; opening the breaker
isolates consumers even while those sources remain available. Keep storage on the
supply side so disconnecting the house does not prevent charging. Switches interrupt
connectivity rather than disabling consumers, preserving each appliance's own state.
See `src/core/power.ts`, `PowerNetwork.setEnabled`, and `src/core/sitePower.ts`, `SitePower`.

Player controls use ordinary reach and use-admission checks, not debug privileges,
because cutting supply is an ordinary appliance interaction. Explicit enabled-state
commands preserve replay intent instead of toggling whatever state a replay finds.
See `src/game/session.ts`, `powerControl`, and `src/game/replayCommands.ts`,
`applyReplayActionPayload`.

Removing equipment settles old service and disables its authored connection so a
ruined source cannot keep supplying power. A moved piece does not carry fixed wiring
with it. See `src/core/sitePower.ts`, `SitePower.beforeRemove`.

Authored fixed wiring uses stable local link identities, not player inventory cables;
routing and refuelling remain separate interactions to design. Session time drives
fuel and blackouts, and the world snapshot keeps the network so Continue cannot
replenish it. See `src/core/saveState.ts`, `snapshotSession`.

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
