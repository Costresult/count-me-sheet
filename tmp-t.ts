import { parseCommand } from "./src/lib/voice/commands";
for (const s of ["2. sayfaya geç","sayfa 2","sayfa iki","ikinci sayfaya geç","ikinci sayfa","sayfa bir","birinci sayfaya geç","sonraki sayfa","önceki sayfa","10. sayfa","birincisi","Rakı Tekirdağ 35 CL"])
  console.log(JSON.stringify(s), JSON.stringify(parseCommand(s)));
