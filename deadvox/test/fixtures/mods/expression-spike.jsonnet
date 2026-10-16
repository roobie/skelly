{
  sleepHealsPredicate: 'recoveryPerGameHour > 0.0 && calories >= caloriesFloor && hydration >= hydrationFloor && (!hasCeiling || fatigue <= fatigueCeiling)',
  panelEffect: 'powered && authorized && !doorOpen ? "open-door" : "none"',
}
