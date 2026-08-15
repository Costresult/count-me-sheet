import { parseUtterance } from "./src/lib/voice/parser";
for (const s of ["35 CL","99 CL","140 CL","otuz bes cl","doksan dokuz santilitre","Rakı Tekirdağ 35 CL 1","+1","artı 1","bir tane daha","artı 25 CL","artı yarım","2. sayfaya geç"]) {
  const u = parseUtterance(s);
  console.log(JSON.stringify(s), "|prod:", JSON.stringify(u.productText), "|terms:", JSON.stringify(u.terms), u.operation);
}
