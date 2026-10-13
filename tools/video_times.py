import subprocess, sys, os
from PIL import Image, ImageDraw
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
D = os.path.join(os.path.dirname(__file__), "video")
# usage: video_times.py SRC NAME t1,t2,...
src, name, ts = sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3].split(",")]
W = 400; ims = []
for k, t in enumerate(ts):
    out = os.path.join(D, "frames", f"{name}_t{k:02d}.jpg")
    subprocess.run([FF, "-y", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1", "-vf", f"scale={W}:-2", out])
    ims.append((t, Image.open(out).convert("RGB")))
h = ims[0][1].height; cols = 4; rows = (len(ims)+3)//4
img = Image.new("RGB", (W*cols, (h+16)*rows), (30, 30, 30)); dr = ImageDraw.Draw(img)
for i, (t, im) in enumerate(ims):
    x, y = (i % cols)*W, (i//cols)*(h+16)
    img.paste(im, (x, y+16)); dr.text((x+4, y+2), f"{name} t={t:.2f}", fill=(255, 220, 120))
img.save(os.path.join(D, f"times_{name}.jpg"))
