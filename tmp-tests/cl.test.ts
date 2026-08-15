import { parseUtterance } from "../src/lib/voice/parser";
import { resolveDestination } from "../src/lib/voice/unitResolver";
import { detectRowUnit } from "../src/lib/voice/units";

const row = (id: string, name: string, unitText: string) => ({
  rowId: id, name, label: `${name} ${unitText}`, unitText, groupKey: "g",
  unitInfo: detectRowUnit(unitText, name),
} as any);

const litre = row("r1", "PRODUCT X", "LITRE");
const sise = row("r2", "PRODUCT X", "SISE 35 CL");

for (const t of ["35 cl", "99 CL", "140 cl", "35 santilitre", "35cl"]) {
  const u = parseUtterance(t);
  const d = resolveDestination([litre], u);
  console.log(t, "| terms:", JSON.stringify(u.terms), "->", d.confidence, JSON.stringify(d.writes));
}
const amb = resolveDestination([litre, sise], parseUtterance("35 cl"));
console.log("ambiguous:", amb.confidence, amb.writes.length, amb.options.map(o=>`${o.row.rowId}=${o.value}`));
console.log("plus:", JSON.stringify(parseUtterance("artı 35 cl").terms), parseUtterance("artı 35 cl").additive);
console.log("+1:", JSON.stringify(parseUtterance("+1").terms), parseUtterance("+1").additive);
