// How fast each long action may run time (`DESIGN.md`, "Long actions"). Waiting and sleeping get
// through a night quickly; crafting, reading and treatment stay at the pace their progress reads at.
local passTime = 360;
local work = 30;

{
  compression: [{
    id: 'player',
    capability: 'player',
    caps: {
      wait: passTime,
      rest: passTime,
      sleep: passTime,
      craft: work,
      reading: work,
      treatment: work,
    },
  }],
}
