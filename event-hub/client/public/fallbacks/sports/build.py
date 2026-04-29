#!/usr/bin/env python3
"""Build category fallback SVGs by wrapping Tabler icons in a colored square,
then render them to PNG via macOS qlmanage.

Tabler Icons: https://github.com/tabler/tabler-icons (MIT)

Usage:
    python3 build.py            # regenerate SVGs + PNGs in this directory

Edit the ICONS map below to change the icon or color for any category.
"""
import os
import re
import shutil
import subprocess
import sys
import urllib.request

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
TABLER_BASE = "https://raw.githubusercontent.com/tabler/tabler-icons/main/icons/outline"

# slug → (gradient top hex, gradient bottom hex, Tabler outline icon name without extension)
# Colors are Tailwind 800/900 — muted enough to sit comfortably in a dark UI.
# Top-to-bottom gradient adds subtle depth without distracting from the icon.
ICONS = {
    # ── Sports subcategories ──────────────────────────────────────────────
    "baseball-softball": ("#991b1b", "#7f1d1d", "ball-baseball"),
    "basketball":        ("#9a3412", "#7c2d12", "ball-basketball"),
    "soccer":            ("#065f46", "#064e3b", "ball-football"),         # tabler "football" = soccer
    "football":          ("#78350f", "#451a03", "ball-american-football"),
    "volleyball":        ("#a16207", "#854d0e", "ball-volleyball"),
    "tennis":            ("#3f6212", "#365314", "ball-tennis"),
    "golf":              ("#166534", "#14532d", "golf"),
    "swimming-diving":   ("#075985", "#0c4a6e", "swimming"),
    "track-field":       ("#9f1239", "#881337", "run"),
    "cross-country":     ("#115e59", "#134e4a", "run"),
    "bowling":           ("#3730a3", "#312e81", "ball-bowling"),
    "pickleball":        ("#4d7c0f", "#3f6212", "ball-tennis"),     # close visual match — no tabler pickleball
    "hockey":            ("#155e75", "#164e63", "medal"),           # no tabler hockey
    "lacrosse":          ("#5b21b6", "#4c1d95", "medal-2"),         # no tabler lacrosse
    "wrestling":         ("#292524", "#1c1917", "play-handball"),   # no tabler wrestling
    "cheerleading":      ("#9d174d", "#831843", "shirt-sport"),     # no tabler cheer
    "sports":            ("#1e293b", "#0f172a", "trophy"),
    # ── Other top-level categories ────────────────────────────────────────
    "outdoors":          ("#115e59", "#064e3b", "trees"),
    "classes":           ("#4338ca", "#3730a3", "palette"),
    "festivals":         ("#92400e", "#78350f", "confetti"),
    "performances":      ("#7e22ce", "#6b21a8", "masks-theater"),
    "music":             ("#be185d", "#9d174d", "music"),
}

# Icon is centered in the 256×256 viewBox at ~37% of frame width.
ICON_SIZE = 96
ICON_OFFSET = (256 - ICON_SIZE) // 2

WRAPPER = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{{top}}"/>
      <stop offset="100%" stop-color="{{bottom}}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <svg x="{ICON_OFFSET}" y="{ICON_OFFSET}" width="{ICON_SIZE}" height="{ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
{{paths}}
  </svg>
</svg>
"""


def fetch_icon(name: str) -> str:
    """Download a Tabler icon and return just the inner shape elements."""
    url = f"{TABLER_BASE}/{name}.svg"
    with urllib.request.urlopen(url) as r:
        text = r.read().decode("utf-8")
    m = re.search(r"<svg[^>]*>(.*?)</svg>", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"No <svg> in {url}")
    return "\n".join("    " + line.strip() for line in m.group(1).strip().splitlines() if line.strip())


def render_svgs():
    icon_cache = {}
    for slug, (top, bottom, icon_name) in ICONS.items():
        if icon_name not in icon_cache:
            icon_cache[icon_name] = fetch_icon(icon_name)
        svg = WRAPPER.format(top=top, bottom=bottom, paths=icon_cache[icon_name])
        with open(os.path.join(OUT_DIR, slug + ".svg"), "w") as f:
            f.write(svg)
        print(f"  ✓ {slug}.svg ← tabler/{icon_name}")


def render_pngs():
    if not shutil.which("qlmanage"):
        print("qlmanage not found — install macOS dev tools or convert SVGs manually.", file=sys.stderr)
        return
    for f in os.listdir(OUT_DIR):
        if f.endswith(".png"):
            os.remove(os.path.join(OUT_DIR, f))
    svgs = [f for f in os.listdir(OUT_DIR) if f.endswith(".svg")]
    subprocess.run(["qlmanage", "-t", "-s", "1024", "-o", OUT_DIR, *svgs], cwd=OUT_DIR, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for f in os.listdir(OUT_DIR):
        if f.endswith(".svg.png"):
            os.rename(os.path.join(OUT_DIR, f), os.path.join(OUT_DIR, f[:-len(".svg.png")] + ".png"))
    print(f"  ✓ rendered {len(svgs)} PNGs at 1024×1024")


if __name__ == "__main__":
    render_svgs()
    render_pngs()
