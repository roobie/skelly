local s = import 'city_car.spec.libsonnet';
local body = import 'car-body.libsonnet';
// The electric car's nose: this file is what the thing tool indexes for a vehicle derived from this one.
body('city_car', s) + [
  row
  for row in body('electric_city_car', s + { blankNose: true, noseAccent: 'plastic-green' })
  if row.id == 'electric_city_car_front_bumper'
]
