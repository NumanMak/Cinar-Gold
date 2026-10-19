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
    pg.click(".shop-actions button")
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
      ul.append(m.productCard({id:'x',name:'<img src=x onerror=window.__pwn=1>',karat:14,gram:1,price:1,img:'p-ring'},{inventory:inv}));})()""")
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
    price = IN_STOCK["price"]
    pg.set_value("input[name=kupon]", " cinar10 ")
    pg.click(".coupon button")
    pg.wait("!!document.querySelector('.sum__row--disc')")
    disc = round(price * 0.1)
    check(f"{(price - disc):,}".replace(",", ".") in pg.text(".sum__row--total"), f"toplam yanlış: {pg.text('.sum__row--total')}")
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
    pg.wait("!!document.querySelector('.account')")
    check("<b>Ayşe</b>" in pg.text(".account .shop-lead"), "ad düz metin olarak görünmüyor")
    check(pg.ev("document.querySelectorAll('.account b').length") == 0, "ad HTML olarak yorumlandı")
    check("verildi" in pg.text("#izin-durum"), "izin durumu yok")
    users = pg.ev("localStorage.getItem('cg:users')")
    check("gizli-sifre-1" not in users, "düz şifre saklanmış")
    pg.click(".account .pdetail__buy button")
    pg.wait("!!document.querySelector('.auth')")
    pg.ev("document.querySelector('#form-giris')||0")
    pg.set_value("#form-giris input[name=email]", "ayse@ornek.com")
    pg.set_value("#form-giris input[name=sifre]", "yanlis-sifre")
    pg.click("#form-giris button[type=submit]")
    pg.wait("document.querySelector('#form-giris .form-msg[role=alert]').textContent.includes('hatalı')")
    pg.set_value("#form-giris input[name=sifre]", "gizli-sifre-1")
    pg.click("#form-giris button[type=submit]")
    pg.wait("!!document.querySelector('.account')")


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
    pg.set_value("#ara", "KOLYE nazar")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 3")
    pg.set_value("#ara", "pirlanta tektas")
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
    pg.goto("hesap.html")
    pg.wait("!!document.querySelector('.orders')")
    check("Adrese teslim: Atatürk Cd. No:25" in pg.text(".orders"), "sipariş adresi hesapta yok")
    check(pg.ev("document.querySelector('#form-profil textarea').value") == "Atatürk Cd. No:25 Fethiye Muğla", "adres profile kaydedilmedi")
    pg.set_value("#form-profil input[name=ad]", "Ayşe Y.")
    pg.click("#form-profil button[type=submit]")
    pg.wait("document.querySelector('#form-profil .form-msg[role=status]').textContent.includes('kaydedildi')")
    check("Ayşe" in pg.text("[data-account-label]"), "üst bilgideki ad güncellenmedi")
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
    pg.goto("hesap.html")
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


SCENARIOS = [t_catalog, t_promo, t_theme, t_soldout, t_missing_and_xss, t_cart_coupon, t_order, t_account, t_order_error, t_search_sort, t_similar, t_delivery_account, t_alerts, t_mobile_overflow, t_blocked_storage]


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
