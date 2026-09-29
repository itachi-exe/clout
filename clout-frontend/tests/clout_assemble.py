"""Assemble the Clout film: per-scene footage stretched to the voiceover timeline.

Reads the whisper word timestamps for /tmp/clout_vo_slow.ogg, finds where each
scene's narration begins, stretches that scene's recorded clip to exactly that
window, normalises everything to 1920x1080, concatenates, then burns captions
and mixes the voiceover with a low ambient pad.

  python3 clout_assemble.py boundaries   # print scene windows only
  python3 clout_assemble.py clips        # normalise + concat
  python3 clout_assemble.py final        # captions + audio + pad
  python3 clout_assemble.py all
"""
import json, os, re, subprocess, sys, unicodedata

FILM = "/tmp/clout_film"
NORM = "/tmp/clout_norm"
VO = "/tmp/clout_vo_slow.ogg"
WJ = "/tmp/clout_vo_slow.json"
SRT = "/tmp/clout_captions.srt"
MASTER = "/tmp/clout_master.mp4"
FINAL = "/tmp/clout_final_v1.mp4"
DELIVERY = "/tmp/clout_delivery.mp4"
PAD = "/tmp/clout_pad.ogg"
W, H, FPS = 1920, 1080, 30
MAX_SPEED = 1.15   # never speed real footage up more than this; trim instead
MAX_SLOW = 1.30    # never slow it further than this; hold the last frame instead

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# scene file, portrait?, anchor (first words of that scene's narration)
SCENES = [
    ("01-01-hook.webm", False, "the internet has a strange problem"),
    ("02-02-idea.webm", False, "clout is the social layer for arc"),
    ("03-03-arc.webm", False, "clout is built on arc"),
    ("04-04-identity.webm", False, "your wallet is your account"),
    ("05-05-feed.webm", False, "the feed is designed around one thing"),
    ("06-06-reputation.webm", False, "reputation on clout is not a vanity badge"),
    ("07-07-markets.webm", False, "then clout does something different"),
    ("08-08-keys.webm", False, "the same idea can extend"),
    ("09-09-effortless.webm", True, "and underneath all of that"),
    ("10-10-close.webm", False, "the next social network"),
]


def run(cmd, quiet=True):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        print("FAILED:", " ".join(str(c) for c in cmd))
        print(p.stderr[-2500:])
        raise SystemExit(1)
    if not quiet:
        print(p.stdout[-800:])
    return p.stdout


def probe(path, entries="format=duration"):
    out = run(["ffprobe", "-v", "quiet", "-show_entries", entries, "-of", "default=nw=1", path])
    vals = {}
    for line in out.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            vals[k] = v
    return vals


ALIASES = {"cloud": "clout", "clod": "clout", "clott": "clout", "cloth": "clout",
           "clouts": "clout", "clown": "clout", "uncloud": "clout", "usc": "usdc", "usb": "usdc"}


def norm(t):
    t = unicodedata.normalize("NFKD", t).lower()
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    parts = [ALIASES.get(p, p) for p in t.split()]
    return " ".join(parts).strip()


def words():
    with open(WJ) as fh:
        data = json.load(fh)
    flat = []
    for seg in data.get("segments", []):
        for w in seg.get("words", []):
            tok = norm(w.get("word", ""))
            if tok:
                flat.append((tok, float(w["start"]), float(w["end"])))
    return flat


def boundaries():
    flat = words()
    toks = [w[0] for w in flat]
    audio = float(probe(VO)["duration"])
    marks = []
    cursor = 0
    for name, portrait, anchor in SCENES:
        a = norm(anchor).split()
        found = None
        for n in range(len(a), 1, -1):
            needle = a[:n]
            for i in range(cursor, len(toks) - n):
                if toks[i:i + n] == needle:
                    found = (i, n)
                    break
            if found:
                break
        if found:
            i = found[0]
            marks.append((flat[i][1], found[1]))
            cursor = i + 1
        else:
            marks.append((None, 0))
    starts = [m[0] for m in marks]
    starts[0] = 0.0
    counts = [max(1, len(norm(a).split())) for _, _, a in SCENES]
    i = 1
    while i < len(starts):
        if starts[i] is None:
            j = i
            while j < len(starts) and starts[j] is None:
                j += 1
            prev = starts[i - 1]
            nxt = starts[j] if j < len(starts) else audio
            total_w = sum(counts[i:j]) or 1
            acc = prev
            for k in range(i, j):
                acc += (nxt - prev) * (counts[k] / total_w)
                starts[k] = acc
            i = j
        else:
            i += 1
    windows = []
    for i, (name, portrait, anchor) in enumerate(SCENES):
        s = 0.0 if i == 0 or starts[i] is None else starts[i]
        e = audio if i == len(SCENES) - 1 else (starts[i + 1] if starts[i + 1] is not None else audio)
        windows.append((name, portrait, s, e, e - s))
    return audio, marks, windows


def clips(windows):
    os.makedirs(NORM, exist_ok=True)
    parts = []
    for i, (name, portrait, s, e, target) in enumerate(windows):
        src = os.path.join(FILM, name)
        if not os.path.exists(src):
            print("missing", src)
            raise SystemExit(1)
        d = float(probe(src)["duration"])
        speed = d / target
        trim = None
        tpad = 0.0
        if speed > MAX_SPEED:
            trim = target * MAX_SPEED
            factor = 1.0 / MAX_SPEED
            d = trim
        elif speed < 1.0:
            need = target / d
            if need > MAX_SLOW:
                factor = MAX_SLOW
                tpad = max(0.0, target - d * MAX_SLOW)
            else:
                factor = need
        else:
            factor = 1.0 / speed
        trim_opt = ["-t", f"{trim:.3f}"] if trim else []
        if portrait:
            chain = (
                f"setpts={factor:.4f}*PTS,fps={FPS},split[bg][fg];"
                f"[bg]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
                f"gblur=sigma=30,eq=brightness=-0.14:saturation=0.7[bgb];"
                f"[fg]scale=-2:{H - 90}[fgs];"
                f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2"
            )
        else:
            chain = (
                f"setpts={factor:.4f}*PTS,fps={FPS},"
                f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black"
            )
        if tpad > 0.01:
            chain += f",tpad=stop_mode=clone:stop_duration={tpad:.3f}"
        if i == 0:
            chain += ",fade=t=in:st=0:d=1.2"
        if i == len(windows) - 1:
            out_d = target
            chain += f",fade=t=out:st={max(0, out_d - 1.6):.2f}:d=1.6"
            if os.path.exists(FONT):
                t1 = max(0, out_d - 5.5)
                chain += (
                    f",drawtext=fontfile={FONT}:text='Clout':fontcolor=white:fontsize=76:"
                    f"x=(w-text_w)/2:y=(h/2)-90:alpha='if(lt(t,{t1:.2f}),0,min(1,(t-{t1:.2f})/1.2))'"
                    f",drawtext=fontfile={FONT_R}:text='The social layer for Arc':fontcolor=0xC8D4E8:fontsize=30:"
                    f"x=(w-text_w)/2:y=(h/2)+16:alpha='if(lt(t,{t1 + 0.5:.2f}),0,min(1,(t-{t1 + 0.5:.2f})/1.2))'"
                    f",drawtext=fontfile={FONT_R}:text='cloutonarc.fun':fontcolor=0x7F8FA6:fontsize=24:"
                    f"x=(w-text_w)/2:y=(h/2)+70:alpha='if(lt(t,{t1 + 1.1:.2f}),0,min(1,(t-{t1 + 1.1:.2f})/1.2))'"
                )
        out = os.path.join(NORM, f"n{i:02d}.mp4")
        run(["ffmpeg", "-y"] + trim_opt + ["-i", src, "-filter_complex", f"[0:v]{chain}[v]", "-map", "[v]",
             "-an", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium",
             "-pix_fmt", "yuv420p", out])
        parts.append(out)
        print(f"clip {i:02d} {name}: source {d:.1f}s -> target {target:.1f}s "
              f"(speed {1 / factor:.2f}x{', trimmed' if trim else ''}"
              f"{', held' if tpad else ''})")
    lst = "/tmp/clout_concat.txt"
    with open(lst, "w") as fh:
        for p_ in parts:
            fh.write(f"file '{p_}'\n")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", MASTER])
    info = probe(MASTER, "format=duration:stream=width,height")
    print("master:", info)
    return parts


def srt_from_whisper():
    flat = words()
    chunks, cur = [], []
    for tok, s, e in flat:
        cur.append((tok, s, e))
        if len(cur) >= 8 or tok.endswith((".", "?", "!", ",", ";")):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")
    lines = []
    for i, ch in enumerate(chunks, start=1):
        start, end = ch[0][1], max(ch[-1][2], ch[0][1] + 0.9)
        text = " ".join(c[0] for c in ch)
        lines.append(f"{i}\n{ts(start)} --> {ts(end)}\n{text}\n")
    with open(SRT, "w") as fh:
        fh.write("\n".join(lines))
    print("srt cues:", len(chunks))
    return SRT


def final():
    audio = float(probe(VO)["duration"])
    run(["ffmpeg", "-y", "-f", "lavfi", "-i",
         f"aevalsrc=0.3*sin(2*PI*55*t)+0.15*sin(2*PI*110*t)+0.08*sin(2*PI*82.5*t):s=44100",
         "-af", f"volume=0.4,aecho=0.8:0.88:60:0.4,lowpass=f=300,afade=t=in:ss=0:d=4,"
                f"afade=t=out:st={max(0, audio - 5):.2f}:d=5",
         "-t", f"{audio:.2f}", PAD])
    style = ("FontName=DejaVu Sans,FontSize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
             "BackColour=&H80000000,Bold=1,Outline=1,Shadow=1,Alignment=2,MarginV=25")
    run(["ffmpeg", "-y", "-i", MASTER, "-i", VO, "-i", PAD,
         "-filter_complex",
         f"[0:v]subtitles='{SRT}':force_style='{style}'[v];"
         f"[2:a]volume=0.09[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=3[a]",
         "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "128k", "-shortest", FINAL])
    print("final:", probe(FINAL, "format=duration:stream=codec_name,width,height"))


def deliver(target_mb=36):
    """Telegram-friendly encode: same frame, bitrate chosen to stay under the upload cap."""
    info = probe(FINAL, "format=duration,size")
    dur = float(info["duration"])
    vbr = int(target_mb * 8 * 1024 / dur)
    run(["ffmpeg", "-y", "-i", FINAL, "-c:v", "libx264", "-preset", "slow",
         "-b:v", f"{vbr}k", "-maxrate", f"{int(vbr * 1.4)}k", "-bufsize", f"{int(vbr * 2)}k",
         "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", DELIVERY])
    fin = probe(DELIVERY, "format=duration,size:stream=width,height,codec_name")
    print("delivery:", fin, "->", round(int(fin["size"]) / 1048576, 1), "MB")
    return DELIVERY


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "boundaries"
    audio, marks, windows = boundaries()
    if what in ("boundaries", "all"):
        print(f"audio {audio:.2f}s")
        for i, ((name, portrait, s, e, dur), m) in enumerate(zip(windows, marks)):
            print(f"  {i + 1:02d} {name:24s} {s:7.2f} -> {e:7.2f}  ({dur:6.2f}s)  match={'ok' if m[0] is not None else 'FALLBACK'} n={m[1]}")
    if what in ("clips", "all"):
        clips(windows)
    if what in ("final", "all"):
        srt_from_whisper()
        final()
    if what == "deliver":
        deliver()
