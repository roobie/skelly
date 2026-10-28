local nonMagnifyingEyeReliefU = 14;
{
  scopes: {
    'lpvo-1-6x': { ocularOpeningDiameterU: 2.625, eyeReliefU: 7.5, envelopeLengthU: 22.25 },
    'hunting-3-9x': { ocularOpeningDiameterU: 2.75, eyeReliefU: 8, envelopeLengthU: 26.25 },
  },
  miniReflex: { eyeReliefU: nonMagnifyingEyeReliefU, windowHalfWidthU: 1, windowBottomY: 0.75, windowTopY: 2.5 },
  tubeDot: { eyeReliefU: nonMagnifyingEyeReliefU },
  holographic: {
    eyeReliefU: nonMagnifyingEyeReliefU,
    hoodFrontX: 0.25,
    batteryRearX: -3,
    batteryTopY: 1,
    nearFrameThicknessU: 0.25,
    nearFrameDepthU: 0.25,
  },
}
