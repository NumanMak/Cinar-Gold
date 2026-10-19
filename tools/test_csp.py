"""csp.py birim testleri: python -m unittest discover -s tools -p "test_*.py" """
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import csp  # noqa: E402


class PolicyTests(unittest.TestCase):
    def test_default_policy_is_strict(self):
        p = csp.policy(["'sha256-abc='"])
        self.assertIn("default-src 'none'", p)
        self.assertIn("object-src 'none'", p)
        self.assertIn("base-uri 'none'", p)
        self.assertNotIn("unsafe-inline", p)
        self.assertNotIn("unsafe-eval", p)
        self.assertIn("'sha256-abc='", p)

    def test_connect_src_has_only_self_gold_and_project(self):
        connect = re.search(r"connect-src ([^;]+)", csp.policy([])).group(1).split()
        extra = [x for x in connect if x not in ("'self'", "https://finans.truncgil.com")]
        self.assertLessEqual(len(extra), 1)
        for x in extra:
            self.assertRegex(x, r"^https://[a-z0-9-]+\.supabase\.co$")

    def test_backend_origin_parses_config(self):
        original = csp.CONFIG.read_text(encoding="utf-8")
        self.assertRegex(original, r"url: '")
        origin = csp.backend_origin()
        self.assertTrue(origin == "" or re.match(r"^https://[a-z0-9-]+\.supabase\.co$", origin))

    def test_config_has_no_secret_keys(self):
        raw = csp.CONFIG.read_text(encoding="utf-8").lower()
        text = "\n".join(line for line in raw.splitlines() if not line.strip().startswith("//"))  # açıklamalar hariç yalnızca kod
        for bad in ("service_role", "sb_secret", "eyj"):
            self.assertNotIn(bad, text)
        self.assertNotRegex(text, r"password\s*:\s*'[^']+'")


if __name__ == "__main__":
    unittest.main()
