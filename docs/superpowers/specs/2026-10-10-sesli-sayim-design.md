# Sesli Envanter Sayımı — Tasarım

Durum: **onay bekliyor**. Onaydan önce uygulama kodu yazılmayacak.
Not: "(Karar: ben)" ile işaretli yerler kullanıcının söylemediği, benim varsayımlarımdır.

## Amaç ve neden

Restoran/bar ay sonu elle sayım yapıyor. Simpra / Cost Result stok Excel'i ürün başına birden fazla satır içeriyor (birim başına bir satır) ve her sayımı doğru satıra klavyeyle yazmak yorucu. Kullanıcı kağıttan sesli okuyacak, sistem doğru satıra yazacak. Kullanıcı hem hızı hem güvenilirliği hedefliyor ve sistemin zamanla öğrenmesini istiyor.

Referans dosya: `SERVANT_EYLUL_BAR_SAYIM.xlsx` (652 satır; kolonlar: Alt Grup, Stok Malı, Birim, Sayım Miktarı). Birimler: LITRE, KILOGRAM, GRAM, SISE 70/75/50/35 CL, ADET, KOLI 6/12/20/24 ADET, PAKET 25/125 GR, FICI 30/50 LT. Örnek: `LQR MALIBU` için LITRE ve SISE 70 CL satırları vardır.

## Hedefler

1. Kullanıcı bas-konuş ile "Malibu nokta iki" gibi okur, doğru satıra değer yazılır.
2. Sistem yanlış anlamayı kullanıcının seçimlerinden öğrenir; her ay daha az soru sorar.
3. Çıktı, Eylül dosyasıyla aynı yapıda indirilebilir Excel'dir.

## Hedef dışı

- Simpra / Cost Result ile doğrudan entegrasyon (sadece Excel).
- Sürekli dinleme.
- Paket, koli gibi birimleri otomatik kiloya/litreye çevirmek.

## Başarısızlık sayılacak durumlar (anti-hedef)

- Önceki denemede olduğu gibi sesin ~%50'sinin yanlış anlaşılması.
- "Nokta iki"nin 0,2 yerine "200" veya başka bir değer olarak yazılması.
- Sistemin emin olmadan sessizce yanlış satıra yazması.

## Çalışma şekli

### Excel yükleme ve çıktı

- Kullanıcı ay başında Simpra/Cost Result Excel'ini yükler. Satırlar veritabanına alınır.
- Çıktı Excel'i: Alt Grup, Stok Malı, Birim kolonları aynı kalır.
  - **D (Sayım Miktarı):** sayfa kolonlarının toplamını alan formül, örn. `=SUM(E5:J5)`. (Kullanıcı: "1. kolonun önüne toplamları sen alabilirsin.")
  - **E, F, G, ...:** sayfa 1, 2, 3, ... Kolon sayısı sınırsız. (Karar: ben)
- Ondalık ayracı formüllerde Excel uyumlu olması için nokta; ekranda virgül. (Karar: ben)

### Sayfa mantığı

- Kullanıcı kağıt sayfalarını sırayla okur. "Yeni sayfa" düğmesi bir sonraki kolona geçer.
- Aynı sayfada aynı satır birden fazla okunursa hücre değeri formül olarak birikir: `=0.2+0.34`, `=6+10`. Kontrol için kullanıcı Excel'de neyin toplandığını görebilir.
- Geri al düğmesi: son girişi siler. (Karar: ben)

### Ürün eşleştirme

- Ses tanıma sadece metin üretir; metne doğrudan güvenilmez.
- Duyulan ürün adı, yüklenen Excel'deki ürünlerle benzerlikle (yazım ve okunuş) karşılaştırılır; en yakın 2-3 aday çıkarılır.
- Yeterince eminse otomatik yazar. Emin değilse adayları gösterir; kullanıcı seçer.
- Her seçim kaydedilir ("Mali bu" = `LQR MALIBU`). Sonraki seferlerde kayıtlı eşleşme önceliklidir.
- Ürün adı eşleşmesi ile sayı çözümü birbirinden bağımsızdır.
- **İngilizce marka adları (önemli):** Ürünlerin çoğu İngilizce marka (Jack Daniels, Malibu, Gentleman Jack...) ve kullanıcı bunları İngilizce söylüyor. Türkçe tanıma bunları bozuk yazıya çevirebilir.
  - Eşleştirme yazıya değil okunuşa dayanır; "Cek Denyıls" ile "Jack Daniels" eşleşebilmelidir.
  - Ses tanıma Türkçe ve İngilizce birlikte denenir (iki dilde de aynı kayıt çözülür, en güvenilir sonuç veya iki sonucun adayları birleştirilir). (Karar: ben)
  - Her bozuk duyuşun doğru ürüne bağlanması takma ad olarak kaydedilir; ilk sayımlarda çok soracak, sonra azalacak.
- **Ürün adındaki sayılar (önemli):** Excel'de adında sayı olan çok ürün var (127 ürün; örn. `WHY CHIVAS 12 YRS`, `CIN MONKEY 47 50 CL`, `COCA COLA 1 LT`). Kullanıcı "şivas oniki" der; "oniki" miktar değil, ürün adının parçasıdır.
  - Sayı çözümü, ürün adı eşleştirmesinden sonra çalışır: önce ürün adı (içindeki sayılarla birlikte) eşleştirilir, kalan kısım miktar olarak okunur.
  - Belirsizse ("şivas on iki bir şişe" gibi) kullanıcıya sorulur.
- **Ürüne farklı adlarla hitap:** Kullanıcı aynı ürüne "şivas regal" veya "şivas oniki" der; ikisi de `WHY CHIVAS 12 YRS`'a gider. Bu gibi eşdeğer adlar takma ad olarak kaydedilir; ilk kullanımda sistem sorar (Chivas'ın 12/13/15/18/Extra Smokey varyantları var, "regal" hangisi?).
- **Okunuş farkı:** "Chivas" Türkçede "şivas" okunur; eşleştirme "ch" ↔ "ş" gibi İngilizce marka okunuşlarını Türkçe yazılışa çevirir. (Karar: ben)
- **Excel'deki ön ekler söylenmez:** `LQR`, `WHY` gibi grup kısaltmaları ürün adından çıkarılarak eşleştirilir. Kullanıcı "Jack Daniels Apple" der, Excel'de `WHY JACK DANIELS APPLE` yazar. Aynı markanın varyantları (Apple, Honey, Fire, Bonded...) varsa sistem varyantı ayırt edemezse adayları gösterir.

### Sayı ve birim kuralları

- **Nokta/virgül sonrası ondalıktır:** "nokta iki" = 0,2; "nokta otuz dört" = 0,34; "bir nokta beş" = 1,5.
- **"Nokta sıfır sıfır beş"** = 0,005 (rakam rakam okunan ondalık).
- **"Yarım cl"** = 0,005 litre. **"50 gram"** = 0,05 kg (ürünün KILOGRAM satırına). (Karar: ben)
- Gram↔kg ve cl↔litre otomatik çevrilir (saf matematik).
- **Noktasız tam sayı + birim** o birimin satırına gider: "1 şişe", "3 paket", "2 koli".
- **Birimsiz ve noktasız büyük sayılar** ("200") şüpheli sayılır; kullanıcıya sorulur.
- **Şişe:**
  - Tek şişe satırı varsa oraya yazar.
  - Birden fazla şişe satırı varsa (70/75/50 cl) hangisi olduğunu sorar ve hatırlar.
  - Hiç şişe satırı yoksa litre satırına şişe boyunu yazar (0,70 / 0,75 / 0,50), öğrenilmiş şişe boyuna göre.
- **Paket, koli ve diğerleri:** satırı yoksa otomatik çevirme yok; kullanıcıya sorar, seçimi hatırlar.
- Hiçbir durumda sessizce tahmin etmez; emin değilse sorar.

### Ses

- Bas-konuş (düğmeye basılı tutarak veya bir kez basıp bir cümle). Sürekli dinleme yok.
- Dil: Türkçe.
- Önce tarayıcının hazır ses tanıması kullanılır. Yeterli doğrulukta değilse ücretli bulut ses tanımaya geçilir; bu karar ilk denemeden sonra verilir. (Karar: ben)

### Veritabanı (Lovable Cloud / Supabase)

Saklanacaklar: yüklenen ürün satırları, sayım oturumları ve sayfa değerleri (hücre başına formül), öğrenilmiş takma adlar, öğrenilmiş şişe boyları, öğrenilmiş birim seçimleri.

### Cihaz

Telefon (Karar: ben). Kullanıcı cihazı henüz söylemedi; farklıysa tasarım güncellenir.

## Kısıtlar

- Proje Lovable'a bağlı (TanStack Start + TypeScript + Tailwind + shadcn). Yayınlanmış git geçmişi yeniden yazılmayacak; commit'ler çalışır durumda kalacak.
- Arayüz Türkçe.

## Builder'a bırakılanlar

- Benzerlik ve okunuş eşleştirme algoritmasının seçimi.
- Otomatik yazma için güven eşiği (ayarlanabilir olmalı).
- Ekran düzeni ve ayrıntıları.
- Excel okuma/yazma kütüphanesi (formül yazabilmeli).
