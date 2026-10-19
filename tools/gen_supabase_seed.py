"""Katalog ve başlangıç verisinden supabase/seed.sql üretir ve supabase/schema.sql ile birleştirip supabase/setup.sql yazar.
setup.sql, Supabase SQL Editor'e yapıştırılan tek dosyadır. Yeniden çalıştırmak güvenlidir: stok değerleri ezilmez.
Kullanım: python tools/gen_supabase_seed.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SQL_DIR = ROOT / "supabase"
GOLD_FALLBACK = 6325


def q(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def build_seed() -> str:
    products = json.loads((ROOT / "assets" / "data" / "products.json").read_text(encoding="utf-8"))
    try:
        gold = json.loads((ROOT / "assets" / "data" / "gold.json").read_text(encoding="utf-8"))["items"]["gram22"]["sell"]
    except (OSError, KeyError, ValueError):
        gold = GOLD_FALLBACK
    cat = ",\n".join(
        f"  ({q(p['id'])}, {q(p['type'])}, {q(p['name'])}, {p['gram']}, {p['karat']}, {p['laborRate']}, {p['stoneFee']})"
        for p in products
    )
    stock = ",\n".join(f"  ({q(p['id'])}, {p['stock']})" for p in products)
    return f"""-- Katalog ve başlangıç stoğu (tools/gen_supabase_seed.py ile üretildi; elle düzenlemeyin).
insert into public.products_catalog (id, type, name, gram, karat, labor_rate, stone_fee) values
{cat}
on conflict (id) do update set type = excluded.type, name = excluded.name, gram = excluded.gram,
  karat = excluded.karat, labor_rate = excluded.labor_rate, stone_fee = excluded.stone_fee;

-- Başlangıç stoğu: var olan stok değerinin üzerine yazılmaz.
insert into public.products_stock (product_id, stock) values
{stock}
on conflict (product_id) do nothing;

insert into public.gold_price (id, gram22_sell) values (1, {gold})
on conflict (id) do update set gram22_sell = excluded.gram22_sell, updated_at = now();
"""


def main() -> None:
    seed = build_seed()
    (SQL_DIR / "seed.sql").write_text(seed, encoding="utf-8")
    schema = (SQL_DIR / "schema.sql").read_text(encoding="utf-8")
    (SQL_DIR / "setup.sql").write_text(schema.rstrip() + "\n\n-- ============================================================ Katalog verisi\n\n" + seed, encoding="utf-8")
    print("yazıldı: supabase/seed.sql ve supabase/setup.sql")


if __name__ == "__main__":
    main()
