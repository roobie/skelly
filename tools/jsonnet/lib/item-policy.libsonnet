// Fills the required item policy a source leaves out, so the compiled row stays explicit. Holds no product table,
// so any mod can import it.
{
  itemPack(content):: content + (if std.objectHas(content, 'items') then {
    items: [{ workInProgress: false } + item for item in content.items],
  } else {}),
}
