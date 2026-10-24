// Straight box magazines measured from photos, in gun units. Each is a photo estimate that needs visual review: the
// depth (front to back) and the length below the well are read from a side photo at the scale its `scale` names,
// and each rounds to the grid the magazine builds on. A side photo cannot show width, so `widthU` states its own basis. The
// body length is the visible length plus the part the lower hides, so the seated magazine shows what the photo does.
{
  profiles: {
    // The 7.62×51 SR-25 pattern magazine BR chose for the large AR frame, from the same brochure page as that
    // frame's receiver. At 1.354 mm/px it measures 62 px deep (83.8 mm) and 56 px below the well (76.2 mm, 6.63u).
    'sr25-straight': {
      photo: 'https://www.snipershide.com/shooting/attachments/img_7687-jpeg.8878983/',
      scale: 'the "Length: 44 inches" printed beside the rifle on the same page',
      // 7.29u measured; a box's half-depth stays on the 0.25u grid, so depth steps by 0.5u, and 7.5u would leave no
      // clearance in the large frame's 7.5u well.
      depthU: 7,
      // 6.63u visible below the well plus the 4.5u the large frame's lower and receiver hide above the well's rear
      // lip, rounded to the magazine grid.
      bodyLengthU: 11.25,
      // Not visible in a side photo: the widest the receiver's 2.7u feed slot over the well admits on the grid.
      widthU: 2.5,
      // The page's printed "Capacity: 20 round".
      capacity: 20,
    },
  },
}
