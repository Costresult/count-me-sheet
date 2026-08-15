import { parseUtterance } from "./src/lib/voice/parser.ts";
for (const s of ["42 CL","35 CL","35cl","1.42 CL","+42 CL","arti 35 cl","otuz bes cl","140 cl","kirk iki cl"]) {
  const p = parseUtterance(s);
  console.log(JSON.stringify(s), p.quantity, p.normalizedUnit, "terms:",JSON.stringify(p.terms), "add:",p.additive, "prod:",JSON.stringify(p.productText));
}
