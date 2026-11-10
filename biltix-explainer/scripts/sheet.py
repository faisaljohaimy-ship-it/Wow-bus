"""Tile review stills into a contact sheet: python3 -I scripts/sheet.py out.png in1.png in2.png ... (4 columns)."""
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
cols, w, h, gap = 4, 640, 360, 8
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * gap, rows * h + (rows + 1) * gap), (200, 210, 224))
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x, y = gap + (i % cols) * (w + gap), gap + (i // cols) * (h + gap)
    sheet.paste(im, (x, y))
    draw.text((x + 8, y + h - 18), f.rsplit('/', 1)[-1], fill=(19, 34, 56))
sheet.save(out)
