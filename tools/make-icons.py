"""Render the app icons: the word "szó" with an amber focus letter between reticle ticks.

    python tools/make-icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BG, FG, PIVOT = (22, 26, 51), (236, 230, 214), (244, 182, 63)
FONT_CANDIDATES = [
    "C:/Windows/Fonts/georgia.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
]


def font(size):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def render(size, safe=1.0, rounded=True):
    scale = 4
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    inner = S * safe
    f = font(int(inner * 0.36))
    parts = [("s", FG), ("z", PIVOT), ("ó", FG)]
    widths = [d.textlength(t, font=f) for t, _ in parts]
    total = sum(widths)
    asc, desc = f.getmetrics()
    x = (S - total) / 2
    y = S / 2 - (asc + desc) / 2 - inner * 0.02
    pivot_cx = x + widths[0] + widths[1] / 2
    for (t, col), w in zip(parts, widths):
        d.text((x, y), t, font=f, fill=col)
        x += w
    # Reticle: hairlines with ticks above and below the focus letter.
    line_w = max(2, int(inner * 0.012))
    span = inner * 0.30
    top = S / 2 - inner * 0.25
    bot = S / 2 + inner * 0.25
    muted = tuple(int(FG[i] * 0.25 + BG[i] * 0.75) for i in range(3))
    for yy in (top, bot):
        d.line([(S / 2 - span, yy), (S / 2 + span, yy)], fill=muted, width=line_w)
    tick = inner * 0.06
    d.line([(pivot_cx, top), (pivot_cx, top + tick)], fill=PIVOT, width=line_w * 2)
    d.line([(pivot_cx, bot - tick), (pivot_cx, bot)], fill=PIVOT, width=line_w * 2)
    return img.resize((size, size), Image.LANCZOS)


out = ROOT / "icons"
out.mkdir(exist_ok=True)
render(192).save(out / "icon-192.png")
render(512).save(out / "icon-512.png")
render(512, safe=0.72, rounded=False).save(out / "maskable-512.png")
render(32).save(out / "favicon-32.png")
print("icons written to", out)
