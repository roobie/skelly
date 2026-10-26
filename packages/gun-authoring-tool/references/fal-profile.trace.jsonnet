local variants = 'https://en.wikipedia.org/wiki/FN_FAL';
local systems = 'https://weaponsystems.net/system/1013-FN+FAL';
local sourced(value, source) = { kind: 'sourced', value: value, source: source };
local derived(value, reason) = { kind: 'derived', value: value, reason: reason };
local unknown(reason) = { kind: 'unknown', reason: reason };
local extended5063 = sourced(998, systems);
local extended5061 = 1095;
local folded5061 = 845;
local barrel5061 = 533;
local barrel5062 = 457;
local overallPixels = derived([[27, 94], [1333, 94]], 'Visible buttplate-to-muzzle span at the provisional bore; not an independent sourced dimension');
local feature(paths) = { kind: 'derived', paths: paths };
{
  title: 'FAL Para provisional profile',
  document: 'docs/fal-trace.md',
  values: {
    barrel5062Mm: sourced(barrel5062, variants),
    barrel5063WikiMm: sourced(440, variants),
    barrel5063SystemsMm: sourced(436, systems),
    extended5063Mm: extended5063,
    folded5063Mm: sourced(748, systems),
    extended5061Mm: sourced(extended5061, systems),
    folded5061Mm: sourced(folded5061, systems),
    barrel5061Mm: sourced(barrel5061, systems),
    extrapolatedFolded5062Mm: derived(folded5061 - (barrel5061 - barrel5062), 'Subtract barrel difference from the 50.61 folded total; an assumption, not a published 50.62 total'),
    minimumContourAllowancePx: derived(3, 'Manual visible-edge picking precision; overlaps are less certain'),
    maximumContourAllowancePx: derived(5, 'Manual visible-edge picking precision; overlaps are less certain'),
    systematicScaleError: unknown('Photographed sight radius and stock geometry may differ from the provisional variant'),
    receiverLengthMm: unknown('Visible envelope is not a sourced component length'),
    receiverHeightMm: unknown('Overlaps obscure complete receiver boundaries'),
    hingeLateralOffsetMm: unknown('Not resolved by a side photograph'),
    boreYPx: derived(94, 'Provisional visual bore datum, not the optical sight line'),
    registrationXPx: derived(748, 'Provisional receiver/barrel interface, not proof of fit'),
  },
  reference: {
    id: 'fal-para-supplied-side-profile',
    svg: 'fal-profile.svg',
    calibration: {
      pixels: derived([[395, 28], [1116, 28]], 'Sight-assembly silhouette centres projected onto their common top datum; not resolved aperture/post centres'),
      lengthMm: sourced(549, systems),
    },
    allowancePercent: derived(5, 'Registration/perspective authoring allowance, not a statistical confidence interval; systematic variant error remains unknown'),
    comparisons: {
      published5063: { pixels: overallPixels, lengthMm: extended5063 },
      extrapolated5062: {
        pixels: overallPixels,
        lengthMm: derived(extended5061 - (barrel5061 - barrel5062), 'Subtract barrel difference from the 50.61 extended total; an assumption, not a published 50.62 total'),
      },
    },
    landmarks: {
      upperVentCentres: derived([[939, 63], [990, 63], [1041, 63]], 'Approximate visible upper-slot centres; lower openings do not establish a hidden symmetric pattern'),
      magazineRear: derived([[599, 157], [603, 294]], 'Visible rear edge; unequal insertion depth and perspective may affect apparent rake'),
      magazineFront: derived([[705, 133], [706, 268]], 'Visible front edge; does not establish a curved centreline'),
      magazineBase: derived([[603, 294], [700, 275]], 'Visible sloping base'),
      gripMidline: derived([[463, 150], [392, 250]], 'Picked neck-to-heel midline, stronger silhouette cue than a generic vertical grip'),
      gripHeel: derived([[359, 240], [425, 270]], 'Visible heel slope toward the muzzle'),
      stockUpperAxis: derived([[28, 98], [305, 91]], 'Near-horizontal upper tube proxy'),
      stockLowerRear: derived([[63, 218], [161, 150]], 'Rising rear run; elbow and forward run remain separate contours'),
      buttplateAxis: derived([[27, 97], [40, 249]], 'Picked buttplate rake proxy, lower end forward'),
    },
    features: {
      muzzleDevice: feature(['flash-hider']),
      exposedBarrel: feature(['barrel']),
      gasBlockAndSight: feature(['gas-block-front-sight']),
      slingLoop: feature(['sling-loop']),
      forend: feature(['handguard']),
      upperReceiver: feature(['upper-receiver']),
      lowerReceiver: feature(['lower-receiver']),
      rearSight: feature(['rear-sight']),
      carryHandle: feature(['carry-handle']),
      receiverControlPin: feature(['receiver-control-pin']),
      magazine: feature(['magazine']),
      magazineRibs: feature(['mag-ribs']),
      grip: feature(['grip']),
      triggerAndGuard: feature(['trigger-guard']),
      hinge: feature(['stock-hinge']),
      upperStockTube: feature(['stock-upper']),
      lowerStockTube: feature(['stock-lower']),
      stockBrace: feature(['stock-brace']),
      buttplate: feature(['buttplate']),
      slots: feature(['slots']),
      stock: feature(['stock-hinge', 'stock-upper', 'stock-lower', 'stock-brace', 'buttplate']),
      overall: feature(['buttplate', 'flash-hider']),
    },
  },
}
