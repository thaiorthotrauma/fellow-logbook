"""Prepares the figure and font assets the guide HTML references.

Three jobs:
  1. Copy the self-hosted IBM Plex woff2 files out of node_modules, so the
     guides use the same type as the app.
  2. Rasterise the first two pages of each captured app export (see
     export-pdfs.mjs) into figures.
  3. Downscale every figure to the resolution the page actually needs at
     300 dpi and re-encode as JPEG — the same figures as lossless PNG make the
     finished guides roughly three times larger for no visible gain in print.

Needs: pypdfium2, pillow.
"""

import glob
import os
import shutil
import sys

from PIL import Image
import pypdfium2 as pdfium

GUIDES = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(GUIDES))
FIGS = os.path.join(GUIDES, "figs")
FONTS = os.path.join(GUIDES, "fonts")
EXPORTS = os.path.join(GUIDES, "exports")

FONT_FILES = [
    ("@fontsource/ibm-plex-sans", "ibm-plex-sans-latin-{}-normal.woff2", ["400", "500", "600", "700"]),
    ("@fontsource/ibm-plex-sans-thai", "ibm-plex-sans-thai-thai-{}-normal.woff2", ["400", "600", "700"]),
]

# Widest each figure is ever placed on the page, in mm, at 300 dpi. The rich
# menus run nearly full width; everything else is a column or half a column.
WIDTH_CAPS = {"richmenu": 1700, "export-": 1000}
DEFAULT_CAP = 900


def copy_fonts() -> None:
    os.makedirs(FONTS, exist_ok=True)
    for pkg, pattern, weights in FONT_FILES:
        for w in weights:
            name = pattern.format(w)
            src = os.path.join(REPO, "node_modules", pkg, "files", name)
            if not os.path.exists(src):
                sys.exit(f"missing {src} — run npm install first")
            shutil.copy(src, os.path.join(FONTS, name))
    print(f"fonts   → {len(os.listdir(FONTS))} files")


def copy_rich_menus() -> None:
    for name in ("richmenu-logbook.jpg", "richmenu-staff.jpg"):
        shutil.copy(os.path.join(REPO, "line-oa", name), os.path.join(FIGS, name))


def render_exports() -> None:
    for tag in ("fellow", "staff"):
        path = os.path.join(EXPORTS, f"{tag}-export.pdf")
        if not os.path.exists(path):
            print(f"  (no {tag} export yet — skipping)")
            continue
        doc = pdfium.PdfDocument(path)
        for i in (0, 1):
            doc[i].render(scale=1.5).to_pil().save(os.path.join(FIGS, f"export-{tag}-p{i + 1}.png"))


def optimize() -> None:
    total = 0
    for path in sorted(glob.glob(os.path.join(FIGS, "*"))):
        name = os.path.basename(path)
        cap = next((v for k, v in WIDTH_CAPS.items() if name.startswith(k)), DEFAULT_CAP)
        im = Image.open(path).convert("RGB")
        if im.width > cap:
            im = im.resize((cap, round(im.height * cap / im.width)), Image.LANCZOS)
        out = os.path.splitext(path)[0] + ".jpg"
        im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
        if out != path:
            os.remove(path)
        total += os.path.getsize(out)
    count = len(glob.glob(os.path.join(FIGS, "*")))
    print(f"figures → {count} files, {total / 1e6:.1f} MB")


os.makedirs(FIGS, exist_ok=True)
copy_fonts()
copy_rich_menus()
render_exports()
optimize()
