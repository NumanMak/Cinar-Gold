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


SCENARIOS = [t_catalog, t_promo, t_theme, t_soldout, t_missing_and_xss]


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
