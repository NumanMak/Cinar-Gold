"""supabase/setup.sql dosyasını gerçek PostgreSQL ayrıştırıcısıyla (pglast) denetler: SQL ve plpgsql sözdizimi.
Kullanım: python tools/check_sql.py      (gerekirse: python -m pip install pglast)
"""
import re
import sys
from pathlib import Path

import pglast

SQL = Path(__file__).resolve().parent.parent / "supabase" / "setup.sql"


def main() -> int:
    sql = SQL.read_text(encoding="utf-8")
    ok = True
    try:
        stmts = pglast.parse_sql(sql)
        print(f"SQL sözdizimi TAMAM, deyim sayısı: {len(stmts)}")
    except Exception as e:  # noqa: BLE001
        print("SQL HATA:", e)
        return 1
    funcs = list(re.finditer(r"create (?:or replace )?function public\.(\w+)[\s\S]*?language plpgsql[\s\S]*?\$\$[\s\S]*?\$\$;", sql, re.I))
    for m in funcs:
        try:
            pglast.parse_plpgsql(m.group(0))
            print("plpgsql TAMAM:", m.group(1))
        except Exception as e:  # noqa: BLE001
            ok = False
            print("plpgsql HATA", m.group(1), e)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
