"""Özsafir Gold sitesindeki herkese açık altın fiyat tablosunu okuyup assets/data/gold.json dosyasına yazar.
Yalnızca sitenin görünen HTML sayfası okunur (robots.txt izin verir); API anahtarı veya gizli uç kullanılmaz.
Kullanım: python tools/fetch_gold.py   (GitHub Actions bunu zamanlanmış olarak çalıştırır)
Ayrıştırma başarısız olursa dosya değiştirilmez ve çıkış kodu 1 olur; site son geçerli fiyatları göstermeye devam eder.
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "data" / "gold.json"
URL = "https://ozsafirgold.com/tr"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36"
HEARTBEAT = timedelta(hours=12)  # fiyat değişmese de dosya bu aralıkta bir tazelenir (sitenin "güncel mi" denetimi için)

LABELS = {"22 ayar": "gram22", "çeyrek": "quarter", "yarım": "half", "tam": "full", "ata lira": "ata", "reşat": "resat"}
NUMBER = re.compile(r"^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$")


def _number(text: str) -> float:
    t = text.strip()
    if not NUMBER.match(t):
        raise ValueError(f"fiyat okunamadı: {text!r}")
    v = float(t.replace(".", "").replace(",", "."))
    if v <= 0:
        raise ValueError(f"fiyat sıfır veya negatif: {text!r}")
    return int(v) if v == int(v) else v


def parse_gold(html: str) -> dict:
    start = html.find('class="ozs-gp ')
    if start < 0:
        raise ValueError("fiyat tablosu bulunamadı")
    block = html[start:]
    time_m = re.search(r'ozs-gp__time">(.*?)</div>', block, re.S)
    clock = re.search(r"(\d{2}:\d{2})", re.sub(r"<!--.*?-->", "", time_m.group(1))) if time_m else None
    if not clock:
        raise ValueError("güncelleme saati bulunamadı")
    items = {}
    for seg in block.split('<div class="ozs-gp__row">')[1:]:
        label = re.search(r'ozs-gp__label[^>]*>([^<]+)<', seg)
        nums = re.findall(r'ozs-gp__num">([^<]+)', seg)
        if not label or len(nums) < 2:
            continue
        key = LABELS.get(label.group(1).strip().lower().replace("İ", "i"))
        if key and key not in items:
            buy, sell = _number(nums[0]), _number(nums[1])
            if sell < buy:
                raise ValueError(f"{key}: satış alıştan düşük")
            items[key] = {"buy": buy, "sell": sell}
    missing = set(LABELS.values()) - set(items)
    if missing:
        raise ValueError(f"eksik satırlar: {sorted(missing)}")
    return {"updatedAt": clock.group(1), "items": items}


def should_write(old: dict | None, new: dict, now: datetime) -> bool:
    if not old:
        return True
    if old.get("items") != new["items"] or old.get("updatedAt") != new["updatedAt"]:
        return True
    try:
        return now - datetime.fromisoformat(old["fetchedAt"]) > HEARTBEAT
    except (KeyError, ValueError, TypeError):
        return True


def main() -> int:
    try:
        html = urllib.request.urlopen(urllib.request.Request(URL, headers={"User-Agent": UA}), timeout=25).read().decode("utf-8", "replace")
        new = parse_gold(html)
    except Exception as e:  # noqa: BLE001
        print(f"HATA: {e}", file=sys.stderr)
        return 1
    old = None
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except ValueError:
            old = None
    now = datetime.now(timezone.utc)
    if not should_write(old, new, now):
        print("Fiyatlar değişmedi, dosya yazılmadı.")
        return 0
    doc = {"source": "Özsafir Gold", "sourceUrl": URL, "fetchedAt": now.isoformat(timespec="seconds"), **new}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{OUT} yazıldı: {new['updatedAt']}", {k: v["sell"] for k, v in new["items"].items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
