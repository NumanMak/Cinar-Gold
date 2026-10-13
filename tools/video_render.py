"""Render hero video variants.
usage: python video_render.py SRC OUTBASE --ss S --to T [--slow 2] [--xf 1.5] [--flip] [--grade]
Produces OUTBASE.mp4 (1920x1080) and OUTBASE-720.mp4, plus OUTBASE-poster.webp
"""
import argparse, subprocess, os
from PIL import Image
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--ss", type=float, default=0); ap.add_argument("--to", type=float, required=True)
ap.add_argument("--slow", type=float, default=1.0)
ap.add_argument("--xf", type=float, default=1.0)
ap.add_argument("--flip", action="store_true")
ap.add_argument("--crf", type=int, default=28); ap.add_argument("--crf720", type=int, default=29)
ap.add_argument("--grade", default="eq=contrast=1.08:brightness=-0.03:saturation=0.82:gamma=0.95,curves=r='0/0 0.25/0.21 1/1':g='0/0 0.25/0.2 1/0.96':b='0/0 0.25/0.17 1/0.86'")
ap.add_argument("--shade", type=float, default=0.55, help="max darkening at left edge (0 = none)")
a = ap.parse_args()
D = os.path.dirname(os.path.abspath(a.out)); os.makedirs(D, exist_ok=True)
tmpdir = os.path.join(os.path.dirname(__file__), "video"); os.makedirs(tmpdir, exist_ok=True)

# left-side shade overlay (black, alpha fades from shade at x=0 to 0 at x=55%)
shade = os.path.join(tmpdir, "shade.png")
g = Image.new("RGBA", (1920, 1080))
px = []
for x in range(1920):
    f = max(0.0, 1 - x / (1920 * 0.55))
    px.append(int(255 * a.shade * (f ** 1.6)))
row = Image.new("L", (1920, 1))
row.putdata(px)
alpha = row.resize((1920, 1080))
g = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0)); g.putalpha(alpha)
black = Image.new("RGBA", (1920, 1080), (0, 0, 0, 255)); black.putalpha(alpha)
black.save(shade)

L = (a.to - a.ss) * a.slow  # slowed length
F = a.xf
base = f"[0:v]trim=start={a.ss}:end={a.to},setpts=PTS-STARTPTS,scale=1920:1080:flags=lanczos,setsar=1"
if a.slow != 1:
    base += f",setpts={a.slow}*PTS,minterpolate=fps=25:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
base += ",fps=25,settb=1/25"
if a.flip:
    base += ",hflip"
if a.grade:
    base += "," + a.grade
base += ",format=yuv420p,split=2[s1][s2]"
fc = (base + ";"
      f"[s1]trim=start={F}:end={L},setpts=PTS-STARTPTS,fps=25[A];"
      f"[s2]trim=start=0:end={F},setpts=PTS-STARTPTS,fps=25[B];"
      f"[A][B]xfade=transition=fade:duration={F}:offset={L-2*F:.3f}[x];"
      f"[x][1:v]overlay=0:0:format=auto,format=yuv420p[v]")
hi = a.out + ".mp4"
cmd = [FF, "-y", "-loglevel", "error", "-i", a.src, "-loop", "1", "-i", shade, "-filter_complex", fc,
       "-map", "[v]", "-t", f"{L-F:.3f}", "-an", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow",
       "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-r", "25", "-g", "50", "-movflags", "+faststart", hi]
print(" ".join(cmd)); subprocess.run(cmd, check=True)
lo = a.out + "-720.mp4"
subprocess.run([FF, "-y", "-loglevel", "error", "-i", hi, "-vf", "scale=1280:720:flags=lanczos", "-an", "-c:v", "libx264",
                "-profile:v", "high", "-preset", "slow", "-crf", str(a.crf720), "-pix_fmt", "yuv420p", "-r", "25", "-g", "50",
                "-movflags", "+faststart", lo], check=True)
png = a.out + "-poster.png"
subprocess.run([FF, "-y", "-loglevel", "error", "-i", hi, "-frames:v", "1", png], check=True)
Image.open(png).convert("RGB").save(a.out + "-poster.webp", "WEBP", quality=80, method=6)
os.remove(png)
for f in [hi, lo, a.out + "-poster.webp"]:
    print(f, os.path.getsize(f))
print("duration", L - F)
