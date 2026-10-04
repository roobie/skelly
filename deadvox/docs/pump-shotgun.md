# Playable pump shotgun (d36)

**Awaiting BR's look, feel and listening verdict.** No loot placement yet. The
curated unbranded wood-stock pump, shells and hulls are actual Gungen exports,
not synthetic meshes/action timings.

## Controls

Start a **fresh** world with `?debug=1&loadout=pump&site=testHouse&time=12%3A00&seed=7&radius=64`.
The loadout supplies an empty held pump and a backpack containing a box of 20
00-buck shells. It never replaces saved hands or ammunition.

- Tab opens inventory. Select the **sealed shotshell box**, then **H** to wield
  it (the pump can go into the backpack through ordinary Hands handling). Tab
  closes inventory. **LMB activates the held box**: a cancellable **1.2 s** opening
  job consumes one box and yields twenty loose shells. X cancels without loss.
  Shells fill carried pockets in ordinary owner/pocket order, merging when possible;
  only overflow goes into an ordinary nearby pile. There is no inventory Unpack/Load.
- Wield the pump again. In the default view, **hold R for at least 250 ms** to
  start one-shell jobs, continuing while held. Release cancels a partial insertion;
  completed shells remain loaded. Full tube or no loose shells stops loading.
  Only loose carried shells count, in **ascending UID order**, including clothing,
  worn bags and carried pockets. Unopened boxes are not cartridges.
- **Double-press R within 250 ms** to rack. The first press never starts a load.
  **A short single tap does nothing.** Both real-time thresholds live together in
  `RELOAD_GESTURE_MS`; the double window is strictly less than 250 ms.
  Selected held gun **U Rack** and an assigned held-gun quickbar second press call
  that exact same rack action. There is no second implementation.
- **LMB fires once** if chambered. Holding LMB does not invent ammunition or rack
  the pump. Rack again for the next shot.
- Load four shells, rack one into the chamber, then load another: capacity is
  **four in the tube plus one in the chamber**, not five in the tube.
- Cancel the current handling job using the inventory queue controls. A partial
  shell insertion consumes nothing; already completed insertions stay loaded.
  Racking a live chamber ejects a recoverable shell to the ground, not a hull.
- Default-view R never rests, even with empty hands. **Rest has no dedicated key**;
  restable furniture interaction arrives in d45. The existing panel and C/X continue/
  stop remain; sleep still toggles on L. Debug noclip descends with **Backspace**
  (browser back-navigation prevented in play); reserved Q/E are untouched,
  inventory E still means best-pocket, R still rotates.
- Inspect the gun for chamber/tube status. The gun's carried mass includes its
  loaded ammunition (or chambered hull).

## Authority and saves

The item owns chamber, cartridge type, ordered tube cartridge types and the
pending fired-hull landing cue. Exact save schema **10**; no old-save migration.
A snapshot cancels manual motion/loading **in the copy**, preserving committed
ammunition and chamber state. A cancelled rack past ejection stays empty until
another rack feeds the tube; it does not restore an ejected shell.

`shotshell_box` is a **sealed non-container item**, with authored
`unpack: { item: "shell_12_gauge_00_buck", count: 20 }`. No nested cartridge
objects exist before opening. The item's 840 g estimate includes twenty 40 g
shells plus 40 g cardboard. Content admission checks the payload item and that it
fits one stack, allowing spill-capacity preflight before the box is consumed.
d41 places this same type in the cellar; no second representation is needed.

The existing HandlingQueue and firearm simulation stage own actions. Each shell
is consumed only at job completion. The real model's hand timeline couples
carrier/forend. Ejection commits at its exported threshold and uses its exported
anchor/direction. Hulls follow the spent-case pile/counter policy; live shells
remain inventory items in ground piles. Ground models/prototypes do not animate.
The renderer projects action frames, exported support/loading-port anchors and
a shell approaching the port; it owns no ammunition/timing.

A pump shot leaves a fired hull in the chamber and **no automatic cycle**.
Cartridge data (`gungen/cartridges/12-gauge-00-buck.json`) supplies nine pellets
and 8.38 mm diameter. A separate seeded shot stream chooses the directions.
Pellets use the existing posed-region/solid-occlusion damage and death path,
without initiating a melee swing, melee cooldown or melee-contact audio.
The blast uses F4 admission, including zombie hearing, before audio output.
Missing audio assets cannot create/refund ammunition or veto hearing.

## Explicit estimates and omissions

These are game-balance/presentation estimates, **not measured ballistics**:

- Shell insertion: 0.9 s per job; short 12 cm approach to the loading port.
- Cardboard opening: 1.2 s. Pump inventory footprint: 2×8 cells, so ordinary
  backpack/pile handling can put it away when wielding the box; not a measured
  packing dimension. The earlier 2×10 estimate prevented that operation.
- Spread: uniform solid-angle approximation sampled through a uniform disc,
  **2° half-angle**; eye-origin hitscan, 50 m maximum range. No choke/distance
  pattern calibration, recoil-driven spread, projectile drop or penetration.
- Nominal 00 pellet: 20 region HP and 0.35 N·s impulse; both scaled by diameter
  cubed. Diameter informs balance, not a physical wound/energy model.
- Blast hearing radius: 100 m. Hull flight: 0.48 s at 3.5 m/s, inherited case
  presentation estimates, not surface collision audio.
- Loaded shell envelope/receiver/port fit allowances are exported visual fit
  estimates, not measured interior clearance.

## Audio candidates and provenance

Every event/variant is on `/sounds.html`, with BR status and credits through the
asset manifest. Imported mono 48 kHz Vorbis clips target −2 dBFS using **float**
source-peak measurements (integer peak measurements clip the hot source WAVs).
Cuts/normalization are recorded per asset; no host-local paths are published.

- `shotgun_blast`: two Winchester Model 12 near takes from The Free Firearm
  Sound Library, CC0. Recordists: **Ben Jaszczak, Brian Nelson, Kevin Heras and
  Matthew Nanney**. Candidate, awaiting BR; Benelli Nova alternatives omitted.
- `shotgun_rack_back` / `shotgun_rack_forward`: BR-selected **SpringySpringo**
  `shotguncock.wav`, CC0, [Gun Reload Sounds](https://opengameart.org/content/gun-reload-sounds).
  Split into back/forward clips: back at hand start, forward at the exported
  rearward+dwell boundary (0.65 s). No time-stretching of animation or sound.
  Source approved; cuts/levels still await BR. Superseded `rem870_rack_v2.wav`
  is not used.
- `shotgun_insert`: two individual cuts from **zer0_sol**'s CC0
  [Shotgun Reload Sound Effects](https://opengameart.org/content/shotgun-reload-sound-effects),
  not whole reload sequences. No direct chamber-load feature/clip.
- `shotgun_hull_drop`: three hollow plastic cuts from **LFA**'s CC0
  [Equipment Clicks II](https://opengameart.org/content/equipment-clicks-ii).
  **Labelled placeholder**, not actual brass-headed hull recordings; no metal
  layer. A single pending cue survives snapshot/restore without duplication.

Real-GPU look/feel and audible suitability belong to BR, not automated tests.
