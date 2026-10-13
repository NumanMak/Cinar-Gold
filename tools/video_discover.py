import re, json, subprocess, sys, os
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
OUT = os.path.join(os.path.dirname(__file__), "video")
cats = sys.argv[1:] or ["jewelry", "gold", "diamond", "ring", "necklace", "luxury"]

def get(url):
    r = subprocess.run(["curl", "-sL", "-A", UA, url], capture_output=True)
    return r.stdout.decode("utf-8", "ignore")

found = {}
for c in cats:
    for page in ["", "?page=2"]:
        html = get(f"https://mixkit.co/free-stock-video/{c}/{page}")
        # video items: link /free-stock-video/<slug>-<id>/ and title
        for m in re.finditer(r'href="/free-stock-video/([a-z0-9-]+)-(\d+)/"', html):
            slug, vid = m.group(1), m.group(2)
            found.setdefault(vid, {"slug": slug, "cats": set()})["cats"].add(c)
        for m in re.finditer(r'https://assets\.mixkit\.co/videos/(\d+)/[^"\s]+?\.mp4', html):
            found.setdefault(m.group(1), {"slug": "?", "cats": set()}).setdefault("mp4", set()).add(m.group(0))
res = []
for vid, d in found.items():
    res.append({"id": vid, "slug": d["slug"], "cats": sorted(d["cats"]), "mp4": sorted(d.get("mp4", []))})
json.dump(res, open(os.path.join(OUT, "mixkit_candidates.json"), "w"), indent=1)
for r in res:
    print(r["id"], r["slug"], ",".join(r["cats"]), len(r["mp4"]))
print(len(res))
