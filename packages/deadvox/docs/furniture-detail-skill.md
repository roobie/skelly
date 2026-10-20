---
read_if:
  - you're an agent asked to refine diegetic furniture appearance
  - you need a repeatable furniture refinement workflow rather than a gameplay change
---

# Furniture detail skill

## When to use

Use this workflow for recognizable visual furniture refinement. Do not use it to change collision, storage, search, or hidden-loot disclosure. The procedure and its reasons belong to `docs/content.md`, "Furniture visual shapes"; this skill sequences that procedure rather than owning another rendering contract.

## Execution

1. Read `docs/content.md`, "Refining a fixture", and survey the requested fixture. Exit with a stated recognition goal and the proposed front/silhouette cues, independent of hidden contents.
2. Follow that procedure's content and geometry boundaries. Exit with a definition-owned construction and bounded parts; if the requested construction needs a different gameplay authority, stop for a scoped decision rather than disguising it as decoration.
3. Use `tools/furniture-detail-probe.mjs` for the isolated look and draw report. Exit with a screenshot and recorded fixture/draw evidence. A plausible screenshot is not permission to skip the draw budget or envelope checks.
4. Exercise the contracts in `test/furnitureDetail.test.ts` and the applicable tiered checks in `../../AGENTS.md`, "Before pushing: tiered checks". Exit with passing evidence; prove changed tricky invariants with their targeted mutants rather than adding near-duplicate tests.
5. Inspect the result in the game and request the operator's look verdict under `../../docs/PROCESS.md`, "Reviews by eye and by play". Finish with the screenshot, cost report, test evidence and explicit verdict, or report blocked while the subjective decision is pending. Do not substitute isolated rendering for in-world approval.
