"""Compress and resize PNG images in public/ and dist/ directories."""
from pathlib import Path
from PIL import Image

BASE = Path(__file__).parent.parent

# (path, target_size) — target_size None means no resize, just recompress
# favicon: 64x64 for browser tab icon
# icon: 180x180 for Apple touch icon
# og-cover: 1200x630 is standard OG image size (currently 1536x1024, slight crop)
targets = [
    (BASE / "public" / "favicon.png",        (64, 64)),
    (BASE / "public" / "icon.png",           (180, 180)),
    (BASE / "public" / "images" / "og-cover.png", (1200, 630)),
    (BASE / "dist" / "favicon.png",          (64, 64)),
    (BASE / "dist" / "icon.png",             (180, 180)),
    (BASE / "dist" / "images" / "og-cover.png", (1200, 630)),
]

def center_crop_and_resize(img: Image.Image, target: tuple[int, int]) -> Image.Image:
    """Crop to target aspect ratio from center, then resize."""
    tw, th = target
    iw, ih = img.size
    target_ratio = tw / th
    current_ratio = iw / ih
    if current_ratio > target_ratio:
        # Too wide — crop sides
        new_w = int(ih * target_ratio)
        left = (iw - new_w) // 2
        img = img.crop((left, 0, left + new_w, ih))
    elif current_ratio < target_ratio:
        # Too tall — crop top/bottom
        new_h = int(iw / target_ratio)
        top = (ih - new_h) // 2
        img = img.crop((0, top, iw, top + new_h))
    return img.resize(target, Image.LANCZOS)

def process(path: Path, target_size: tuple[int, int] | None):
    if not path.exists():
        print(f"  SKIP (not found): {path.relative_to(BASE)}")
        return
    original_kb = path.stat().st_size / 1024
    img = Image.open(path).convert("RGBA" if path.suffix == ".png" else "RGB")
    original_dim = img.size
    if target_size and img.size != target_size:
        img = center_crop_and_resize(img, target_size)
    # Convert RGBA to RGB for smaller PNG (drop unnecessary alpha if fully opaque)
    if img.mode == "RGBA":
        # Check if alpha channel is actually used
        extrema = img.getextrema()
        alpha_min = extrema[3][0] if len(extrema) > 3 else 255
        if alpha_min == 255:
            img = img.convert("RGB")
    img.save(path, "PNG", optimize=True, compress_level=9)
    new_kb = path.stat().st_size / 1024
    rel = path.relative_to(BASE)
    print(f"  {rel}: {original_dim} {original_kb:.1f} KB -> {img.size} {new_kb:.1f} KB  (saved {original_kb - new_kb:.1f} KB)")

print("=== Compressing & resizing images ===")
for path, size in targets:
    process(path, size)
print("Done.")
