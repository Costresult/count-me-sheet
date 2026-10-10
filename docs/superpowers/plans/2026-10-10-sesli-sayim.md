# Sesli Sayım — Mevcut Uygulamayı Geliştirme Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut "Count Me In" uygulamasını, onaylı tasarıma göre: sayı/ürün anlamayı düzeltmek, verileri (dosyalar, takma adlar) tarayıcı yerine veritabanında tutmak ve dosya yönetimini tamamlamak.

**Architecture:** Uygulama sıfırdan yazılmaz. Ses motoru (`src/lib/voice/*`) test altına alınıp düzeltilir; kalıcılık katmanı (`src/lib/countme/storage.ts`, `src/lib/voice/aliases.ts`) aynı fonksiyon imzalarıyla IndexedDB yerine Lovable Cloud (Supabase) üstüne taşınır. Arayüz bileşenleri imza değişmediği için korunur.

**Tech Stack:** TanStack Start + React 19 + TypeScript, exceljs, idb (taşınacak), Lovable Cloud (Supabase Auth/Postgres/Storage), vitest (eklenecek).

**Spec:** `docs/superpowers/specs/2026-10-10-sesli-sayim-design.md`

## Global Constraints

- Arayüz Türkçe; bilgisayar öncelikli, telefonda da kullanılabilir.
- Bas-konuş, sürekli dinleme yok; ses dili `tr-TR`.
- Çıktı Excel: Alt Grup, Stok Malı, Birim aynı; **D = toplam formülü** (`=SUM(E{r}:..)`), **E, F, G... = sayfa 1, 2, 3...**; aynı sayfada tekrar okunan ürün `=0.2+0.34` biçiminde formül.
- Gram↔kg ve cl↔litre otomatik çevrilir; paket/koli/diğer birimler otomatik çevrilmez, kullanıcıya sorulur.
- Şişe satırı yoksa litre satırına şişe boyu (0,70 / 0,75 / 0,50) yazılır.
- Emin değilse sessizce tahmin etmez, sorar. Kararlar takma ad/birim tercihi olarak kaydedilir.
- AGENTS.md: yayınlanmış git geçmişi yeniden yazılmaz (force-push, rebase, amend yok); her commit çalışır durumda kalır.
- Takma adlar ve tercihler kullanıcıya bağlıdır, dosyaya değil.

## Review Focus

- "Nokta iki" → 0,2 (200 veya 2 değil); "nokta sıfır sıfır beş" → 0,005; "bir nokta beş" → 1,5.
- Birimsiz, noktasız büyük sayı ("200") sorulur, sessizce yazılmaz.
- "Şivas oniki" / "şivas regal" → `WHY CHIVAS 12 YRS`; "oniki" miktar sanılmaz.
- Excel ön ekleri (`LQR`, `WHY`) söylenmediği hâlde eşleşir.
- Giriş yapılmamış / ağ kopuk durumda veri kaybı olmaz, anlaşılır hata gösterilir.

---

### Task 0: Test altyapısı ve mevcut davranışın tespiti

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Create: `vitest.config.ts`, `src/lib/voice/__tests__/fixtures.ts` (Eylül dosyasından çıkarılmış ürün adı listesi), `src/lib/voice/__tests__/baseline.test.ts`

**Interfaces:**
- Produces: `PRODUCT_FIXTURE: { name: string; unit: string }[]` (Eylül dosyası, 652 satır) — sonraki task'lar test verisi olarak kullanır.

- [ ] **Step 1:** vitest kur, `bun run test` çalışsın (path alias `@` için `vite-tsconfig-paths`/config).
- [ ] **Step 2:** `fixtures.ts` dosyasını `SERVANT_EYLUL_BAR_SAYIM.xlsx`'ten üret (Alt Grup/Stok Malı/Birim). Kullanıcının dosyası repoya girmez, sadece ürün adı+birim listesi girer.
- [ ] **Step 3:** `baseline.test.ts`: mevcut `parseUtterance("malibu nokta iki")` ve `("malibu .2")` sonuçlarını yaz; sonuç beklenen (0,2) değilse test `it.fails`/`todo` olarak işaretli kalsın. Run: `bun run test` → mevcut hatalar listelenir.
- [ ] **Step 4:** Commit `test: add vitest and baseline voice tests`.

### Task 1: Sayı dilbilgisi (nokta/virgül, birim çevirme)

**Files:**
- Modify: `src/lib/voice/numbers.ts`, `src/lib/voice/parser.ts`, `src/lib/voice/units.ts`
- Test: `src/lib/voice/__tests__/numbers.test.ts`

**Interfaces:**
- Produces: `parseUtterance(raw: string): ParsedUtterance` (mevcut tip korunur); yeni alan `needsConfirmation?: "LARGE_BARE_NUMBER"`.

- [ ] **Step 1: Testler (spec değerleriyle):**
  `parseUtterance("malibu nokta iki").terms[0].quantity === 0.2`; `"malibu nokta otuz dört"` → 0.34; `"badem bir nokta beş"` → 1.5; `"x nokta sıfır sıfır beş"` → 0.005; `"x yarım cl"` → 0.005 (litre); `"x elli gram"` → 0.05 (kg); `"x 1 şişe"` → quantity 1, unit şişe; `"x 200"` → `needsConfirmation === "LARGE_BARE_NUMBER"`.
- [ ] **Step 2:** Run `bun run test numbers` → FAIL.
- [ ] **Step 3:** `numbers.ts` içine `parseDecimalAfterPoint(tokens, i)` ekle: "nokta/virgül" sonrası rakam kelimeleri; "sıfır" öncü sıfırları korur, sayı kelimesi ("otuz dört") bütün olarak ondalık kısmı verir. `parser.ts` bunu `parseNumberAt` çağrısından önce dener. Gram/cl çevirisi `units.ts`'de saf fonksiyonlar (`gramToKg`, `clToLitre`).
- [ ] **Step 4:** Run → PASS; mevcut testler yeşil.
- [ ] **Step 5:** Commit `fix: spoken decimals (nokta/virgül) and unit conversions`.

### Task 2: Ürün adı eşleştirme (İngilizce markalar, adındaki sayılar, ön ekler)

**Files:**
- Modify: `src/lib/voice/text.ts`, `src/lib/voice/productIndex.ts`, `src/lib/voice/matcher.ts`, `src/lib/voice/parser.ts`
- Test: `src/lib/voice/__tests__/matcher.test.ts`

**Interfaces:**
- Consumes: `PRODUCT_FIXTURE` (Task 0), `parseUtterance` (Task 1).
- Produces: `matchProduct(query: string, rows: ProductRow[], aliases: AliasRecord[]): MatchResult` (mevcut imza); `stripGroupPrefix(name: string): string` (`LQR`, `WHY`, ... ön eklerini atar; `productIndex.ts`).

- [ ] **Step 1: Testler** (fixture üzerinde): "cek deniels" → `WHY JACK DANIELS ORG` adayları arasında; "jack daniels apple" → `WHY JACK DANIELS APPLE` (en üstte); "şivas oniki" → `WHY CHIVAS 12 YRS`; "malibu" → `LQR MALIBU`; "coca cola 1 lt" tek ürün olarak eşleşir (1 miktar sayılmaz).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** `phoneticKey` içine İngilizce→Türkçe okunuş kuralları ekle (`ch`↔`ş`, `j`↔`c`, sondaki `s`/`'s` düşer); `productIndex` satırlarına `stripGroupPrefix` uygulanmış `tokens` ekle; `parser.ts` ürün adındaki sayıyı miktardan ayırırken önce eşleşen ürünün adında o sayı var mı bakar (parse ↔ match sırası: eşleşme adayı varsa adındaki sayı ürün adına yazılır).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `fix: match English brand names, numbers in names, group prefixes`.

### Task 3: Birim yönlendirme kuralları

**Files:**
- Modify: `src/lib/voice/unitResolver.ts`
- Test: `src/lib/voice/__tests__/unitResolver.test.ts`

**Interfaces:**
- Consumes: ürünün satırları (aynı ürün adına bağlı birim satırları), `ParsedUtterance`.
- Produces: `resolveTarget(...)` sonucu `{ kind: "write"; rowId; value } | { kind: "ask"; options: RowOption[]; reason: "MULTIPLE_BOTTLE_ROWS" | "NO_ROW_FOR_UNIT" }`.

- [ ] **Step 1: Testler:** `MALIBU` (LITRE + SISE 70 CL) + "1 şişe" → 70 CL satırına 1; litre satırı yok/şişe satırı yok → litre satırına 0,70; hem 70 hem 75 CL varsa `ask`; "3 paket" satırı yoksa `ask` (otomatik çevirme yok); "nokta iki" → LITRE/KILOGRAM ana satır; "elli gram" → KILOGRAM satırına 0.05.
- [ ] **Step 2:** Run → FAIL (mevcut `unitResolver.ts` bunları karşılıyorsa PASS; farkları düzelt).
- [ ] **Step 3:** Eksik kuralları `unitResolver.ts`'e ekle (mevcut öğrenme/`findUnitCorrection` korunur).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `fix: unit routing rules`.

### Task 4: Çıktı Excel yapısı (D toplam, sayfa kolonları, formüller)

**Files:**
- Modify: `src/lib/countme/workbook.ts`, `src/lib/countme/pages.ts`, `src/lib/countme/calc.ts` (gerekirse)
- Test: `src/lib/countme/__tests__/workbook.test.ts`

**Interfaces:**
- Produces: `exportWorkbook(session: StoredSession): Promise<ArrayBuffer>` (mevcut ihracat fonksiyonunun adı kodda doğrulanıp aynen kullanılır).

- [ ] **Step 1: Test:** 2 sayfa, bir üründe sayfa 1'de iki okuma → hücre formülü `0.2+0.34`; D hücresi `SUM(E:F)` toplam formülü; Alt Grup/Stok Malı/Birim değişmeden kalır; satır sırası korunur.
- [ ] **Step 2:** Run → FAIL veya PASS; fark varsa düzelt (README'deki "D:P/Q sabit kodlama yok, TOTAL dinamik" kuralı korunur).
- [ ] **Step 3:** Commit `fix: export layout and formulas`.

### Task 5: Veritabanı ve giriş (Lovable Cloud)

**Files:**
- Create: `supabase/migrations/*_init.sql` (Lovable üzerinden uygulanır), `src/integrations/supabase/*`, `src/routes/login.tsx`
- Modify: `src/routes/__root.tsx` (oturum kontrolü)

**Interfaces:**
- Produces: tablolar `sessions` (id, user_id, name, file_name, sheet_name, status, edits jsonb, view jsonb, pages jsonb, added_columns jsonb, unmatched jsonb, history jsonb, original_path, created_at, updated_at), `aliases`, `corrections`, `unit_corrections`; storage bucket `originals`; tümünde `user_id = auth.uid()` RLS.

- [ ] **Step 1: (Kullanıcı eylemi)** Lovable'da Cloud/veritabanını etkinleştir; e-posta+şifre girişini aç. (Lovable MCP araçlarıyla `enable_database` yapılabilir; kullanıcıya sorarak.)
- [ ] **Step 2:** Şemayı uygula, RLS ve bucket politikalarını yaz; `get_advisors` güvenlik taraması temiz olsun.
- [ ] **Step 3:** Giriş sayfası + oturum yoksa yönlendirme.
- [ ] **Step 4:** Commit `feat: database schema and login`.

### Task 6: Kalıcılık katmanını veritabanına taşıma

**Files:**
- Modify: `src/lib/countme/storage.ts`, `src/lib/voice/aliases.ts`
- Create: `src/lib/countme/storageRemote.ts`, `src/lib/countme/migrateLocal.ts`
- Test: `src/lib/countme/__tests__/storage.test.ts` (adapter sözleşmesi)

**Interfaces:**
- Consumes: Task 5 tabloları.
- Produces: mevcut imzalar aynen korunur: `saveSession`, `getSession`, `listSessions`, `deleteSession`, `renameSession`, `setActiveId`, `getActiveId`, `listAliases`, `deleteAlias`, `learnAlias`, `recordCorrection`, `listCorrections`, `learnUnitCorrection`, `listUnitCorrections`, `findUnitCorrection`; yeni `migrateLocalToRemote(): Promise<{ sessions: number; aliases: number }>`.

- [ ] **Step 1: Test:** bellek içi sahte backend ile `saveSession`→`listSessions`→`deleteSession` sözleşmesi; `learnAlias` aynı alias'ı ikinci kez `correctionCount` artırır.
- [ ] **Step 2:** Uzaktan uygulamayı yaz (özgün xlsx Storage'a, meta+durum tabloya; büyük `edits` güncellemeleri debounce ile).
- [ ] **Step 3:** İlk girişte eski IndexedDB verisi varsa kullanıcıya "Bu cihazdaki kayıtları taşı" önerisi.
- [ ] **Step 4:** Ağ hatasında kullanıcıya Türkçe uyarı; yerel değişiklik kaybolmasın (başarısız kayıt bekleyen kuyrukta).
- [ ] **Step 5:** Commit `feat: persist sessions and learning in database`.

### Task 7: Dosya yönetimi arayüzü

**Files:**
- Modify: `src/components/countme/EmptyState.tsx`, `src/components/countme/InventorySidebar.tsx`
- Test: `src/components/countme/__tests__/InventorySidebar.test.tsx` (yalnızca silme onayı akışı)

- [ ] **Step 1:** Mevcut kodu oku; sürükle-bırak yükleme, listeden aç, **silme (onay diyaloğu)**, **indir (sayım bitmeden de)** özelliklerinden eksik olanları ekle.
- [ ] **Step 2:** Test: sil → onay → `deleteSession` çağrılır; vazgeç → çağrılmaz.
- [ ] **Step 3:** Commit `feat: file list, delete confirm, download anytime`.

### Task 8: Uçtan uca doğrulama ve doğruluk raporu

**Files:**
- Create: `src/lib/voice/__tests__/accuracy.test.ts`

- [ ] **Step 1:** Eylül fixture'ındaki dolu ürünler için sesli söyleniş örnekleri (`"malibu nokta iki"`, `"jack daniels apple 1 şişe"`, `"şivas oniki"`) üret; her birinin doğru satıra gittiğini doğrula; hedef: bu örneklerin tamamı geçer.
- [ ] **Step 2:** `bun run build` + `bun run lint` temiz; Lovable önizlemesinde gerçek mikrofonla elle kontrol listesi (kullanıcı yapar): nokta iki, şivas oniki, jack daniels, 1 şişe, yeni sayfa, indir.
- [ ] **Step 3:** Commit `test: accuracy fixtures`.

---

## Notlar (spec ile farklar)

- **Çift dilli ses tanıma:** Tarayıcının hazır ses tanıması aynı anda iki dili güvenilir şekilde çalıştırmıyor. Plan: `tr-TR` ile devam + okunuş eşleştirme + öğrenen takma adlar. Yetmezse ücretli bulut ses tanımaya geçmek ayrı bir iştir (spec'teki karar korunuyor).
- **Giriş:** Verilerin "her yerden" hatırlanması için e-posta+şifre girişi (benim kararım; kullanıcı söylemedi).
