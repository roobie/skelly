# Cartridge data

One JSON file per cartridge, named `<id>.json`, where `id` is the slug other cartridges
use to refer to it (`7.62x39`). This is data only: geometry, viewer and export come later
(roobie/skelly#109). The scope exception that allows real dimensions here is in
`PROJECT.md` ("Non-goals").

The files sit at the package root next to `designs/` and `fixtures/` because they are
data, not code: tests, CLIs and later the viewer read them by path. The types, parser and
rules are in `src/ammo/`, which, like core, imports nothing from `gun/` or `viewer/`.

## Units

Lengths are in millimetres, angles in degrees (a cone angle is the included angle),
bullet and slug mass in grains because that is what the sources print. Axial positions run
from the head face (the closed end) toward the mouth. Sources that print inches get the
millimetre figure they print in parentheses, with the original in `cite.verbatim`.

## Sourcing rule

Every number is a `Measure`: `{ value, cite }`, and `cite` points into the file's `sources`
table with a locator (table, symbol, drawing callout) and, where it helps, the text as
printed. A value that cannot be sourced is `null` with a `note` saying why; it is never
filled in from memory. `unsourcedPaths(cartridge)` lists what is still null, so a consumer
knows what it must not build from.

Each source records the body, how much weight it carries (`standard`, `manufacturer`,
`secondary`; `synthetic` is for test data and refused here), URL, an archive URL when the
live one moves, the retrieval date, the document's own revision and a SHA-256 of the bytes
read. The standard that rules is `primarySource`; its value is `value`. Another standard's
figure for the same dimension goes in `alternatives` (C.I.P. against SAAMI, say), so a
difference stays visible instead of being averaged away. Standards bodies other than C.I.P.
and SAAMI, such as NATO, are just another `body`.

A source with no symbol legend (the C.I.P. sheets have none) is read from its drawing. The
value's `note` says so, and the file's `notes` list what was left unmapped.

## Shapes

A metallic cartridge is a head type crossed with a body shape:

| Head | Rim | Extractor groove |
| --- | --- | --- |
| `rimless` | equal to the head diameter | required |
| `rimmed` | wider than the head | none |

Other head types (`belted`, `rebated`, `semi-rimmed`) are not in the format: no planned
cartridge needs them, so they would be code with no data. .300 Winchester Magnum is planned
as the first belted cartridge, and belted support comes back with it and its real data
(roobie/skelly#109).

| Body | Fields |
| --- | --- |
| `bottleneck` | diameter at head and at shoulder start, `shoulder` (start, end, included angle), `neck` (diameter at base and mouth) |
| `straight` | diameter at head and at mouth; a taper is just a smaller mouth, with no shoulder or neck |

A `shotshell` is its own kind: a gauge and bore, a plastic or paper hull on a rimmed metal
head, a `closure` (fold or roll crimp) instead of a neck, two lengths (`nominal`, the fired
and opened length, which is what an ejected casing looks like, and `loaded`, with the crimp
closed) and a payload that is either `shot` (name, pellet count, pellet diameter) or a
`slug`. Metallic cartridges carry a `bullet` payload.

`relatedTo` is a directed statement about another cartridge, read as "this cartridge
(relation) the other one": `same-external-dimensions`, `safe-in-chamber-of`,
`unsafe-in-chamber-of`. The .38 Special entry says `safe-in-chamber-of` `357-magnum`, and
the .357 Magnum entry says `unsafe-in-chamber-of` `38-special`; 5.56 NATO is
`unsafe-in-chamber-of` `223-rem`. Each relation needs a citation.

Planned cartridges map onto these shapes without a format change:

| Cartridge | Kind | Head | Body | Notes |
| --- | --- | --- | --- | --- |
| 7.62×39 | metallic | rimless | bottleneck | this file |
| .223 Remington, 5.56×45 NATO | metallic | rimless | bottleneck | two files; NATO is a source body, the pair uses the relations above |
| .308 Winchester, 7.62×51 NATO | metallic | rimless | bottleneck | same pairing |
| .338 Lapua Magnum | metallic | rimless | bottleneck | |
| .50 BMG (12.7×99) | metallic | rimless | bottleneck | no size limit anywhere |
| 7.62×54R | metallic | rimmed | bottleneck | |
| 9×19, 9×18, .45 ACP | metallic | rimless | straight | tapered cases use a mouth narrower than the head |
| .357 Magnum, .38 Special | metallic | rimmed | straight | the one-way relation above |
| 12 gauge 00 buck, 12 gauge slug | shotshell | | | `shot` and `slug` payloads, 70 mm nominal length for 2¾″ |

## Checks

`npm test` loads every file here, parses it strictly (unknown keys are refused) and runs
the rules in `src/ammo/rules.ts`: `sources`, `sourced-values`, `units`, `head-type`,
`diameters`, `neck-wall`, `positions`, `lengths` and `shotshell`; `checkRelations` runs over
the whole set. They compare values with each other and never against an absolute size, so
a 9×18 and a .50 BMG both pass. They check that a file is consistent, not that a standard's
numbers are right. Fixtures for each rule are in `test/fixtures/cartridges/`; each patches
a real or synthetic base and lists the rules it must fail.

## Adding a cartridge

1. Fetch the standard (C.I.P. TDCC sheet, SAAMI drawing) and record it under `sources` with
   its hash.
2. Fill every field. Anything the sources do not give stays `null` with a note.
3. Add other standards as `alternatives`, and relations to related cartridges.
4. Run `npm test`.

## Not modelled yet

Case wall thickness and the inside profile (the neck-wall rule uses outer diameter minus
bullet diameter as a proxy), a curved body taper, the bullet's ogive and boat-tail, the
primer pocket, headstamp, wads and shot cups, pressure and performance.
