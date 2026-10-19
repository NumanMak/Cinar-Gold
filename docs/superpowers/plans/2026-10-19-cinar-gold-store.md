# Çınar Gold Mağaza Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mevcut Çınar Gold tek sayfalık sitesini; katalog, hesap, stok, sepet ve kuponlu sipariş akışı olan statik bir online mağazaya genişletmek.

**Architecture:** Düz HTML/CSS/ES modülleri, sunucu yok. Mantık küçük, arayüzden bağımsız ES modüllerinde (`assets/js/shop/*.js`) durur ve `node --test` ile test edilir; sayfalar bu modülleri `<script type="module">` ile kullanır. Tüm kalıcı veri `localStorage` üzerindeki tek bir `createStore` sarmalayıcısından geçer. Ürün verisi `assets/data/products.json` dosyasındadır (ileride bir arka uca taşınabilir).

**Tech Stack:** HTML, CSS (mevcut `style.css` tokenları), vanilla ES modules, WebCrypto (PBKDF2), Node 26 `node --test`, Python 3 (`tools/check.py`, `tools/qa.py`, üretici betik).

**Spec:** `docs/superpowers/specs/2026-10-19-cinar-gold-store-design.md`

## Global Constraints

- Statik site: sunucu, derleme adımı ve harici JS bağımlılığı yok. GitHub Pages'e klasör olduğu gibi yüklenir.
- Kullanıcıya görünen tüm metin Türkçe. Metinlerde `—` ve `–` karakterleri kullanılmaz (`tools/check.py` bunu denetler).
- Katalog: 4 tür (Yüzük, Kolye, Bilezik, Pırlanta) × 5 model × 3 ürün = tür başına 15, toplam 60 ürün.
- Kupon: `CINAR10`, %10, büyük/küçük harf ve baştaki/sondaki boşluk duyarsız.
- Kayan duyuru metni: "Açılışa özel %10 indirim: CINAR10". Soldan sağa kayar; `prefers-reduced-motion: reduce` altında durur.
- Stok 0 ise "Sepete ekle" yerine "Bana bildir" gösterilir.
- Zorunlu izinler (`kvkk`, `islem`) verilmeden hiçbir kişisel bilgi formu (kayıt, giriş, bildirim, sipariş) gönderilemez.
- Kullanıcıdan gelen metin (ad, e-posta, telefon, ürün adı) DOM'a yalnızca `textContent` ile yazılır, `innerHTML` ile asla.
- Tema: koyu ve açık; varsayılan sistem tercihi; seçim `localStorage`'da saklanır.
- Para birimi TL, tam sayı; indirim `Math.round` ile yuvarlanır.
- Görseller yalnızca mevcut `assets/img/p-*-640.webp` / `-1080.webp` dosyalarıdır.
- Sunucusuz olduğu için hesap, stok ve bildirim verisi yalnızca o tarayıcıda yaşar; arayüzde ve README'de "demo" olarak belirtilir.
- Commit mesajları Türkçe, sonlarında `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` satırı bulunur.

## Review Focus

1. `localStorage` bozuk JSON içeriyor: uygulama çökmez, ilgili anahtar varsayılana döner (Task 2).
2. `localStorage` erişimi hata fırlatıyor (gizli pencere, engelli site verisi): sepet o oturumda bellekte çalışır (Task 2).
3. Sepette stoktan fazla adet / sepete eklenmiş ama sonradan stoğu biten veya listeden kalkmış ürün: sipariş reddedilir, diğer ürünlerin stoğu düşmez (Task 3).
4. Doğrudan `urun.html?id=` ile stoğu 0 ya da var olmayan ürüne gitmek: sepete ekleme çıkmaz / "ürün bulunamadı" görünür (Task 7).
5. Ürün adı, ad soyad veya e-posta içinde `<img onerror>` benzeri metin: sayfada düz yazı olarak görünür (Task 7, 9).

---

## File Structure

| Dosya | Sorumluluk |
| --- | --- |
| `tools/gen_products.py` | `products.json` dosyasını deterministik üretir |
| `assets/data/products.json` | 60 ürünlük katalog (üretici çıktısı, repoda tutulur) |
| `assets/js/shop/storage.js` | `createStore`: prefix'li, hata toleranslı localStorage sarmalayıcı |
| `assets/js/shop/catalog.js` | ürün yükleme, model listesi, filtre |
| `assets/js/shop/inventory.js` | stok sorgusu ve düşme |
| `assets/js/shop/coupon.js` | kupon hesabı |
| `assets/js/shop/cart.js` | sepet ve fiyat teklifi |
| `assets/js/shop/orders.js` | sipariş oluşturma |
| `assets/js/shop/auth.js` | kayıt, giriş, oturum |
| `assets/js/shop/consent.js` | izin durumu |
| `assets/js/shop/notify.js` | "Bana bildir" kayıtları |
| `assets/js/shop/theme.js` | tema çözümleme ve uygulama |
| `assets/js/shop/shell.js` | ortak üst bilgi, duyuru şeridi, tema düğmesi, izin penceresi (DOM) |
| `assets/css/shop.css` | mağaza sayfaları, duyuru şeridi, açık tema tokenları |
| `magaza.html`, `urun.html`, `sepet.html`, `hesap.html` | sayfalar |
| `tests/*.test.mjs` | `node --test` birim testleri |
| `tools/e2e_shop.py` | Edge ile uçtan uca senaryo |
| `MVP.md` | temel sürüm özellik kaydı |

Tüm komutlar `C:\Users\Numan\OneDrive\Desktop\cinar-gold` kökünden çalıştırılır. Birim testleri: `node --test tests/`.

---

### Task 1: Ürün verisi

**Files:**
- Create: `tools/gen_products.py`, `assets/data/products.json`, `tests/products.test.mjs`

**Interfaces:**
- Produces: `assets/data/products.json` = JSON dizisi; her öğe `{ id: string, type: "yuzuk"|"kolye"|"bilezik"|"pirlanta", typeLabel: string, model: string, name: string, karat: 14|18|22, gram: number, price: number, img: string, stock: number, desc: string }`. `img` bir kök ad (örn. `p-ring`); dosyalar `assets/img/<img>-640.webp` ve `-1080.webp`. `id` biçimi `<type>-<modelSlug>-<1..3>`.

Model adları: Yüzük = Tektaş, Telkari, Alyans, Baget, Zarif; Kolye = Güneş, Nazar, Zincir, Harf, Kalp; Bilezik = Burma, İşlemeli, Hasır, Çiçek, Kelepçe; Pırlanta = Tektaş, Beştaş, Baget, Halo, Tria. Görsel kökleri: yüzük `p-ring`/`p-solitaire`/`p-bands`, kolye `p-pendant`/`p-chain`, bilezik `p-bangle`/`p-bracelet`, pırlanta `p-solitaire`/`p-earrings`/`p-ring`. Her türde tam 2 ürünün stoğu 0, diğerlerinin 1 ile 12 arasındadır.

- [ ] **Step 1: Write the failing test** in `tests/products.test.mjs` (`node:test`, `node:fs`): `urun sayisi 60`, `her turde 15 urun`, `her turde 5 model, her modelde 3 urun`, `id'ler benzersiz`, `her turde tam 2 urun stokta yok`, `gorsel dosyalari mevcut` (her `img` için 640 ve 1080 webp dosyası var), `fiyat ve stok tam sayi, gram > 0`.
- [ ] **Step 2: Run** `node --test tests/products.test.mjs`. Expected: FAIL (dosya yok).
- [ ] **Step 3: Implement `tools/gen_products.py`**: `main() -> None` deterministik (sabit tohum / hesaplı değerler, rastgelelik yok) olarak dosyayı yazar; ad biçimi `"<Model> <Tür tekil> <n>"` ve `desc` Türkçe tek cümle. Çalıştır: `python tools\gen_products.py`.
- [ ] **Step 4: Run** `node --test tests/products.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** (`git add tools/gen_products.py assets/data/products.json tests/products.test.mjs`).

---

### Task 2: Depolama, katalog, stok, kupon

**Files:**
- Create: `assets/js/shop/storage.js`, `catalog.js`, `inventory.js`, `coupon.js`; Test: `tests/storage.test.mjs`, `tests/catalog.test.mjs`, `tests/inventory.test.mjs`, `tests/coupon.test.mjs`

**Interfaces:**
- Produces:
  - `createStore(backend?: Storage): { get(key: string, fallback: any): any, set(key: string, value: any): void, remove(key: string): void }`. Anahtarlar `cg:` öneki alır, değer JSON'dur. Bozuk JSON veya `backend` hata fırlatırsa `get` `fallback` döner, `set` değeri bellekte tutar (hata fırlatmaz). `backend` verilmezse `globalThis.localStorage`, o da yoksa/erişilemezse bellek.
  - `loadProducts(fetchFn?: typeof fetch): Promise<Product[]>` (`assets/data/products.json` adresini çeker).
  - `modelsOf(products: Product[], type: string): string[]` (ilk görülme sırası).
  - `filterProducts(products: Product[], f: { type?: string, model?: string, inStockOnly?: boolean }, inventory: Inventory): Product[]`.
  - `createInventory(store, products): { stockOf(id: string): number, isSoldOut(id: string): boolean, decrement(id: string, qty: number): void }`. Başlangıç stoğu `products.json`'dan gelir; düşümler `store` içinde `stock` anahtarında `{[id]: kalan}` olarak saklanır. `decrement` stoktan fazlasını düşmeye çalışırsa `Error("STOK_YETERSIZ")` fırlatır. Bilinmeyen id için `stockOf` 0 döner.
  - `applyCoupon(code: string, subtotal: number): { valid: boolean, rate: number, discount: number }`.

- [ ] **Step 1: Write failing tests**: storage (`get` varsayılan döner; bozuk JSON'da fallback; `backend.setItem` hata fırlatsa bile sonraki `get` yazılan değeri verir; önek `cg:`); catalog (`modelsOf` yüzük için 5 model; `filterProducts` tür+model 3 ürün, `inStockOnly` stoğu 0 olanları eler); inventory (`decrement` sonrası `stockOf` azalır; fazla düşüm `STOK_YETERSIZ`; yeniden `createInventory` aynı store ile düşümü hatırlar; bilinmeyen id 0); coupon (`applyCoupon(" cinar10 ", 1000)` → `{valid:true, rate:0.1, discount:100}`; `applyCoupon("CINAR10", 1005)` indirim 101 (yuvarlama); `"XYZ"` → `{valid:false, rate:0, discount:0}`; boş metin geçersiz).
- [ ] **Step 2: Run** `node --test tests/`. Expected: FAIL (modüller yok).
- [ ] **Step 3: Implement** yukarıdaki imzalar. Testlerde `backend` olarak bellek içi sahte nesne, ürün olarak `assets/data/products.json` dosyası kullanılır.
- [ ] **Step 4: Run** `node --test tests/`. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 3: Sepet ve sipariş

**Files:**
- Create: `assets/js/shop/cart.js`, `assets/js/shop/orders.js`; Test: `tests/cart.test.mjs`, `tests/orders.test.mjs`

**Interfaces:**
- Consumes: `createStore`, `createInventory`, `applyCoupon` (Task 2).
- Produces:
  - `createCart(store, products, inventory): { items(): {id: string, qty: number}[], add(id: string, qty?: number): void, setQty(id: string, qty: number): void, remove(id: string): void, clear(): void, count(): number, quote(code?: string): Quote }`.
  - `Quote = { lines: {product: Product, qty: number, lineTotal: number}[], subtotal: number, discount: number, total: number, couponValid: boolean, problems: string[] }`. Listede olmayan ürün satırları `lines`'a girmez ve `problems`'e "<id>: ürün artık yok" eklenir; stoktan fazla adet `problems`'e eklenir.
  - `add` / `setQty` stoktan fazla istenirse `Error("STOK_YETERSIZ")`, bilinmeyen id için `Error("URUN_YOK")` fırlatır. `setQty(id, 0)` satırı siler.
  - `placeOrder(deps: { store, products, inventory, cart }, input: { userId: string | null, name: string, phone: string, payment: "havale" | "magaza", code?: string }): Order`.
  - `Order = { id: string /* "CG-" + 6 haneli sayı */, userId, name, phone, payment, lines: {id, name, qty, unitPrice}[], subtotal, discount, total, createdAt: string /* ISO */, status: "beklemede" }`. Siparişler `store` içinde `orders` anahtarında dizi olarak saklanır; `listOrders(store, userId): Order[]` en yenisi başta döner (ayrıca export edilir).
  - `placeOrder` önce tüm satırlar için stok ve ürün varlığını doğrular; herhangi biri hatalıysa `Error("SIPARIS_GECERSIZ")` fırlatır ve hiçbir stok düşmez. Başarıda stok düşer, sepet temizlenir. Boş sepette `Error("SEPET_BOS")`. `name` veya `phone` boşsa `Error("ZORUNLU_ALAN")`.

- [ ] **Step 1: Write failing tests**: sepet (ekleme, aynı ürünü iki kez ekleyince adet artar, stoktan fazlası `STOK_YETERSIZ`, stoğu 0 üründe `add` hata, `quote("cinar10")` toplamı 1000 TL'lik sepette 900, `quote()` kuponsuz `couponValid:false` ve indirim 0); sipariş (başarıda stok düşer ve sepet boşalır; iki ürünlü sepette biri sonradan başka sekmede tükenirse `SIPARIS_GECERSIZ` ve diğer ürünün stoğu değişmez; boş sepet `SEPET_BOS`; aynı store ile ikinci kez `placeOrder` çağrısı ilk siparişin stoğunu tekrar düşmez ve stok biterse reddedilir; `listOrders` yalnızca ilgili `userId`'nin siparişlerini verir; sepette `products.json`'da olmayan id içeren store ile `quote().problems` dolu).
- [ ] **Step 2: Run** `node --test tests/cart.test.mjs tests/orders.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** imzalara göre. Sepet `store` içinde `cart` anahtarında `[{id, qty}]` tutar. Stok her çağrıda `inventory.stockOf` ile taze okunur (önbelleğe alınmaz).
- [ ] **Step 4: Run** `node --test tests/`. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 4: Hesap, izin ve bildirim modülleri

**Files:**
- Create: `assets/js/shop/auth.js`, `consent.js`, `notify.js`; Test: `tests/auth.test.mjs`, `tests/consent.test.mjs`, `tests/notify.test.mjs`

**Interfaces:**
- Consumes: `createStore` (Task 2).
- Produces:
  - `createAuth(store): { register(i: {name: string, email: string, password: string}): Promise<User>, login(email: string, password: string): Promise<User>, logout(): void, current(): User | null }`, `User = { id: string, name: string, email: string }`. E-posta küçük harfe çevrilip kırpılır. Hatalar: `EMAIL_KAYITLI`, `SIFRE_KISA` (8 karakterden kısa), `GIRIS_HATALI` (hem yanlış şifre hem bilinmeyen e-posta için aynı kod), `ZORUNLU_ALAN`. Şifre PBKDF2-SHA256 (100000 tur, rastgele 16 bayt tuz) ile `globalThis.crypto.subtle` üzerinden hash'lenir; düz şifre hiçbir yerde saklanmaz. Kullanıcılar `store` içinde `users`, oturum `session` anahtarında tutulur ve `session` yalnızca kullanıcı `id`'sini içerir.
  - `createConsent(store): { status(): {granted: boolean, at: string | null, choices: {kvkk: boolean, islem: boolean, iletisim: boolean}}, grant(c: {kvkk: boolean, islem: boolean, iletisim?: boolean}): void, revoke(): void }`. `granted` yalnızca `kvkk` ve `islem` ikisi de `true` iken doğrudur. `grant` zorunlulardan biri eksikse `Error("IZIN_ZORUNLU")` fırlatır ve kayıt değişmez.
  - `createNotify(store): { add(r: {productId: string, email?: string, phone?: string}): NotifyRequest, list(productId?: string): NotifyRequest[] }`. `email` ve `phone` ikisi de boşsa `Error("ZORUNLU_ALAN")`. Aynı `productId` + aynı e-posta/telefon ikinci kez eklenmez (var olan kayıt döner).

- [ ] **Step 1: Write failing tests**: auth (kayıt sonrası `current()` dolu; aynı e-postayı farklı büyük/küçük harfle ikinci kez kaydetmek `EMAIL_KAYITLI`; 7 karakterli şifre `SIFRE_KISA`; yanlış şifre ve bilinmeyen e-posta ikisi de `GIRIS_HATALI`; `store` içeriği düz şifreyi içermez (JSON metninde şifre aranır); `logout` sonrası `current()` null; yeniden `createAuth` aynı store ile oturumu hatırlar); consent (başlangıçta `granted:false`; yalnızca `kvkk` ile `grant` → `IZIN_ZORUNLU` ve `status().granted` hâlâ false; `iletisim` olmadan geçerli; `revoke` sonrası false; `at` ISO metni); notify (e-posta ile ekleme, tekrar eklemede aynı kayıt, ikisi de boşsa `ZORUNLU_ALAN`, `list(productId)` filtreler).
- [ ] **Step 2: Run** `node --test tests/`. Expected: FAIL.
- [ ] **Step 3: Implement** imzalara göre.
- [ ] **Step 4: Run** `node --test tests/`. Expected: PASS.
- [ ] **Step 5: Commit.**

---

### Task 5: Tema modülü ve açık tema tokenları

**Files:**
- Create: `assets/js/shop/theme.js`, `assets/css/shop.css` (yalnızca tema bölümü); Test: `tests/theme.test.mjs`
- Modify: `assets/css/style.css` (sabit renk değerlerini token'a çevirme)

**Interfaces:**
- Produces: `resolveTheme(saved: string | null, prefersDark: boolean): "dark" | "light"` (kayıtlı geçerli değer önceliklidir); `applyTheme(doc: Document, theme: "dark" | "light"): void` (`<html data-theme>` ve `<meta name="theme-color">` günceller, `color-scheme` meta'sını da); `initTheme(store, win?: Window): { current(): string, toggle(): string }`. Tercih `store` içinde `theme` anahtarında.

- [ ] **Step 1: Write failing test** (`resolveTheme(null,true)`→dark, `(null,false)`→light, `("light",true)`→light, `("bozuk",false)`→light).
- [ ] **Step 2: Run** `node --test tests/theme.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement `theme.js`.** `applyTheme` yalnızca DOM nesnesi üzerinde çalışır (testte gerekmez).
- [ ] **Step 4: `style.css` içindeki** `#`, `rgb(`, `rgba(` ile yazılmış arka plan/metin/çizgi renklerini bul (`grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" assets/css/style.css`), tema ile değişmesi gerekenleri mevcut `:root` token'larına (`--black`, `--graphite*`, `--line*`, `--pearl`, `--muted`, `--text-2`) bağla. `assets/css/shop.css` içine `:root[data-theme="light"]` bloğu ekle: açık zemin (`--black`: krem beyaz), koyu metin (`--pearl`: koyu kahve-siyah), altın tonları kontrastı koruyacak şekilde koyulaştırılır (metin/arka plan kontrastı en az 4.5:1).
- [ ] **Step 5: Run** `node --test tests/theme.test.mjs`; sonra `python -m http.server 8000` ile `index.html` sayfasını `data-theme="light"` ile Edge'de aç (`tools/qa.py` ekran görüntüsü yöntemi) ve okunaksız/koyu zeminli kalan bölüm var mı bak. Expected: testler PASS, açık temada tüm bölümler okunur.
- [ ] **Step 6: Commit.**

---

### Task 6: Ortak kabuk (üst bilgi, duyuru şeridi, tema düğmesi, izin penceresi)

**Files:**
- Create: `assets/js/shop/shell.js`
- Modify: `assets/css/shop.css` (şerit, sepet rozeti, modal stilleri), `index.html` (şerit, menü bağlantıları, tema düğmesi, sepet/hesap bağlantısı, `shell.js` yükleme)

**Interfaces:**
- Consumes: `createStore`, `initTheme`, `createCart`, `createConsent`, `createAuth` (Task 2 ile 5).
- Produces: `mountShell(opts: { page: "home"|"shop"|"product"|"cart"|"account" }): Promise<{ store, products, inventory, cart, auth, consent, notify, requireConsent(): Promise<boolean> }>`. `requireConsent()` izin zaten verilmişse `true` döner; değilse erişilebilir bir `<dialog>` açar (başlık "Kişisel verileriniz", KVKK aydınlatma metni, iki zorunlu onay kutusu `kvkk` ve `islem`, bir isteğe bağlı `iletisim`, "Kabul et" ve "Vazgeç" düğmeleri); zorunlular işaretsizken "Kabul et" devre dışıdır; kabulde `consent.grant` çağrılır ve `true`, vazgeçişte `false` döner. Odak pencereye alınır, Esc kapatır, kapanınca odak tetikleyiciye döner.
- Sayfalara eklenen DOM: sayfa üstünde `<div class="promo" role="region" aria-label="Duyuru">` içinde iki kez tekrarlanan kayan satır (kesintisiz döngü için) ve ekran okuyucular için tek `visually-hidden` kopya; `.promo` üzerine gelince veya odaklanınca durur. Üst bilgide tema düğmesi (`aria-pressed`), sepet bağlantısı (`#sepet-sayac` rozeti ile `cart.count()`), hesap bağlantısı ("Giriş" / kullanıcı adı).

- [ ] **Step 1: Implement `shell.js`** imzalara göre; `fetch` hatasında kullanıcıya "Ürünler yüklenemedi, sayfayı yenileyin" ve `console.error`.
- [ ] **Step 2: `index.html` düzenle:** `<body>` başına `.promo`; `.nav__links` ve `.mmenu__links` içine "Mağaza" (`magaza.html`) eklenir; `.nav__actions` içine tema düğmesi, sepet ve hesap bağlantıları eklenir; `<head>`'e `shop.css` ve `<script type="module">import {mountShell} from "./assets/js/shop/shell.js"; mountShell({page:"home"});</script>` eklenir.
- [ ] **Step 3: `shop.css`:** `@keyframes` ile `.promo__track` `translateX(0) → translateX(-50%)` doğrusal sonsuz döngü (yaklaşık 28 sn); `@media (prefers-reduced-motion: reduce)` içinde animasyon kapalı ve metin ortalanmış.
- [ ] **Step 4: Doğrula:** `python -m http.server 8000`, Edge'de `index.html` aç. Expected: şerit soldan sağa kayıyor ve metni "Açılışa özel %10 indirim: CINAR10"; tema düğmesi sayfayı değiştiriyor ve yenilemede korunuyor; konsolda hata yok. `python tools\check.py` PASS.
- [ ] **Step 5: Commit.**

---

### Task 7: Mağaza ve ürün sayfaları

**Files:**
- Create: `magaza.html`, `urun.html`, `assets/js/shop/pages/magaza.js`, `assets/js/shop/pages/urun.js`
- Modify: `assets/css/shop.css`

**Interfaces:**
- Consumes: `mountShell`, `modelsOf`, `filterProducts`, `inventory`, `cart`, `notify`, `requireConsent` (Task 2 ile 6).
- Produces: `magaza.html` sorgu parametreleri `?tur=<type>&model=<model>&stok=1`; ürün kartı `urun.html?id=<id>` bağlantısı verir. Her kartta: görsel, ad, ayar/gram, TL fiyat, stok rozeti ("Stokta" / "Son N adet" N ≤ 3 / "Tükendi"), kartta sepete ekle düğmesi (tükendiyse yerine "Bana bildir" düğmesi).

- [ ] **Step 1: `magaza.html` + `magaza.js`:** tür sekmeleri, seçili türe göre model filtresi, "Yalnızca stokta olanlar" onay kutusu; filtre durumu URL'ye yazılır, sayfa yenilenince korunur. Sonuç yoksa "Bu filtreye uygun ürün bulunamadı" mesajı.
- [ ] **Step 2: `urun.html` + `urun.js`:** `id` parametresi bulunamazsa "Ürün bulunamadı" mesajı ve mağazaya bağlantı (ürün adı vb. alanlar `textContent` ile). Stokta ürün için adet seçici (en çok kalan stok kadar) ve "Sepete ekle"; `STOK_YETERSIZ` yakalanıp kullanıcıya "Stokta bu kadar adet yok" gösterilir. Tükenmiş üründe sepete ekleme hiç gösterilmez, yerine "Bana bildir" düğmesi: `requireConsent()` `false` dönerse hiçbir şey kaydedilmez; `true` ise e-posta/telefon formu açılır ve `notify.add` çağrılır, başarıda "Stok gelince size haber vereceğiz" gösterilir.
- [ ] **Step 3: Doğrula:** Edge'de `magaza.html` (60 ürün, tür başına 15, her türde 5 model filtresi), tükenmiş bir ürünün sayfası (sepete ekle yok, bildir var), `urun.html?id=yok` ("Ürün bulunamadı"), adı `<img src=x onerror=alert(1)>` olan sahte kayıtla (geçici, commit'lenmez) `alert` tetiklenmediğini kontrol et. Expected: hepsi beklendiği gibi, konsolda hata yok.
- [ ] **Step 4: Commit.**

---

### Task 8: Sepet sayfası

**Files:**
- Create: `sepet.html`, `assets/js/shop/pages/sepet.js`
- Modify: `assets/css/shop.css`

**Interfaces:**
- Consumes: `cart.quote`, `placeOrder`, `listOrders`, `requireConsent`, `auth.current` (Task 3, 4, 6).

- [ ] **Step 1: Implement `sepet.html` + `sepet.js`:** satır listesi (adet değiştir/sil), kupon alanı ve "Uygula" (geçersizse "Kupon kodu geçerli değil"; geçerliyse "%10 indirim uygulandı" ve indirim satırı), ara toplam / indirim / toplam. `quote().problems` doluysa satırın yanında uyarı gösterilip "Siparişi tamamla" devre dışı kalır. Sipariş formu: ad soyad, telefon, ödeme (Havale/EFT veya Mağazada ödeme); gönderimde önce `requireConsent()`, `false` ise gönderilmez. Başarıda sipariş numarası, özet ve "WhatsApp ile onayla" bağlantısı (`https://wa.me/905073517347?text=` ile sipariş numarası ve toplam, `encodeURIComponent` ile) gösterilir. Çift tıklamaya karşı gönderim sırasında düğme devre dışı. Hatalar (`SIPARIS_GECERSIZ`, `STOK_YETERSIZ`) kullanıcıya Türkçe açıklanır ve sepet yeniden hesaplanır.
- [ ] **Step 2: Doğrula:** Edge'de ürün ekle → `CINAR10` ve ` cinar10 ` uygula → toplam %10 düşük; izin penceresinde "Vazgeç" → sipariş oluşmaz; kabul → sipariş oluşur, mağaza sayfasında o ürünün stoğu azalmıştır. Expected: hepsi doğru, konsolda hata yok.
- [ ] **Step 3: Commit.**

---

### Task 9: Hesap sayfası

**Files:**
- Create: `hesap.html`, `assets/js/shop/pages/hesap.js`
- Modify: `assets/css/shop.css`

**Interfaces:**
- Consumes: `auth`, `listOrders`, `consent`, `requireConsent` (Task 3, 4, 6).

- [ ] **Step 1: Implement `hesap.html` + `hesap.js`:** oturum yokken "Giriş" ve "Kayıt ol" sekmeleri; her iki formun gönderimi önce `requireConsent()` ister (`false` ise gönderilmez). Hata kodları Türkçe mesaja çevrilir (`EMAIL_KAYITLI` → "Bu e-posta ile kayıt zaten var", `SIFRE_KISA` → "Şifre en az 8 karakter olmalı", `GIRIS_HATALI` → "E-posta veya şifre hatalı"). Oturum varsa: karşılama (ad `textContent` ile), "Siparişlerim" listesi (`listOrders`), izin durumu ve "İzinleri geri al" (`consent.revoke`), "Çıkış yap". Sayfada "Bu bir demo hesaptır; verileriniz yalnızca bu tarayıcıda saklanır" notu bulunur.
- [ ] **Step 2: Doğrula:** Edge'de kayıt (izin penceresi önce çıkar) → siparişlerim → çıkış → yanlış şifreyle giriş hatası → doğru girişle giriş; ad alanına `<b>x</b>` yazıp kayıt olunca karşılamada kalın yazı değil düz metin görünür. Expected: hepsi doğru.
- [ ] **Step 3: Commit.**

---

### Task 10: Ana sayfayı altın çembere göre düzenleme

**Files:**
- Modify: `index.html`, `assets/css/style.css` veya `assets/css/shop.css`

- [ ] **Step 1:** `index.html` bölüm sırasını Neden → Nasıl → Ne yap: hero'dan hemen sonra "Neden" bölümü ("Her takı bir hikâyeyi taşır. 1996'dan beri o hikâyeleri güvenle emanet alıyoruz." başlığı ve kısa metin), sonra "Nasıl" bölümü (mevcut Hakkımızda, Özel Tasarım, Neden Biz ve altın fiyatları içeriğini şeffaf ayar/gram bilgisi, canlı fiyat, ustalık başlıkları altında yeniden sırala; mevcut içeriği silme, yalnızca yerini ve başlıklarını ayarla), sonra "Ne" bölümü (Koleksiyonlar ve Öne Çıkanlar; bağlantılar `magaza.html?tur=…` olur, "Tüm ürünler" düğmesi `magaza.html`), en sonda İletişim. Menü bağlantıları yeni sıraya göre güncellenir. Bölüm `id`'leri benzersiz kalır.
- [ ] **Step 2: Doğrula:** `python tools\check.py`. Expected: JSON-LD ok, yinelenen id yok, kırık bağlantı yok, eksik dosya yok.
- [ ] **Step 3: Commit.**

---

### Task 11: Denetim araçları, uçtan uca test ve belgeler

**Files:**
- Modify: `tools/check.py`, `README.md`, `sitemap.xml`
- Create: `tools/e2e_shop.py`, `MVP.md`

**Interfaces:**
- Consumes: `tools/qa.py` içindeki Edge başlatma ve CDP yardımcıları (önce dosyayı oku; `free_port`, sunucu ve WebSocket yardımcılarını yeniden kullan, kopyalama yapma).

- [ ] **Step 1: `tools/check.py` genişlet:** `index.html` yanında `magaza.html`, `urun.html`, `sepet.html`, `hesap.html` için de yinelenen id, kırık `#` bağlantı, eksik yerel dosya ve `—`/`–` yasağı kontrolü; `products.json` için ürün sayısı 60 ve tür başı 15, model başı 3 denetimi. Run: `python tools\check.py`. Expected: hepsi PASS.
- [ ] **Step 2: `tools/e2e_shop.py`:** yerel sunucu + Edge ile senaryo: (a) şeritte `CINAR10` metni var; (b) tema düğmesi `data-theme` değiştirir ve yenilemede korunur; (c) tükenmiş ürün sayfasında "Bana bildir" var, "Sepete ekle" yok; (d) stoklu ürün sepete eklenir, `CINAR10` ile toplam %10 düşer; (e) izin penceresinde vazgeçilirse sipariş oluşmaz; kabulle oluşur ve stok azalır; (f) kayıt, çıkış, giriş döngüsü. Her adım `PASS/FAIL` basar, herhangi biri FAIL ise çıkış kodu 1. Run: `python tools\e2e_shop.py`. Expected: tüm adımlar PASS.
- [ ] **Step 3: `MVP.md`:** temel sürüm özellikleri (katalog 60 ürün, filtre, stok, "Bana bildir", sepet, `CINAR10`, demo hesap, tema, kayan duyuru, izin penceresi, altın çember ana sayfa) ve MVP dışı olanlar (spec'teki "Kapsam dışı" listesi) yazılır. `README.md`'ye mağaza özellikleri, "mağaza sayfaları yerel sunucu gerektirir (`python -m http.server 8000`)" notu, demo uyarısı ve ürün/stok düzenleme yeri (`tools/gen_products.py`) eklenir. `sitemap.xml`'e yeni sayfalar eklenir.
- [ ] **Step 4: Tümünü çalıştır:** `node --test tests/`, `python tools\check.py`, `python tools\e2e_shop.py`. Expected: üçü de PASS.
- [ ] **Step 5: Commit.**

---

## Sonraki adım (plan dışı, site GitHub'a yüklendikten sonra)

GitHub deposu oluşturulup `origin` eklenir; ardından her gün 19:00'da yeni issue'ları kontrol eden zamanlanmış görev kurulur (tehdit içerenler düzeltilmez, kullanıcıya bildirilir). Önkoşul: `gh` kurulumu ve girişi veya yenilenmiş GitHub MCP token'ı (şu an `gh` kurulu değil, MCP 401 veriyor).
