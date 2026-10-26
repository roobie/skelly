---
read_if:
  - you author or validate a gun trace record
  - you compare a gun design with a reference image
  - you change the trace record or overlay tooling
---

# Gun tracing

A record beside its SVG keeps provenance and uncertainty with the authored content rather than in a disposable script or a hand-synchronized measurement table. The SVG owns contour vertices, so derived envelopes cannot silently disagree with the drawing. Study docs retain interpretation and limits instead of copying measurements. See `../references/fal-profile.trace.jsonnet`, `reference`, `../src/gun/traceRecord.ts`, `resolveTraceReference`, and `../src/cli/traceCheck.ts`, `checkTraceRecords`.

Reference evidence is optional because invented and science-fiction guns can author proportions without a photograph. A new traced gun is content, not a new code selector; see `../src/gun/traceRecord.ts`, `parseTraceRecord`. Sourced, derived and unknown values remain distinct because a visual envelope or extrapolation must not acquire the authority of a published dimension.

The overlay is a gun-tool CLI so authors can inspect geometry before an editor photo underlay exists, without each study rewriting its renderer. Explicit view, landmarks and physical scale preserve author judgement: automatic fitting could hide precisely the proportion errors the comparison is meant to reveal. Images and composed PNGs stay outside the repository to avoid redistributing reference photographs. See `../src/cli/traceOverlay.ts`, `main`, and `../src/gun/traceProjection.ts`, `projectPoint`.

Shared arithmetic avoids re-deriving scale while keeping reference choice and endpoint selection with the author; see `../src/gun/trace.ts`, `calibrateMmPerPixel`, and `../src/gun/units.ts`, `mmToU`. A deliberately limited SVG vertex format rejects unsupported geometry rather than reporting approximate envelopes as exact; see `../src/gun/traceSvg.ts`, `parseTraceSvg`.
