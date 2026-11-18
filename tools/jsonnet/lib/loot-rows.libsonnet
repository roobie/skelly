// Loot table rows. A row id defaults to what the row drops, so only a table that drops one thing twice names its rows.
{
  item(id, weight, count=null, condition=null, fill=null, loose=false, row=id):
    { id: row, item: id, weight: weight }
    + (if count == null then {} else { count: count })
    + (if condition == null then {} else { condition: condition })
    + (if fill == null then {} else { fill: fill })
    + (if loose then { loose: true } else {}),
  table(id, weight, row=id): { id: row, table: id, weight: weight },
  nothing(weight, row='nothing'): { id: row, nothing: true, weight: weight },
}
