// A skill curve from authored endpoints: the value at skill level zero and at expert level.
{
  between(novice, expert, halfLifeLevels):: { expert: expert / novice, halfLifeLevels: halfLifeLevels },
}
