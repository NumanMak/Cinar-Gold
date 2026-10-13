import subprocess, sys, os, re, json
from PIL import Image, ImageDraw
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0"
D = os.path.join(os.path.dirname(__file__), "video")
FR = os.path.join(D, "frames"); os.makedirs(FR, exist_ok=True)

def head_ok(url):
    r = subprocess.run(["curl", "-sIL", "-A", UA, "-o", "NUL", "-w", "%{http_code} %{size_download}", url], capture_output=True, text=True)
    return r.stdout.startswith("200")

def probe(url):
    r = subprocess.run([FF, "-hide_banner", "-i", url], capture_output=True, text=True, errors="ignore")
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    res = re.search(r"Video: .*?, (\d{3,5})x(\d{3,5})", r.stderr)
    fps = re.search(r"([\d.]+) fps", r.stderr)
    d = int(dur.group(1))*3600+int(dur.group(2))*60+float(dur.group(3)) if dur else 0
    return d, (res.group(1)+"x"+res.group(2)) if res else "?", fps.group(1) if fps else "?"

ids = sys.argv[1].split(",")
sheet_name = sys.argv[2]
info = {}
rows = []
for vid in ids:
    best = None
    if vid.startswith("p"):
        import video_pexels_probe as pp
        best = pp.loc(vid[1:]); src = best
    else:
      for q in ["2160", "1080", "720"]:
        u = f"https://assets.mixkit.co/videos/{vid}/{vid}-{q}.mp4"
        if head_ok(u):
            best = u; break
      small = f"https://assets.mixkit.co/videos/{vid}/{vid}-360.mp4"
      src = small if head_ok(small) else best
    d, res, fps = probe(best or small)
    info[vid] = {"best": best, "dur": d, "res": res, "fps": fps}
    print(vid, best, d, res, fps, flush=True)
    thumbs = []
    for k, frac in enumerate([0.08, 0.35, 0.62, 0.9]):
        t = max(0, d*frac)
        out = os.path.join(FR, f"{vid}_{k}.jpg")
        subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=320:-2", out])
        if os.path.exists(out):
            thumbs.append(Image.open(out).convert("RGB"))
    rows.append((vid, f"{vid} {res} {d:.1f}s {fps}fps", thumbs))
W, H = 320, 180
img = Image.new("RGB", (W*4, (H+18)*len(rows)), (40, 40, 40))
dr = ImageDraw.Draw(img)
for i, (vid, label, th) in enumerate(rows):
    y = i*(H+18)
    dr.text((4, y+2), label, fill=(255, 220, 120))
    for k, t in enumerate(th):
        t = t.resize((W, int(t.height*W/t.width)))
        img.paste(t.crop((0, 0, W, min(H, t.height))), (k*W, y+18))
img.save(os.path.join(D, sheet_name))
json.dump(info, open(os.path.join(D, sheet_name + ".json"), "w"), indent=1)
