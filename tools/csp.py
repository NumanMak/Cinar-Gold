"""Her HTML sayfasına İçerik Güvenlik Politikası (CSP) ve referrer politikası ekler/günceller.
Satır içi <script> blokları SHA-256 özetiyle izinlenir; böylece sayfaya enjekte edilen yabancı betik çalışamaz.
Satır içi betik değiştirildiğinde bu aracı yeniden çalıştırın (python tools/csp.py); tools/check.py özetlerin güncel olduğunu denetler.
Kullanım: python tools/csp.py [--check]
"""
import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "magaza.html", "urun.html", "sepet.html", "hesap.html", "admin.html", "404.html"]
INLINE = re.compile(r"<script(?![^>]*\bsrc=)(?P<attrs>[^>]*)>(?P<body>.*?)</script>", re.S)
META_CSP = re.compile(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?')
META_REF = re.compile(r'[ \t]*<meta name="referrer"[^>]*>\n?')


def inline_hashes(html: str) -> list[str]:
    out = []
    for m in INLINE.finditer(html):
        attrs = m.group("attrs")
        if "application/ld+json" in attrs:  # veri bloğu, çalıştırılmaz
            continue
        digest = hashlib.sha256(m.group("body").encode("utf-8")).digest()
        out.append("'sha256-" + base64.b64encode(digest).decode() + "'")
    return sorted(set(out))


def policy(hashes: list[str]) -> str:
    scripts = " ".join(["'self'", *hashes])
    return "; ".join([
        "default-src 'none'",
        f"script-src {scripts}",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "media-src 'self'",
        "connect-src 'self' https://finans.truncgil.com",
        "frame-src https://www.google.com",
        "manifest-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "object-src 'none'",
    ])


def apply(path: Path, check_only: bool) -> bool:
    html = path.read_text(encoding="utf-8")
    body_html = META_REF.sub("", META_CSP.sub("", html))
    csp = f'<meta http-equiv="Content-Security-Policy" content="{policy(inline_hashes(body_html))}">\n<meta name="referrer" content="strict-origin-when-cross-origin">\n'
    new = re.sub(r'(<meta charset="utf-8">\n)', lambda m: m.group(1) + csp, body_html, count=1)
    if new == body_html:
        raise SystemExit(f"{path.name}: <meta charset> bulunamadı")
    if new != html:
        if check_only:
            return False
        path.write_text(new, encoding="utf-8", newline="")
    return True


def main() -> int:
    check_only = "--check" in sys.argv
    ok = True
    for name in PAGES:
        good = apply(ROOT / name, check_only)
        print(("TAMAM " if good else "GÜNCEL DEĞİL ") + name)
        ok &= good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
