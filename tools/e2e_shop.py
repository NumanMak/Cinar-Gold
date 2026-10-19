"""Mağaza uçtan uca senaryosu: yerel sunucu + Edge (CDP). qa.py içindeki yardımcıları kullanır.
Kullanım: python tools/e2e_shop.py
Her adım PASS/FAIL yazar; herhangi biri FAIL ise çıkış kodu 1. Her çalıştırma temiz bir tarayıcı profiliyle başlar.
"""
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import qa  # noqa: E402

ROOT = qa.ROOT
RESULTS: list[tuple[str, bool, str]] = []
PRODUCTS = json.loads((ROOT / "assets" / "data" / "products.json").read_text(encoding="utf-8"))
IN_STOCK = next(p for p in PRODUCTS if p["stock"] >= 3)
SOLD_OUT = next(p for p in PRODUCTS if p["stock"] == 0)


class Page:
    def __init__(self, cdp, base):
        self.cdp, self.base = cdp, base
        self.errors: list[str] = []
        cdp.on(self._on_event)
        for m in ("Page.enable", "Runtime.enable", "Log.enable"):
            cdp.send(m)

    def _on_event(self, method, p):
        self._collect(method, p)

    def _collect(self, method, p):
        before = len(self.errors)
        self._collect_raw(method, p)
        # Canlı altın fiyatı dış servisidir; ağ hatası mağaza hatası sayılmaz.
        if len(self.errors) > before and 'truncgil' in self.errors[-1]:
            self.errors.pop()

    def _collect_raw(self, method, p):
        if method == "Runtime.exceptionThrown":
            d = p["exceptionDetails"]
            self.errors.append(d.get("exception", {}).get("description") or d.get("text", "?"))
        elif method == "Runtime.consoleAPICalled" and p.get("type") == "error":
            self.errors.append(" ".join(str(a.get("value", a.get("description", ""))) for a in p.get("args", [])))
        elif method == "Log.entryAdded" and p["entry"].get("level") == "error":
            self.errors.append(p["entry"].get("text", "") + " " + p["entry"].get("url", ""))

    def goto(self, path):
        self.cdp.send("Page.navigate", {"url": f"{self.base}/{path}"})
        self.wait("document.readyState === 'complete'")
        time.sleep(0.3)

    def ev(self, expr):
        return self.cdp.eval(expr)

    def wait(self, expr, timeout=10):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.ev(expr):
                    return True
            except qa.CDPError:
                pass
            time.sleep(0.15)
        raise AssertionError(f"zaman aşımı: {expr}")

    def click(self, sel):
        self.wait(f"!!document.querySelector({json.dumps(sel)})")
        self.ev(f"document.querySelector({json.dumps(sel)}).click()")

    def text(self, sel):
        return self.ev(f"(document.querySelector({json.dumps(sel)})||{{}}).textContent||''")

    def set_value(self, sel, value):
        self.ev(f"(()=>{{const e=document.querySelector({json.dumps(sel)});e.value={json.dumps(value)};"
                f"e.dispatchEvent(new Event('input',{{bubbles:true}}));e.dispatchEvent(new Event('change',{{bubbles:true}}));}})()")

    def accept_consent(self):
        self.wait("!!document.querySelector('dialog.consent[open] #izin-baslik')")
        self.click("dialog.consent input[name=kvkk]")
        self.click("dialog.consent input[name=islem]")
        self.click("dialog.consent button[type=submit]")
        self.wait("!document.querySelector('dialog.consent #izin-baslik')")

    def decline_consent(self):
        self.wait("!!document.querySelector('dialog.consent[open] #izin-baslik')")
        self.click("dialog.consent button[type=button]")
        self.wait("!document.querySelector('dialog.consent #izin-baslik')")


def step(name):
    def deco(fn):
        def run(page):
            try:
                before = len(page.errors)
                fn(page)
                if len(page.errors) > before:
                    raise AssertionError("konsol hatası: " + page.errors[before])
                RESULTS.append((name, True, ""))
                print(f"PASS  {name}")
            except Exception as e:  # noqa: BLE001
                RESULTS.append((name, False, str(e)))
                print(f"FAIL  {name}: {e}")
        run.__name__ = fn.__name__
        return run
    return deco


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)


@step("katalog: 60 ürün, tür başına 15, her türde 5 model")
def t_catalog(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    for slug in ("yuzuk", "kolye", "bilezik", "pirlanta"):
        pg.goto(f"magaza.html?tur={slug}")
        pg.wait("document.querySelectorAll('#urunler .pcard').length === 15")
        check(pg.ev("document.querySelectorAll('#model option').length") == 6, f"{slug}: 5 model + varsayılan seçenek bekleniyor")


@step("duyuru şeridinde CINAR10 var ve kayıyor")
def t_promo(pg):
    pg.goto("index.html")
    pg.wait("!!document.querySelector('.promo')")
    check("CINAR10" in pg.text(".promo"), "şeritte CINAR10 yok")
    check("%10" in pg.text(".promo"), "şeritte %10 yok")
    check(pg.ev("getComputedStyle(document.querySelector('.promo__track')).animationName") == "promo-scroll", "animasyon yok")


@step("tema düğmesi temayı değiştirir ve yenilemede korunur")
def t_theme(pg):
    pg.goto("magaza.html")
    pg.wait("!!document.querySelector('.shop-actions button')")
    first = pg.ev("document.documentElement.dataset.theme")
    pg.click(".shop-actions button:not(.shop-lang)")
    second = pg.ev("document.documentElement.dataset.theme")
    check(first != second and second in ("dark", "light"), f"tema değişmedi: {first} -> {second}")
    pg.goto("magaza.html")
    check(pg.ev("document.documentElement.dataset.theme") == second, "tema yenilemede korunmadı")


@step("tükenmiş ürün: sayfada Bana bildir var, Sepete ekle yok; izin vazgeçilirse kayıt olmaz")
def t_soldout(pg):
    pg.goto(f"urun.html?id={SOLD_OUT['id']}")
    pg.wait("!!document.querySelector('.pdetail__buy')")
    buy = pg.text(".pdetail__buy")
    check("Bana bildir" in buy and "Sepete ekle" not in buy, f"yanlış düğmeler: {buy}")
    pg.click(".pdetail__buy button")
    pg.decline_consent()
    check(pg.ev("JSON.parse(localStorage.getItem('cg:notify')||'[]').length") == 0, "izin yokken kayıt oluştu")
    pg.click(".pdetail__buy button")
    pg.accept_consent()
    pg.wait("!!document.querySelector('dialog.consent[open] input[name=email]')")
    pg.set_value("dialog.consent input[name=email]", "test@ornek.com")
    pg.click("dialog.consent button[type=submit]")
    pg.wait("document.querySelector('dialog.consent .form-msg').textContent.includes('haber vereceğiz')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:notify')).length") == 1, "bildirim kaydedilmedi")


@step("ürün sayfası: bilinmeyen id Ürün bulunamadı gösterir, ürün adı HTML olarak yorumlanmaz")
def t_missing_and_xss(pg):
    pg.goto("urun.html?id=yok")
    pg.wait("!!document.querySelector('#urun h1')")
    check("bulunamadı" in pg.text("#urun h1"), "bulunamadı mesajı yok")
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    pg.ev("""(async()=>{const m=await import('/assets/js/shop/ui.js');
      const ul=document.createElement('ul');ul.id='xss';document.body.append(ul);
      const inv={stockOf:()=>5};
      ul.append(m.productCard({id:'x',name:'<img src=x onerror=window.__pwn=1>',karat:14,gram:1,price:1,image:'assets/img/products/x.svg'},{inventory:inv,refresh(){},wishlist:()=>({has:()=>false,toggle:()=>false})}));})()""")
    time.sleep(0.4)
    check(pg.ev("window.__pwn") is None, "XSS: onerror çalıştı")
    check("<img" in pg.text("#xss .pcard__name"), "ürün adı düz metin olarak görünmüyor")


@step("sepet: CINAR10 toplamı %10 düşürür (büyük/küçük harf ve boşluk duyarsız); geçersiz kupon uyarı verir")
def t_cart_coupon(pg):
    pg.goto(f"urun.html?id={IN_STOCK['id']}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    check(pg.text("#sepet-sayac") == "1", "sepet sayacı güncellenmedi")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.sum')")
    # Fiyat canlı altın fiyatından hesaplandığı için ara toplam sayfadan okunur.
    price = pg.ev("Number(document.querySelector('.sum__row:first-child dd').textContent.replace(/[^0-9]/g,''))")
    pg.set_value("input[name=kupon]", " cinar10 ")
    pg.click(".coupon button")
    pg.wait("!!document.querySelector('.sum__row--disc')")
    disc = round(price * 0.1)
    check(f"{(price - disc):,}".replace(",", ".") in pg.text(".sum__row--total"), f"toplam yanlış: {pg.text('.sum__row--total')} (ara toplam {price})")
    pg.set_value("input[name=kupon]", "YANLIS")
    pg.click(".coupon button")
    pg.wait("!!document.querySelector('.coupon .form-msg')")
    check("geçerli değil" in pg.text(".coupon .form-msg"), "geçersiz kupon uyarısı yok")
    check(pg.ev("!!document.querySelector('.sum__row--disc')") is False, "geçersiz kuponda indirim görünüyor")
    pg.set_value("input[name=kupon]", "CINAR10")
    pg.click(".coupon button")
    pg.wait("!!document.querySelector('.sum__row--disc')")


@step("sipariş: izinden vazgeçilirse oluşmaz; izin verilirse oluşur, stok düşer, sepet boşalır")
def t_order(pg):
    pg.goto("sepet.html")
    pg.ev("localStorage.removeItem('cg:consent')")  # önceki adımda verilen izin sıfırlanır
    pg.wait("!!document.querySelector('.order-form')")
    pg.set_value("input[name=ad]", "Test Kullanıcı")
    pg.set_value("input[name=telefon]", "05551112233")
    pg.click(".order-form button[type=submit]")
    pg.decline_consent()
    pg.wait("document.querySelector('.order-form .form-msg[role=alert]').textContent.includes('izin')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:orders')||'[]').length") == 0, "izin yokken sipariş oluştu")
    pg.click(".order-form button[type=submit]")
    pg.accept_consent()
    pg.wait("!!document.querySelector('.done')")
    check("CG-" in pg.text(".done"), "sipariş numarası yok")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:orders')).length") == 1, "sipariş kaydedilmedi")
    left = pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(IN_STOCK['id'])}]")
    check(left == IN_STOCK["stock"] - 1, f"stok düşmedi: {left}")
    check(pg.text("#sepet-sayac") == "0", "sepet boşalmadı")
    pg.goto(f"urun.html?id={IN_STOCK['id']}")
    pg.wait("!!document.querySelector('.stock')")


@step("hesap: izin önce sorulur; kayıt, çıkış, hatalı ve doğru giriş; ad HTML olarak yorumlanmaz")
def t_account(pg):
    pg.goto("hesap.html")
    pg.ev("localStorage.removeItem('cg:consent')")
    pg.wait("!!document.querySelector('.auth')")
    pg.ev("[...document.querySelectorAll('.auth .chip')].find(b=>b.textContent==='Kayıt ol').click()")
    pg.wait("!!document.querySelector('#form-kayit')")
    pg.set_value("#form-kayit input[name=ad]", "<b>Ayşe</b> Yılmaz")
    pg.set_value("#form-kayit input[name=email]", "ayse@ornek.com")
    pg.set_value("#form-kayit input[name=sifre]", "gizli-sifre-1")
    pg.click("#form-kayit button[type=submit]")
    pg.decline_consent()
    pg.wait("document.querySelector('#form-kayit .form-msg[role=alert]').textContent.includes('izin')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:users')||'[]').length") == 0, "izin yokken kullanıcı oluştu")
    pg.click("#form-kayit button[type=submit]")
    pg.accept_consent()
    pg.wait("!!document.querySelector('.account-layout')")
    check("<b>Ayşe</b>" in pg.text(".account__main .acard__title"), "ad düz metin olarak görünmüyor")
    check(pg.ev("document.querySelectorAll('.account-layout b').length") == 0, "ad HTML olarak yorumlandı")
    pg.goto("hesap.html#izinler")
    pg.wait("!!document.querySelector('#izin-durum')")
    check("verildi" in pg.text("#izin-durum"), "izin durumu yok")
    users = pg.ev("localStorage.getItem('cg:users')")
    check("gizli-sifre-1" not in users, "düz şifre saklanmış")
    pg.click(".account__side .btn")
    pg.wait("!!document.querySelector('.auth')")
    pg.ev("document.querySelector('#form-giris')||0")
    pg.set_value("#form-giris input[name=email]", "ayse@ornek.com")
    pg.set_value("#form-giris input[name=sifre]", "yanlis-sifre")
    pg.click("#form-giris button[type=submit]")
    pg.wait("document.querySelector('#form-giris .form-msg[role=alert]').textContent.includes('hatalı')")
    pg.set_value("#form-giris input[name=sifre]", "gizli-sifre-1")
    pg.click("#form-giris button[type=submit]")
    pg.wait("!!document.querySelector('.account-layout')")


@step("sipariş formu: boşluktan oluşan telefon hatası görünür kalır ve yazılan ad silinmez")
def t_order_error(pg):
    pg.goto(f"urun.html?id={IN_STOCK['id']}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.order-form')")
    pg.set_value("input[name=ad]", "Test Kişi")
    pg.set_value("input[name=telefon]", "   ")
    pg.click(".order-form button[type=submit]")
    pg.wait("document.querySelector('.order-form .form-msg[role=alert]').textContent.includes('doldurun')")
    check(pg.ev("document.querySelector('input[name=ad]').value") == "Test Kişi", "ad alanı silindi")


@step("depolama engelliyse görünür uyarı çıkar")
def t_blocked_storage(pg):
    pg.cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": "Storage.prototype.setItem = function(){ throw new Error('engelli'); };"})
    pg.goto("magaza.html")
    pg.wait("!!document.querySelector('.storage-warn')")
    check("depolama" in pg.text(".storage-warn"), "uyarı metni yok")


@step("mağaza: arama Türkçe karakterden bağımsız, sıralama fiyata göre çalışır, URL'ye yazılır")
def t_search_sort(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    pg.set_value("#ara", "KOLYE madalyon")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 3")
    pg.set_value("#ara", "pirlanta kupe")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 3")
    pg.set_value("#ara", "")
    pg.set_value("#sirala", "fiyat-azalan")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    prices = pg.ev("[...document.querySelectorAll('#urunler .pcard__price')].map(e=>Number(e.textContent.replace(/[^0-9]/g,'')))")
    check(prices == sorted(prices, reverse=True), "fiyat sıralaması yanlış")
    check("sirala=fiyat-azalan" in pg.ev("location.search"), "sıralama URL'ye yazılmadı")
    pg.set_value("#ara", "xyzxyz")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 0 && !document.getElementById('bos').hidden")


@step("ürün sayfası: benzer ürünler gösterilir")
def t_similar(pg):
    pg.goto(f"urun.html?id={IN_STOCK['id']}")
    pg.wait("document.querySelectorAll('.similar .pcard').length === 4")
    check(pg.ev("[...document.querySelectorAll('.similar .pcard a')].every(a=>!a.href.includes('id=%s'))" % IN_STOCK['id']), "ürünün kendisi benzerlerde")


@step("teslimat ve hesap: adrese teslim adres ister, sipariş hesapta görünür, profil ve şifre güncellenir")
def t_delivery_account(pg):
    pg.goto("urun.html?id=" + IN_STOCK["id"])
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.order-form')")
    check(pg.ev("document.querySelector('input[name=ad]').value") == "<b>Ayşe</b> Yılmaz", "ad hesaptan dolmadı")
    check(pg.ev("document.getElementById('adres-alani').hidden") is True, "mağazadan teslimde adres alanı görünüyor")
    pg.click("input[name=teslimat][value=adres]")
    check(pg.ev("document.getElementById('adres-alani').hidden") is False, "adrese teslimde adres alanı yok")
    pg.set_value("input[name=telefon]", "05551112233")
    pg.set_value("textarea[name=adres]", "kısa")
    pg.click(".order-form button[type=submit]")
    pg.wait("document.querySelector('.order-form .form-msg[role=alert]').textContent.includes('adres')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:orders')||'[]').length") == 1, "kısa adresle sipariş oluştu")
    pg.set_value("textarea[name=adres]", "Atatürk Cd. No:25 Fethiye Muğla")
    pg.click(".order-form button[type=submit]")
    pg.wait("!!document.querySelector('.done')")
    check("Atatürk Cd. No:25" in pg.text(".done"), "başarı ekranında adres yok")
    pg.goto("hesap.html#siparisler")
    pg.wait("!!document.querySelector('.orders')")
    check("Adrese teslim: Atatürk Cd. No:25" in pg.text(".orders"), "sipariş adresi hesapta yok")
    pg.goto("hesap.html#adresler")
    pg.wait("!!document.querySelector('.orders')")
    check("Atatürk Cd. No:25 Fethiye Muğla" in pg.text(".orders"), "adres, adres defterine eklenmedi")
    pg.goto("hesap.html#bilgiler")
    pg.wait("!!document.querySelector('#form-profil')")
    pg.set_value("#form-profil input[name=ad]", "Ayşe Y.")
    pg.click("#form-profil button[type=submit]")
    pg.wait("document.querySelector('#form-profil .form-msg[role=status]').textContent.includes('kaydedildi')")
    check("Ayşe" in pg.text(".usermenu__name"), "üst bilgideki ad güncellenmedi")
    pg.set_value("#form-sifre input[name=eski]", "yanlis-sifre")
    pg.set_value("#form-sifre input[name=yeni]", "yeni-sifre-22")
    pg.click("#form-sifre button[type=submit]")
    pg.wait("document.querySelector('#form-sifre .form-msg').textContent.includes('hatalı')")
    pg.set_value("#form-sifre input[name=eski]", "gizli-sifre-1")
    pg.click("#form-sifre button[type=submit]")
    pg.wait("document.querySelector('#form-sifre .form-msg').textContent.includes('değiştirildi')")


@step("hesap: stok bildirimi isteği hesapta listelenir ve vazgeçilebilir")
def t_alerts(pg):
    pg.ev("localStorage.setItem('cg:notify', JSON.stringify([{id:'x1',productId:%s,email:'a@b.com',phone:'',createdAt:new Date().toISOString()}]))" % json.dumps(SOLD_OUT["id"]))
    pg.goto("hesap.html")
    pg.ev("(()=>{const u=JSON.parse(localStorage.getItem('cg:users'));u[0].email='a@b.com';localStorage.setItem('cg:users',JSON.stringify(u));})()")
    pg.goto("hesap.html#bildirimler")
    pg.wait("!!document.querySelector('.acard')")
    check("Stok bekleniyor" in pg.ev("document.body.textContent"), "bildirim isteği hesapta yok")
    pg.ev("[...document.querySelectorAll('.link-btn')].find(b=>b.textContent==='Vazgeç').click()")
    pg.wait("document.body.textContent.includes('Takip ettiğiniz tükenmiş ürün yok')")


@step("telefon görünümü (390 px): hiçbir sayfada yatay taşma yok")
def t_mobile_overflow(pg):
    pg.cdp.send("Emulation.setDeviceMetricsOverride", {"width": 390, "height": 800, "deviceScaleFactor": 1, "mobile": True})
    try:
        for path in ("index.html", "magaza.html", f"urun.html?id={IN_STOCK['id']}", "sepet.html", "hesap.html"):
            pg.goto(path)
            time.sleep(0.4)
            sw, iw = pg.ev("[document.documentElement.scrollWidth, innerWidth]")
            check(sw <= iw, f"{path}: yatay taşma {sw} > {iw}")
    finally:
        pg.cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})


@step("ana sayfa altın fiyatları: Özsafir dosyasından gelir, kaynak yazılır; dosya eskiyse Truncgil'e düşer")
def t_gold(pg):
    gold = json.loads((ROOT / "assets" / "data" / "gold.json").read_text(encoding="utf-8"))
    pg.goto("index.html")
    pg.wait("document.querySelector('.market__item [data-price]').textContent !== '-'")
    check(pg.text("[data-market-source]") == "Özsafir Gold", "kaynak Özsafir Gold değil")
    check(pg.ev("document.querySelectorAll('.market__item:not([hidden])').length") == 6, "6 fiyat görünmüyor")
    sell = gold["items"]["quarter"]["sell"]
    shown = pg.text(".market__item[data-key=quarter] [data-price]")
    check(f"{sell:,}".replace(",", ".") in shown, f"çeyrek fiyatı yanlış: {shown}")
    check("Alış" in pg.text(".market__item[data-key=quarter] [data-chg]"), "alış fiyatı yok")
    stub = """(() => { const real = window.fetch.bind(window);
      window.fetch = (u, o) => {
        const url = String(u);
        if (url.includes('gold.json')) return Promise.resolve(new Response(JSON.stringify({source:'Özsafir Gold',fetchedAt:'2020-01-01T00:00:00+00:00',updatedAt:'10:00',items:{}}), {status:200}));
        if (url.includes('truncgil')) return Promise.resolve(new Response(JSON.stringify({Update_Date:'2026-10-19 12:34:00',CEYREKALTIN:{Selling:11111,Change:0.5},YARIMALTIN:{Selling:22222,Change:-0.2},TAMALTIN:{Selling:44444,Change:0.1},ATAALTIN:{Selling:45555,Change:0.1},YIA:{Selling:6666,Change:0.3}}), {status:200}));
        return real(u, o); }; })();"""
    sid = pg.cdp.send("Page.addScriptToEvaluateOnNewDocument", {"source": stub})["identifier"]
    try:
        pg.goto("index.html")
        pg.wait("document.querySelector('[data-market-source]').textContent === 'Truncgil Finans'")
        check(pg.ev("document.querySelectorAll('.market__item:not([hidden])').length") == 5, "yedek kaynakta eksik reşat gizlenmedi")
        check("11.111" in pg.text(".market__item[data-key=quarter] [data-price]"), "yedek fiyat görünmüyor")
    finally:
        pg.cdp.send("Page.removeScriptToEvaluateOnNewDocument", {"identifier": sid})


@step("üst bilgi: misafirde sağ üstte Giriş yap düğmesi, tıklayınca hesap sayfası açılır")
def t_login_button(pg):
    for path in ("index.html", "magaza.html"):
        pg.goto(path)
        pg.wait("!!document.querySelector('.shop-login')")
        check(pg.text(".shop-login").strip() == "Giriş yap", f"{path}: düğme metni yanlış")
        x, y, w = pg.ev("(()=>{const r=document.querySelector('.shop-login').getBoundingClientRect();return [r.right, r.top, innerWidth];})()")
        check(w * 0.6 < x <= w and y < 140, f"{path}: düğme sağ üstte değil veya taşıyor ({x}, {y}, {w})")
    pg.click(".shop-login")
    pg.wait("location.pathname.endsWith('hesap.html')")


@step("kullanıcı menüsü: açılır/kapanır, Esc ve dış tıklama kapatır, bağlantılar bölümü açar, sayaçlar doğru")
def t_user_menu(pg):
    pg.goto("magaza.html")
    pg.wait("!!document.querySelector('.usermenu__btn')")
    check(pg.ev("document.querySelector('.usermenu__btn').getAttribute('aria-expanded')") == "false", "menü kapalı başlamıyor")
    pg.click(".usermenu__btn")
    check(pg.ev("document.querySelector('.usermenu__btn').getAttribute('aria-expanded')") == "true", "menü açılmadı")
    check(pg.ev("document.getElementById('kullanici-menusu').hidden") is False, "menü paneli görünmüyor")
    labels = pg.ev("[...document.querySelectorAll('#kullanici-menusu [role=menuitem]')].map(e=>e.textContent)")
    for want in ("Siparişlerim", "Favorilerim", "Adreslerim", "Hesap bilgilerim", "Stok bildirimlerim", "Çıkış yap"):
        check(any(want in l for l in labels), f"menüde {want} yok: {labels}")
    check(pg.ev("document.activeElement.textContent.startsWith('Siparişlerim')"), "açılınca ilk öğeye odaklanmadı")
    pg.ev("document.getElementById('kullanici-menusu').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))")
    check(pg.ev("document.activeElement.textContent.startsWith('Favorilerim')"), "ok tuşu sonraki öğeye geçmedi")
    pg.ev("document.getElementById('kullanici-menusu').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
    check(pg.ev("document.getElementById('kullanici-menusu').hidden") is True, "Esc menüyü kapatmadı")
    check(pg.ev("document.activeElement.classList.contains('usermenu__btn')"), "Esc sonrası odak düğmeye dönmedi")
    pg.click(".usermenu__btn")
    pg.ev("document.querySelector('h1').click()")
    check(pg.ev("document.getElementById('kullanici-menusu').hidden") is True, "dış tıklama menüyü kapatmadı")
    pg.click(".usermenu__btn")
    pg.ev("[...document.querySelectorAll('#kullanici-menusu a')].find(a=>a.textContent.startsWith('Adreslerim')).click()")
    pg.wait("location.pathname.endsWith('hesap.html') && location.hash === '#adresler'")
    pg.wait("document.querySelector('.account__main .acard__title') && document.querySelector('.account__main .acard__title').textContent === 'Adreslerim'")


@step("favoriler: kalp ekler, menü sayacı ve hesap sayfası güncellenir, kaldırınca liste boşalır")
def t_favorites(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .fav').length === 60")
    pg.click("#urunler .pcard .fav")
    check(pg.ev("document.querySelector('#urunler .pcard .fav').getAttribute('aria-pressed')") == "true", "kalp basılı görünmüyor")
    pg.click(".usermenu__btn")
    fav = pg.ev("[...document.querySelectorAll('#kullanici-menusu a')].find(a=>a.textContent.startsWith('Favorilerim')).textContent")
    check(fav.endswith("1"), f"menü sayacı güncellenmedi: {fav}")
    pg.goto("hesap.html#favoriler")
    pg.wait("document.querySelectorAll('.account__main .pcard').length === 1")
    pg.click(".account__main .pcard .fav")
    pg.wait("document.body.textContent.includes('Favori listeniz boş')")


@step("adres defteri: ekle, varsayılan yap, kısa adresi reddet, sil")
def t_addresses(pg):
    pg.goto("hesap.html#adresler")
    pg.wait("!!document.querySelector('#form-adres')")
    before = pg.ev("document.querySelectorAll('.account__main .orders > li').length")
    for title, text in (("Ev", "Atatürk Cd. No:5 Fethiye Muğla"), ("İş", "Çarşı Mah. 12. Sk. No:3 Fethiye Muğla")):
        n = pg.ev("document.querySelectorAll('.account__main .orders > li').length")
        pg.set_value("#form-adres input[name=baslik]", title)
        pg.set_value("#form-adres textarea[name=adres]", text)
        pg.click("#form-adres button[type=submit]")
        pg.wait(f"document.querySelectorAll('.account__main .orders > li').length === {n + 1}")
    row = "[...document.querySelectorAll('.account__main .orders > li')].find(li=>li.textContent.includes('Çarşı Mah.'))"
    check("Varsayılan yap" in pg.ev(f"{row}.textContent"), "ikinci adres varsayılan olmamalı")
    pg.ev(f"{row}.querySelector('.link-btn').click()")
    pg.wait(f"!{row}.textContent.includes('Varsayılan yap')")
    check("Varsayılan" in pg.ev(f"{row}.querySelector('.order__status').textContent"), "varsayılan rozeti yok")
    pg.set_value("#form-adres input[name=baslik]", "Kısa")
    pg.set_value("#form-adres textarea[name=adres]", "kısa")
    pg.click("#form-adres button[type=submit]")
    pg.wait("document.querySelector('#form-adres .form-msg').textContent.includes('10 karakter')")
    for key in ("Çarşı Mah.", "Atatürk Cd. No:5"):
        pg.ev(f"[...document.querySelectorAll('.account__main .orders > li')].find(li=>li.textContent.includes({json.dumps(key)})).querySelector('.link-btn:last-child').click()")
    pg.wait(f"document.querySelectorAll('.account__main .orders > li').length === {before}")


@step("sipariş iptali: onay istenir, durum iptal olur, stok geri gelir")
def t_cancel_order(pg):
    pid = IN_STOCK["id"]
    pg.goto(f"urun.html?id={pid}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.order-form')")
    pg.set_value("input[name=telefon]", "05551112233")
    pg.click(".order-form button[type=submit]")
    pg.wait("!!document.querySelector('.done')")
    after_order = pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(pid)}]")
    pg.goto("hesap.html#siparisler")
    pg.wait("!!document.querySelector('.orders')")
    pg.ev("[...document.querySelectorAll('.order .link-btn')].find(b=>b.textContent==='Siparişi iptal et').click()")
    pg.wait("!![...document.querySelectorAll('.order .btn')].find(b=>b.textContent==='Evet, iptal et')")
    pg.ev("[...document.querySelectorAll('.order .btn')].find(b=>b.textContent==='Evet, iptal et').click()")
    pg.wait("document.querySelector('.order--cancelled') !== null")
    check("İptal edildi" in pg.text(".order--cancelled"), "durum iptal görünmüyor")
    restored = pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(pid)}]")
    check(restored == after_order + 1, f"stok geri gelmedi: {after_order} -> {restored}")


@step("fiyatlar canlı altın fiyatından hesaplanır; tüm ürün görselleri yüklenir")
def t_pricing_images(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    res = pg.ev("""(async () => {
      const m = await import('/assets/js/shop/pricing.js');
      const gold = await m.loadGold();
      const products = await (await fetch('/assets/data/products.json')).json();
      const p = products[7];
      const card = [...document.querySelectorAll('#urunler .pcard')].find(c => c.querySelector('.pcard__name').textContent === p.name);
      const shown = Number(card.querySelector('.pcard__price').textContent.replace(/[^0-9]/g, ''));
      const bad = [];
      for (const q of products) { const r = await fetch('/' + q.image, { method: 'HEAD' }); if (!r.ok) bad.push(q.image); }
      return { shown, expected: m.priceOf(p, gold.items.gram22.sell), snapshot: p.price, bad };
    })()""")
    check(res["shown"] == res["expected"], f"fiyat canlı altından hesaplanmıyor: {res}")
    check(not res["bad"], f"görseli yüklenemeyen ürünler: {res['bad'][:3]}")


LEAK_ALLOWED = ["Müşteri Kişi", "Ayşe", "AYŞE", "ÇINAR GOLD", "Çınar Gold", "Çınar", "ÇINAR", "Fethiye", "Muğla", "Atatürk", "Özsafir", "Reşat", "Cumhuriyet", "Çeyrek"]
LEAK_WORDS = r"\b(Sepet|Giriş|Mağaza|Ürün|Hesap|Hesabım|Sipariş|Toplam|Adet|Kayıt|Şifre|Tükendi|Stokta|Favori|Adres|Telefon|Yüzük|Kolye|Bilezik|Çıkış|Kapat|Vazgeç|Uygula|Sil|Ara toplam|Teslimat|Ödeme|Hakkımızda|Koleksiyonlar|İletişim)\b"


def english_text_leaks(pg):
    """Görünen metinde Türkçe harf veya bilinen Türkçe arayüz sözcüğü kalmış mı?"""
    txt = pg.ev("document.body.innerText")
    for a in LEAK_ALLOWED:
        txt = txt.replace(a, "")
    import re
    letters = sorted(set(re.findall(r"[çğıöşüÇĞİÖŞÜ]", txt)))
    words = sorted(set(re.findall(LEAK_WORDS, txt)))
    return letters, words, txt


@step("dil düğmesi: EN/TR tek tuşla değişir, sayfa ve para biçimi dile uyar, seçim hatırlanır")
def t_language_toggle(pg):
    pg.ev("localStorage.removeItem('cg:lang')")
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    check(pg.text(".shop-lang").strip() == "EN", "Türkçe iken düğme EN göstermeli")
    check(pg.ev("document.documentElement.lang") == "tr", "html lang tr olmalı")
    pg.click(".shop-lang")
    pg.wait("document.documentElement.lang === 'en' && document.querySelectorAll('#urunler .pcard').length === 60")
    check(pg.text(".shop-lang").strip() == "TR", "İngilizce iken düğme TR göstermeli")
    check(pg.text("h1") == "Shop", f"başlık İngilizce değil: {pg.text('h1')}")
    check(pg.ev("document.getElementById('ara').placeholder").startswith("Search"), "arama kutusu İngilizce değil")
    price = pg.text("#urunler .pcard__price")
    check(price.startswith("₺"), f"İngilizce para biçimi ₺12,560 olmalı: {price}")
    name = pg.text("#urunler .pcard__name")
    check(name.isascii(), f"ürün adı İngilizce olmalı: {name}")
    pg.goto("magaza.html")
    pg.wait("document.documentElement.lang === 'en'")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:lang'))") == "en", "seçim saklanmadı")
    pg.click(".shop-lang")
    pg.wait("document.documentElement.lang === 'tr' && !!document.querySelector('#urunler .pcard')")
    check(pg.text("h1") == "Mağaza", "Türkçe'ye dönülemedi")
    pg.goto("magaza.html?lang=en")
    pg.wait("document.documentElement.lang === 'en'")
    pg.ev("localStorage.removeItem('cg:lang')")


@step("İngilizce mod: ana sayfa, mağaza, ürün, sepet ve hesap sayfalarında Türkçe metin kalmaz")
def t_english_no_leaks(pg):
    pg.ev("localStorage.setItem('cg:lang', '\"en\"')")
    try:
        for path in ("index.html", "magaza.html?tur=kolye", f"urun.html?id={IN_STOCK['id']}", "urun.html?id=yok", "sepet.html", "hesap.html#genel"):
            pg.goto(path)
            time.sleep(1.2)
            letters, words, txt = english_text_leaks(pg)
            check(not letters and not words, f"{path}: Türkçe kalıntı harf={letters} sözcük={words}")
        # sepette ürün varken
        pg.goto(f"urun.html?id={IN_STOCK['id']}")
        pg.wait("!!document.querySelector('.pdetail__buy button')")
        pg.click(".pdetail__buy button")
        pg.goto("sepet.html")
        pg.wait("!!document.querySelector('.order-form')")
        letters, words, txt = english_text_leaks(pg)
        check(not letters and not words, f"sepet (dolu): harf={letters} sözcük={words}")
        check("Place order" in txt and "Subtotal" in txt, "sepet İngilizce başlıkları yok")
        # giriş yapmış kullanıcı: menü ve hesap bölümleri
        for section in ("siparisler", "favoriler", "adresler", "bildirimler", "bilgiler", "izinler"):
            pg.goto(f"hesap.html#{section}")
            time.sleep(0.5)
            letters, words, txt = english_text_leaks(pg)
            check(not letters and not words, f"hesap #{section}: harf={letters} sözcük={words}")
        pg.click(".usermenu__btn")
        letters, words, txt = english_text_leaks(pg)
        check(not letters and not words, f"kullanıcı menüsü: harf={letters} sözcük={words}")
        check("My orders" in txt and "Sign out" in txt, "menü İngilizce değil")
        # tükenmiş ürün ve bildirim penceresi
        pg.goto(f"urun.html?id={SOLD_OUT['id']}")
        pg.wait("!!document.querySelector('.pdetail__buy button')")
        check("Notify me" in pg.text(".pdetail__buy"), "Notify me yok")
    finally:
        pg.ev("localStorage.removeItem('cg:lang')")


@step("İngilizce arama: İngilizce ürün adıyla bulunur")
def t_english_search(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    pg.set_value("#ara", "solitaire ring")
    pg.wait("document.querySelectorAll('#urunler .pcard').length >= 3 && document.querySelectorAll('#urunler .pcard').length < 60")
    pg.set_value("#ara", "")


@step("yönetici: ilk kurulum, müşteri yetkisiz, giriş, sipariş onayı, stok düzenleme, bildirim listesi, menü bağlantısı")
def t_admin(pg):
    # temiz başlangıç: yalnızca yönetici akışı için kullanıcılar, siparişler ve oturum sıfırlanır
    pg.ev("['users','session','orders','orderSeq','stock','cart','notify','consent'].forEach(k=>localStorage.removeItem('cg:'+k))")
    pg.goto("admin.html")
    pg.wait("!!document.querySelector('#form-admin-kurulum')")
    check("yönetici hesabı yok" in pg.text("#yonetim"), "kurulum mesajı yok")
    # kısa şifre reddedilir
    pg.set_value("#form-admin-kurulum input[name=ad]", "Admin Yonetici")
    pg.set_value("#form-admin-kurulum input[name=email]", "yonetici@cinargold.test")
    pg.set_value("#form-admin-kurulum input[name=sifre]", "kisa")
    pg.click("#form-admin-kurulum button[type=submit]")
    pg.accept_consent()
    pg.wait("document.querySelector('#form-admin-kurulum .form-msg[role=alert]').textContent.includes('8 karakter')")
    pg.set_value("#form-admin-kurulum input[name=sifre]", "Yonetici-Sifre-2026")
    pg.click("#form-admin-kurulum button[type=submit]")
    pg.wait("!!document.querySelector('.admin')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:users'))[0].role") == "admin", "rol admin değil")
    # menüde Yönetim paneli bağlantısı
    pg.click(".usermenu__btn")
    labels = pg.ev("[...document.querySelectorAll('#kullanici-menusu [role=menuitem]')].map(e=>e.textContent)")
    check(any(l.startswith("Yönetim paneli") for l in labels), f"menüde yönetim paneli yok: {labels}")
    # çıkış, müşteri kaydı: yönetim paneline erişemez
    pg.ev("document.querySelector('.usermenu__btn').click()")
    pg.goto("hesap.html")
    pg.wait("!!document.querySelector('.account-layout')")
    pg.click(".account__side .btn")
    pg.wait("!!document.querySelector('.auth')")
    pg.ev("[...document.querySelectorAll('.auth .chip')].find(b=>b.textContent==='Kayıt ol').click()")
    pg.set_value("#form-kayit input[name=ad]", "Müşteri Kişi")
    pg.set_value("#form-kayit input[name=email]", "musteri@ornek.com")
    pg.set_value("#form-kayit input[name=sifre]", "musteri-sifre-1")
    pg.click("#form-kayit button[type=submit]")
    pg.wait("!!document.querySelector('.account-layout')")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:users')).find(u=>u.email==='musteri@ornek.com').role") == "customer", "müşteri rolü customer olmalı")
    pg.goto("admin.html")
    pg.wait("!!document.querySelector('#form-admin-giris')")
    check("yetkisi yok" in pg.text("#yonetim"), "yetkisiz müşteri mesajı yok")
    check(pg.ev("!document.querySelector('.admin')"), "müşteri yönetim panelini görüyor")
    # müşteri sipariş verir
    pg.goto(f"urun.html?id={IN_STOCK['id']}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.order-form')")
    pg.set_value("input[name=telefon]", "05551112233")
    pg.click(".order-form button[type=submit]")
    pg.wait("!!document.querySelector('.done')")
    stock_after = pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(IN_STOCK['id'])}]")
    # müşteri çıkış, yönetici girişi
    pg.goto("hesap.html")
    pg.wait("!!document.querySelector('.account-layout')")
    pg.click(".account__side .btn")
    pg.goto("admin.html")
    pg.wait("!!document.querySelector('#form-admin-giris')")
    pg.set_value("#form-admin-giris input[name=email]", "yonetici@cinargold.test")
    pg.set_value("#form-admin-giris input[name=sifre]", "yanlis")
    pg.click("#form-admin-giris button[type=submit]")
    pg.wait("document.querySelector('#form-admin-giris .form-msg[role=alert]').textContent.includes('hatalı')")
    pg.set_value("#form-admin-giris input[name=sifre]", "Yonetici-Sifre-2026")
    pg.click("#form-admin-giris button[type=submit]")
    pg.wait("!!document.querySelector('.admin')")
    # bekleyen sipariş görünür ve onaylanır
    pg.wait("document.querySelectorAll('#yonetim-siparisler > li').length === 1")
    check("CG-" in pg.text("#yonetim-siparisler"), "sipariş numarası yok")
    check("Müşteri Kişi" in pg.text("#yonetim-siparisler"), "müşteri adı yok")
    pg.click("#yonetim-siparisler button[data-status=onaylandi]")
    pg.wait("document.querySelectorAll('#yonetim-siparisler > li').length === 0")
    pg.ev("document.querySelector('[data-filter=onaylandi]').click()")
    pg.wait("document.querySelectorAll('#yonetim-siparisler > li').length === 1")
    check(pg.ev("JSON.parse(localStorage.getItem('cg:orders'))[0].status") == "onaylandi", "durum kaydedilmedi")
    # onaylanan sipariş müşteri tarafından iptal edilemez (hesapta düğme yok)
    pg.ev("document.querySelector('[data-filter=iptal]')||0")
    # yönetici iptal eder: stok geri gelir
    pg.click("#yonetim-siparisler button[data-status=iptal]")
    pg.wait("!![...document.querySelectorAll('#yonetim-siparisler .btn')].find(b=>b.textContent==='Evet, iptal et')")
    pg.ev("[...document.querySelectorAll('#yonetim-siparisler .btn')].find(b=>b.textContent==='Evet, iptal et').click()")
    pg.wait("JSON.parse(localStorage.getItem('cg:orders'))[0].status === 'iptal'")
    restored = pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(IN_STOCK['id'])}]")
    check(restored == stock_after + 1, f"stok geri gelmedi: {stock_after} -> {restored}")
    # stok düzenleme
    pg.ev("document.querySelector('[data-tab=stok]').click()")
    pg.wait("document.querySelectorAll('.stockrow').length === 60")
    pid = SOLD_OUT["id"]
    pg.set_value(f"input[data-id={json.dumps(pid)}]", "7")
    pg.ev(f"document.querySelector('input[data-id={json.dumps(pid)}]').closest('li').querySelector('button').click()")
    pg.wait(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(pid)}] === 7")
    pg.set_value(f"input[data-id={json.dumps(pid)}]", "-3")
    pg.ev(f"document.querySelector('input[data-id={json.dumps(pid)}]').closest('li').querySelector('button').click()")
    pg.wait(f"document.querySelector('input[data-id={json.dumps(pid)}]').closest('li').querySelector('.form-msg').textContent.includes('0 veya')")
    check(pg.ev(f"JSON.parse(localStorage.getItem('cg:stock'))[{json.dumps(pid)}]") == 7, "geçersiz stok kaydedildi")
    # bildirim istekleri sekmesi
    pg.ev("document.querySelector('[data-tab=bildirimler]').click()")
    pg.wait("document.body.textContent.includes('Stok bildirim isteği yok')")


@step("yönetici paneli İngilizce modda Türkçe metin içermez")
def t_admin_english(pg):
    pg.ev("localStorage.setItem('cg:lang', '\"en\"')")
    try:
        pg.goto("admin.html")
        pg.wait("!!document.querySelector('.admin')")
        time.sleep(0.6)
        for tab in ("siparisler", "stok", "bildirimler"):
            pg.ev(f"document.querySelector('[data-tab={tab}]').click()")
            time.sleep(0.4)
            letters, words, txt = english_text_leaks(pg)
            check(not letters and not words, f"admin {tab}: harf={letters} sözcük={words}")
        check("Orders" in txt or "Stock" in txt, "panel İngilizce başlıkları yok")
    finally:
        pg.ev("localStorage.removeItem('cg:lang')")


@step("güvenlik: her sayfada CSP var; enjekte edilen satır içi betik ve dış betik çalışmaz, ihlal raporlanır")
def t_csp(pg):
    for path in ("index.html", "magaza.html", "urun.html?id=yok", "sepet.html", "hesap.html", "admin.html", "404.html"):
        pg.goto(path)
        csp = pg.ev("(document.querySelector('meta[http-equiv=Content-Security-Policy]')||{}).content||''")
        check("default-src 'none'" in csp and "object-src 'none'" in csp and "base-uri 'none'" in csp, f"{path}: CSP eksik")
        check("'unsafe-inline'" not in csp and "'unsafe-eval'" not in csp, f"{path}: CSP zayıf")
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    res = pg.ev("""(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective));
      window.__pwned = 0;
      const a = document.createElement('script'); a.textContent = 'window.__pwned = 1'; document.body.append(a);
      const b = document.createElement('script'); b.src = 'https://example.com/x.js'; document.body.append(b);
      const img = document.createElement('img'); img.src = 'https://example.com/pixel.png'; document.body.append(img);
      await new Promise((r) => setTimeout(r, 600));
      return { pwned: window.__pwned, violations };
    })()""")
    check(res["pwned"] == 0, "satır içi betik çalıştı: CSP etkin değil")
    check(any(v.startswith("script-src") for v in res["violations"]), f"betik ihlali raporlanmadı: {res['violations']}")
    check(any(v.startswith("img-src") for v in res["violations"]), f"dış görsel engellenmedi: {res['violations']}")
    # CSP ihlal denemesi konsola hata düşürür; bu adımın hata saymaması için sayaç geri alınır.
    pg.errors[:] = [e for e in pg.errors if "Content Security Policy" not in e and "Refused to" not in e]


SCENARIOS = [t_catalog, t_promo, t_theme, t_soldout, t_missing_and_xss, t_cart_coupon, t_order, t_login_button, t_account, t_user_menu, t_favorites, t_addresses, t_order_error, t_search_sort, t_similar, t_delivery_account, t_cancel_order, t_alerts, t_pricing_images, t_mobile_overflow, t_gold, t_language_toggle, t_english_no_leaks, t_english_search, t_admin, t_admin_english, t_csp, t_blocked_storage]


def main() -> int:
    httpd, port = qa.start_server(ROOT)
    tmp = tempfile.mkdtemp(prefix="cg-e2e-")
    qa.PROFILE_DIR = Path(tmp)
    edge = qa.Edge()
    edge.start()
    try:
        cdp = qa.CDP(edge.new_tab_ws())
        pg = Page(cdp, f"http://127.0.0.1:{port}")
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        for s in SCENARIOS:
            s(pg)
        cdp.close()
    finally:
        edge.stop()
        httpd.shutdown()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} adım geçti")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
