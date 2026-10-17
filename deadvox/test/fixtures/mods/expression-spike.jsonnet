{
  sleepHealsPredicate: 'recoveryPerGameHour > 0.0 && calories >= caloriesFloor && hydration >= hydrationFloor && (!hasCeiling || fatigue <= fatigueCeiling)',
  panelEffect: 'powered && authorized && !doorOpen ? "open-door" : "none"',
  wasm: {
    starlark: {
      sleepHealsPredicate: 'recoveryPerGameHour > 0.0 and calories >= caloriesFloor and hydration >= hydrationFloor and (not hasCeiling or fatigue <= fatigueCeiling)',
      panelEffect: '"open-door" if powered and authorized and not doorOpen else "none"',
      runaway: 'def loop():\n    return loop()\nloop()',
      stateful: 'calories = calories',
      undeclared: 'calories >= missingFloor',
      wrongOperand: 'calories < hasCeiling',
      float: 'numerator / denominator',
    },
    luau: {
      sleepHealsPredicate: 'recoveryPerGameHour > 0.0 and calories >= caloriesFloor and hydration >= hydrationFloor and (not hasCeiling or fatigue <= fatigueCeiling)',
      panelEffect: 'if powered and authorized and not doorOpen then "open-door" else "none"',
      runaway: 'while true do end',
      stateful: 'calories = calories',
      undeclared: 'calories >= missingFloor',
      wrongOperand: 'calories < hasCeiling',
      float: 'numerator / denominator',
    },
  },
}
