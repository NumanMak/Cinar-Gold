import subprocess, sys, os
from PIL import Image, ImageDraw
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
D = os.path.join(os.path.dirname(__file__), "video")
FR = os.path.join(D, "frames")
# usage: video_strip.py SRC NAME DUR [N]
src, name, dur = sys.argv[1], sys.argv[2], float(sys.argv[3])
n = int(sys.argv[4]) if len(sys.argv) > 4 else 12
W = 400
ims = []
for k in range(n):
    t = dur * k / n
    out = os.path.join(FR, f"{name}_s{k:02d}.jpg")
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", f"scale={W}:-2", out])
    ims.append((t, Image.open(out).convert("RGB")))
h = ims[0][1].height
cols = 4
rows = (n + cols - 1) // cols
img = Image.new("RGB", (W*cols, (h+16)*rows), (30, 30, 30))
dr = ImageDraw.Draw(img)
for i, (t, im) in enumerate(ims):
    x, y = (i % cols) * W, (i // cols) * (h+16)
    img.paste(im, (x, y+16)); dr.text((x+4, y+2), f"{name} t={t:.1f}", fill=(255, 220, 120))
img.save(os.path.join(D, f"strip_{name}.jpg"))
