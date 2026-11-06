# Malum Mecra — Yayın Oyunu (malumnames.com)

Spor temalı, Codenames'ten esinlenilmiş takım oyunu. YouTube yayınlarında ekrana yansıtmak için tasarlandı: büyük tipografi, pastel mor–sarı tema, 16:9 sunum düzeni.

## Özellikler

- **200 isimlik havuz**: futbol (70), basketbol (42), tenis (30), Formula 1 (25), atletizm (20) ve sansasyon yaratan diğer sporcular (13).
- **RANDOM**: havuzdan kategori dengeli 20 isim seçer ve takımları karıştırır.
- **Oyun düzeni**: 8 mor, 8 sarı, 4 sivil. Kurulumda canlı sayaç ve doğrulama.
- **Spymaster modu**: renkleri ve kategorileri yalnızca spymaster görür. Cihaz bazlıdır (localStorage).
- **Tur yönetimi**: doğru tahmin sırayı korur; rakip veya sivil kart sırayı devreder. 8 ismi ilk açan turu kazanır.
- **Seri skoru**: turlar arası skor korunur, istenirse sıfırlanır.
- **Senkron**: açık tüm cihazlar (yayın ekranı + telefonlar) aynı oyunu görür.
- **Sıfır bağımlılık**: yalnızca Node.js standart kütüphaneleri. Build adımı yok. Fontlar siteye gömülüdür.

## Yerel çalıştırma

```bash
node server.js
# → http://localhost:3000
```

`PORT` ortam değişkeni desteklenir (varsayılan 3000).

## Dosya yapısı

```
server.js            Node HTTP sunucusu + SSE + oyun kuralları
public/index.html    Arayüz iskeleti
public/style.css     Tema ve düzen (mor/sarı, büyük tipografi)
public/app.js        İstemci mantığı, RANDOM, spymaster, kazanma
public/names.js      200 isimlik havuz (kategoriler burada)
public/fonts/        Anton + Manrope (yerel woff2)
public/logo-tile.png Marka logosu (başlık, kazanan ekranı, favicon)
public/favicon.png   Site ikonu
```

## Render

- **Build Command**: `npm install` (bağımlılık yok)
- **Start Command**: `node server.js`
- `PORT` değişkenini Render otomatik verir; kod onu kullanır.

GitHub `main` dalına yapılan her push otomatik deploy edilir (Render'da Auto-Deploy açıksa).

## İsim havuzunu düzenleme

`public/names.js` içindeki `NAME_POOL` nesnesini düzenleyin. Toplam **200** isim olmalıdır; sayı tutmazsa tarayıcı konsolunda uyarı görürsünüz.

## Yayın notları

- **F11** ile tam ekran; düzen 1920×1080 için optimize edildi, 1440×900'de de taşmaz.
- **Spymaster'ı yayın ekranında açık bırakmayın.** Telefonunuzdan `?spy=1` ile veya alttaki düğmeyle açın.
- Tek global oda vardır: tüm açık sekmeler aynı masayı gösterir. Yayın öncesi "Yeni Oyun" ile temizleyin.
