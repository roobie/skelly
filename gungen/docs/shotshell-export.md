---
read_if:
  - you export or change shotshell or cartridge models for Deadvox
  - you change a shotshell's visual proxies or its gameplay mass estimates
---

# Shotshell export (g39)

Both `MetallicCartridge` and `Shotshell` use `exportCartridgeModels` in
`src/gun/cartridgeExport.ts`, the shared GLB writer, and the same
`DeadvoxModelEntry`. Profiles/solids are in millimetres; the exporter scales by
0.001 to metres. +X runs from head to mouth. No grip or anchor is invented:
these entries follow the existing standalone metallic round/case contract.
`calibre` remains the exact data ID, `12-gauge-00-buck`.

From `gungen/`, reproduce the two base-pack assets and sidecars:

```sh
npm run export:cartridges -- cartridges/12-gauge-00-buck.json \
  ../deadvox/src/content/base/assets/models "$XDG_RUNTIME_DIR/gungen-shotshell-entries"
```

The CLI accepts either cartridge kind, writes both models and their sidecars,
and reports parse/export failures nonzero. An optional third positional argument
separates sidecars from models. It is a wrapper around the common exporter, not
a second geometry/export implementation. The injective calibre slug preserves
separators: `round_12_h_gauge_h_00_h_buck` and `case_12_h_gauge_h_00_h_buck`.

## Sourced shape

`cartridges/12-gauge-00-buck.json` records the exact citations and hashes:

- SAAMI Z299.2, printed p.20 / PDF p.21: loaded conservative rolled envelope
  **62.23 mm**, fired/open length **70.1 mm**, hull diameter **20.549 mm**,
  rim diameter **22.5 mm**, rim thickness **1.463 mm**, head height **1.83 mm**.
- Federal PFC154 00: red hull colour and nine 00 buck pellets; SAAMI's shot
  table gives the nominal pellet diameter **8.38 mm**.

The loaded shell has a rimmed head, a hollow hull, a curled lip and an inset
closure card. The fired hull has the same head, the full nominal length and a
truly open mouth; a centreline ray reaches the head, not a mouth cap. Fold
closure data selects six star leaves instead of the roll lip. The shared
`shotshellGeometry` also supplies the viewer, not a separate preview shape.
Profile chamfers implement the metallic export's bevel style. Revolved surfaces
follow the existing smooth, no-outline rendering convention; exports use96facets.

## Proxies and estimates — not manufacturer claims

Lead authorised these explicitly on 2026-10-03, following the generic metallic
bullet seating proxy. **The cartridge JSON is unchanged.**

| Choice | Meaning |
| --- | --- |
| `UNKNOWN_CLOSURE_PROXY = 'roll-crimp'` | Generic presentation at the already-cited conservative62.23mm envelope. Federal's crimp is still unknown; `closure.value` stays null. |
| `ROLL_CRIMP_PROXY_MM = 1.2` | Lip depth/inward curl and closure-card setback; visual approximation, not source geometry. |
| `SHOTSHELL_WALL_MM = 0.65` | Uniform visible wall for the open hull; wall thickness is absent from cartridge data. |
| `SHOTSHELL_EDGE_MM = 0.12` | Display chamfer, not a tolerance or cartridge dimension. |
| `FOLD_CRIMP_LEAVES = 6` | Generic fold presentation; a known fold closure does not source the leaf count or seams. |
| Primer omitted | The primer diameter stays null; no guessed primer is drawn. |
| Plastic-looking hull / brass-coloured head | Rendering choices, not proof of material composition. Empty hull/head material arrays stay empty. Red comes from the cited colour; a named sRGB shade makes it readable. |
| Generic closure card | Inset visual seal; not a sourced wad, shot cup or Federal component. |

The viewer labels the roll proxy, lengths, omitted primer and visual construction
in its ammo information text. `?ammo=12-gauge-00-buck` shows loaded shell and hull
near the displayed gun's ejection region. `?ammoCase=steel` remains a visual
finish override. Box-magazine round packing remains metallic-only; no pump feed
or runtime ammo consumption is claimed by this export task.

### Named gameplay mass estimates

Deadvox's `shell_12_gauge_00_buck` uses **loaded-shell estimate40g**;
`spent_case_12_h_gauge_h_00_h_buck` uses **fired-hull estimate5g**. Both descriptions
say estimate, not manufacturer specification. These are balancing values, not
new fields in the sourced cartridge record.

Sanity reasoning: nine spheres of diameter8.38mm at roughly11.3g/cm³ lead density
are about `9 × π/6 × 0.838³ × 11.3 ≈ 31.3g` of shot. Allow roughly8.7g for hull,
head, primer, propellant and wad to reach40g. For the empty hull, the display wall
has roughly2.8cm³ of material; a plastic-like density around1g/cm³ plus a couple
of grams for a thin stamped metal head/primer gives a few grams, rounded to5g.
Neither density, allowance nor inner construction is claimed as Federal data;
the display head is not a mass-bearing solid-metal model.

Inventory footprint `[1,1]` is a game grid choice for these small items, not a
conversion of millimetres into grid cells. Loaded shells stack25 (a convenient
box-size gameplay limit); empty hulls stack10000 like the existing spent-case
counter. The new `ammo` category is inventory classification only; calibre lives
on the model entry. Actual ammo loading/firing belongs to later firearm work.

## Checks

Targeted tests protect mm→m lengths/rim and metadata, physical open-mouth rays,
source-colour routing, known fold selection, viewer/export dimension agreement,
and Deadvox's actual `prepareModel`/ground transform plus stack/counter identity.
No new cartridge-data consistency rule was added: source nulls remain admitted,
and only the approved visual proxies fill presentation gaps.
