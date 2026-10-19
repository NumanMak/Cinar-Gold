"""Gerçek Supabase projesine karşı tarayıcı senaryosu (yerel sunucu + Edge). Test hesabı ve siparişi kendini temizler:
sipariş iptal edilir (stok geri gelir), hesap silinir (sipariş 'silindi' olarak anonimleşir).
TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD ortam değişkenleri verilirse yönetici adımı da çalışır.
Gerçek arka uçta kayıt hız sınırı vardır; art arda çalıştırmalar arasında birkaç dakika bekleyin.
Kullanım: python tools/e2e_supabase.py
"""
import json
import os
import random
import string
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import e2e_shop as base  # noqa: E402
from e2e_shop import Page, check, step  # noqa: E402

qa = base.qa
PID = base.IN_STOCK["id"]
RUN = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
EMAIL = f"e2e.{RUN}@cinargold.test"
PW = "E2E-sifre-2026-xyz"
STATE: dict = {}

REST_JS = """(async (path) => {
  const { CONFIG } = await import('/assets/js/shop/config.js');
  const r = await fetch(CONFIG.url + path, { headers: { apikey: CONFIG.anonKey } });
  return await r.json();
})"""


def rest(pg, path):
    return pg.ev(f"{REST_JS}({json.dumps(path)})")


def server_stock(pg):
    return rest(pg, f"/rest/v1/products_stock?select=stock&product_id=eq.{PID}")[0]["stock"]


@step("gerçek arka uç: mod supabase, katalog 60 ürün ve sunucu fiyatı gösterilir, konsol hatasız")
def t_catalog(pg):
    pg.goto("magaza.html")
    pg.wait("document.querySelectorAll('#urunler .pcard').length === 60")
    check(pg.ev("import('/assets/js/shop/config.js').then(m => m.CONFIG.mode)") == "supabase", "mod supabase değil")
    price = rest(pg, f"/rest/v1/products_priced?select=price&id=eq.{PID}")[0]["price"]
    STATE["price"] = price
    pg.goto("sepet.html")
    pg.goto(f"urun.html?id={PID}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    shown = pg.ev("Number([...document.querySelectorAll('.pdetail *')].map(e => e.children.length ? '' : e.textContent).filter(t => /₺/.test(t))[0].replace(/[^0-9]/g,''))")
    check(shown == price, f"ekrandaki fiyat sunucu fiyatı değil: {shown} != {price}")


@step("hesap: kayıt (izin sorulur), oturum açık, çıkış ve yanlış/doğru giriş")
def t_signup(pg):
    pg.goto("hesap.html")
    pg.wait("!!document.querySelector('.auth')")
    pg.ev("[...document.querySelectorAll('.auth .chip')].find(b=>b.textContent==='Kayıt ol').click()")
    pg.wait("!!document.querySelector('#form-kayit')")
    pg.set_value("#form-kayit input[name=ad]", "TEST E2E")
    pg.set_value("#form-kayit input[name=email]", EMAIL)
    pg.set_value("#form-kayit input[name=sifre]", PW)
    pg.click("#form-kayit button[type=submit]")
    pg.accept_consent()
    pg.wait("!!document.querySelector('.account-layout')", timeout=20)
    check("TEST E2E" in pg.text(".account__main .acard__title"), "ad görünmüyor")
    sess = pg.ev("localStorage.getItem('cg:sb-session')||''")
    check("refresh_token" in sess and PW not in sess, "oturum saklanmıyor ya da şifre sızmış")
    pg.click(".account__side .btn")
    pg.wait("!!document.querySelector('.auth')")
    pg.set_value("#form-giris input[name=email]", EMAIL)
    pg.set_value("#form-giris input[name=sifre]", "yanlis-sifre-99")
    pg.click("#form-giris button[type=submit]")
    pg.wait("document.querySelector('#form-giris .form-msg[role=alert]').textContent.includes('hatalı')", timeout=20)
    pg.set_value("#form-giris input[name=sifre]", PW)
    pg.click("#form-giris button[type=submit]")
    pg.wait("!!document.querySelector('.account-layout')", timeout=20)


@step("sipariş: CINAR10 sunucuda uygulanır, stok bir azalır, sipariş listede görünür")
def t_order(pg):
    before = server_stock(pg)
    pg.goto(f"urun.html?id={PID}")
    pg.wait("!!document.querySelector('.pdetail__buy button')")
    pg.click(".pdetail__buy button")
    pg.wait("document.querySelector('.form-msg[role=status]').textContent.includes('Sepete eklendi')")
    pg.goto("sepet.html")
    pg.wait("!!document.querySelector('.order-form')")
    pg.set_value("input[name=kupon]", "CINAR10")
    pg.click(".coupon button")
    pg.wait("!!document.querySelector('.sum__row--disc')")
    pg.set_value("input[name=ad]", "TEST E2E")
    pg.set_value("input[name=telefon]", "05551112233")
    pg.click(".order-form button[type=submit]")
    pg.wait("!!document.querySelector('.done')", timeout=20)
    check("CG-" in pg.text(".done"), "sipariş numarası yok")
    after = server_stock(pg)
    check(after == before - 1, f"sunucu stoğu düşmedi: {before} -> {after}")
    STATE["stock_after"] = after
    pg.goto("hesap.html#siparisler")
    pg.wait("!!document.querySelector('.orders .order')", timeout=20)
    total = pg.ev("Number([...document.querySelectorAll('.order__head strong')].pop().textContent.replace(/[^0-9]/g,''))")
    expected = STATE["price"] - round(STATE["price"] * 0.1)
    check(total == expected, f"toplam sunucu hesabıyla uyuşmuyor: {total} != {expected}")


@step("sipariş iptali: stok geri gelir")
def t_cancel(pg):
    pg.ev("[...document.querySelectorAll('.order .link-btn')].find(b=>b.textContent==='Siparişi iptal et').click()")
    pg.wait("!![...document.querySelectorAll('.order .btn')].find(b=>b.textContent==='Evet, iptal et')")
    pg.ev("[...document.querySelectorAll('.order .btn')].find(b=>b.textContent==='Evet, iptal et').click()")
    pg.wait("document.querySelector('.order--cancelled') !== null", timeout=20)
    restored = server_stock(pg)
    check(restored == STATE["stock_after"] + 1, f"stok geri gelmedi: {STATE['stock_after']} -> {restored}")


@step("gizlilik: verilerimi indir (şifre yok) ve hesabı sil; silinen hesapla giriş yapılamaz")
def t_privacy(pg):
    pg.goto("hesap.html#izinler")
    pg.wait("!!document.querySelector('#veri-indir')")
    pg.ev("""(() => { window.__blob = null; const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b) => { window.__blob = b; return orig(b); };
      HTMLAnchorElement.prototype.click = function () { window.__dlName = this.download; }; })()""")
    pg.click("#veri-indir")
    pg.wait("window.__blob !== null", timeout=20)
    text = pg.ev("window.__blob.text()")
    check(EMAIL in text and PW not in text and "refresh_token" not in text, "dışa aktarılan veri yanlış ya da gizli bilgi içeriyor")
    pg.click("#hesap-sil")
    pg.wait("!!document.querySelector('#hesap-sil-onay')")
    pg.click("#hesap-sil-onay")
    pg.wait("!!document.querySelector('#hesap-bilgi')", timeout=20)
    pg.set_value("#form-giris input[name=email]", EMAIL)
    pg.set_value("#form-giris input[name=sifre]", PW)
    pg.click("#form-giris button[type=submit]")
    pg.wait("document.querySelector('#form-giris .form-msg[role=alert]').textContent.includes('hatalı')", timeout=20)


@step("yönetici: giriş yapar, panel siparişleri listeler")
def t_admin(pg):
    email, pw = os.environ.get("TEST_ADMIN_EMAIL"), os.environ.get("TEST_ADMIN_PASSWORD")
    if not (email and pw):
        print("      (yönetici bilgisi yok, atlandı)")
        return
    pg.goto("hesap.html")
    pg.wait("!!document.querySelector('#form-giris')")
    pg.set_value("#form-giris input[name=email]", email)
    pg.set_value("#form-giris input[name=sifre]", pw)
    pg.click("#form-giris button[type=submit]")
    pg.wait("!!document.querySelector('.account-layout')", timeout=20)
    pg.goto("admin.html")
    pg.wait("document.body.textContent.includes('CG-')", timeout=20)


class SbPage(Page):
    """Yanlış şifre denemesi sunucudan 400 döner; tarayıcı bunu konsola yazar ama beklenen davranıştır."""

    def _collect(self, method, p):
        before = len(self.errors)
        super()._collect(method, p)
        if len(self.errors) > before and "auth/v1/token?grant_type=password" in self.errors[-1] and "400" in self.errors[-1]:
            self.errors.pop()


SCENARIOS = [t_catalog, t_signup, t_order, t_cancel, t_privacy, t_admin]


def main() -> int:
    httpd, port = qa.start_server(base.ROOT)
    qa.PROFILE_DIR = Path(tempfile.mkdtemp(prefix="cg-e2e-sb-"))
    edge = qa.Edge()
    edge.start()
    try:
        cdp = qa.CDP(edge.new_tab_ws())
        pg = SbPage(cdp, f"http://127.0.0.1:{port}", local=False)
        cdp.send("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        for s in SCENARIOS:
            s(pg)
        cdp.close()
    finally:
        edge.stop()
        httpd.shutdown()
    failed = [r for r in base.RESULTS if not r[1]]
    print(f"\n{len(base.RESULTS) - len(failed)}/{len(base.RESULTS)} adım geçti")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
