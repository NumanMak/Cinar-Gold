"""fetch_gold.py birim testleri: python -m unittest discover -s tools -p "test_*.py" """
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_gold  # noqa: E402


def row(label, unit, buy, sell):
    return (f'<div class="ozs-gp__row"><div class="ozs-gp__name"><span class="ozs-gp__coin" aria-hidden="true"></span>'
            f'<span><span class="ozs-gp__label" style="display:block">{label}</span><span class="ozs-gp__unit">{unit}</span></span></div>'
            f'<div class="ozs-gp__val ozs-gp__buy"><div class="ozs-gp__num">{buy}<span class="ozs-gp__cur">₺</span></div></div>'
            f'<div class="ozs-gp__val ozs-gp__sell"><div class="ozs-gp__num">{sell}<span class="ozs-gp__cur">₺</span></div></div></div>')


ROWS = [("22 Ayar", "gram", "5.975", "6.325"), ("Çeyrek", "adet", "10.450", "11.050"), ("Yarım", "adet", "20.900", "22.100"),
        ("Tam", "adet", "41.800", "44.200"), ("Ata Lira", "adet", "43.000", "45.400"), ("Reşat", "adet", "43.000", "45.400")]


def page(rows=ROWS, time="14:36"):
    return ('<html><body><div class="ozs-gp "><div class="ozs-gp__head"><h3 class="ozs-gp__title">Güncel Altın Fiyatları</h3>'
            f'<div class="ozs-gp__time">Güncelleme<!-- -->: <!-- -->{time}</div></div>'
            '<div class="ozs-gp__cols"><span>Ürün</span><span>Alış</span><span>Satış</span></div>'
            + "".join(row(*r) for r in rows) + '</div></body></html>')


class ParseTests(unittest.TestCase):
    def test_parses_all_six_rows_with_turkish_thousands(self):
        d = fetch_gold.parse_gold(page())
        self.assertEqual(d["updatedAt"], "14:36")
        self.assertEqual(d["items"]["gram22"], {"buy": 5975, "sell": 6325})
        self.assertEqual(d["items"]["quarter"], {"buy": 10450, "sell": 11050})
        self.assertEqual(d["items"]["ata"], {"buy": 43000, "sell": 45400})
        self.assertEqual(set(d["items"]), {"gram22", "quarter", "half", "full", "ata", "resat"})

    def test_decimal_comma_is_supported(self):
        rows = [("22 Ayar", "gram", "5.975,50", "6.325,25")] + ROWS[1:]
        self.assertEqual(fetch_gold.parse_gold(page(rows))["items"]["gram22"], {"buy": 5975.5, "sell": 6325.25})

    def test_missing_row_raises(self):
        with self.assertRaises(ValueError):
            fetch_gold.parse_gold(page(ROWS[:5]))

    def test_non_positive_or_garbage_price_raises(self):
        with self.assertRaises(ValueError):
            fetch_gold.parse_gold(page([("22 Ayar", "gram", "0", "0")] + ROWS[1:]))
        with self.assertRaises(ValueError):
            fetch_gold.parse_gold(page([("22 Ayar", "gram", "abc", "6.325")] + ROWS[1:]))

    def test_sell_below_buy_raises(self):
        with self.assertRaises(ValueError):
            fetch_gold.parse_gold(page([("22 Ayar", "gram", "7.000", "6.325")] + ROWS[1:]))

    def test_page_without_price_block_raises(self):
        with self.assertRaises(ValueError):
            fetch_gold.parse_gold("<html><body>bakımda</body></html>")


class ShouldWriteTests(unittest.TestCase):
    now = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)
    new = {"updatedAt": "14:36", "items": {"gram22": {"buy": 1, "sell": 2}}}

    def old(self, hours_ago, **over):
        o = {**self.new, "fetchedAt": (self.now - timedelta(hours=hours_ago)).isoformat()}
        o.update(over)
        return o

    def test_no_previous_file_writes(self):
        self.assertTrue(fetch_gold.should_write(None, self.new, self.now))

    def test_unchanged_and_recent_does_not_write(self):
        self.assertFalse(fetch_gold.should_write(self.old(2), self.new, self.now))

    def test_changed_prices_write(self):
        changed = {**self.new, "items": {"gram22": {"buy": 1, "sell": 3}}}
        self.assertTrue(fetch_gold.should_write(self.old(0.1), changed, self.now))

    def test_changed_time_writes(self):
        self.assertTrue(fetch_gold.should_write(self.old(0.1), {**self.new, "updatedAt": "15:00"}, self.now))

    def test_unchanged_but_stale_heartbeat_writes(self):
        self.assertTrue(fetch_gold.should_write(self.old(13), self.new, self.now))

    def test_corrupt_previous_fetchedAt_writes(self):
        self.assertTrue(fetch_gold.should_write(self.old(1, fetchedAt="bozuk"), self.new, self.now))


if __name__ == "__main__":
    unittest.main()
