from PIL import Image, ImageFilter, ImageOps, ImageEnhance, ImageChops
import os, glob

def cartoonize(in_path: str, out_path: str):
    img = Image.open(in_path).convert('RGB')
    # Normalize size to a wide banner (keep aspect but crop center)
    target_w, target_h = 1792, 1024
    # Resize to cover
    w, h = img.size
    scale = max(target_w / w, target_h / h)
    nw, nh = int(w * scale + 0.5), int(h * scale + 0.5)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    # Center crop
    left = (nw - target_w) // 2
    top = (nh - target_h) // 2
    img = img.crop((left, top, left + target_w, top + target_h))

    # Smooth colors
    base = img.filter(ImageFilter.MedianFilter(size=5)).filter(ImageFilter.SMOOTH_MORE)

    # Boost saturation/contrast slightly for anime vibe
    base = ImageEnhance.Color(base).enhance(1.35)
    base = ImageEnhance.Contrast(base).enhance(1.10)
    base = ImageEnhance.Brightness(base).enhance(1.02)

    # Posterize to reduce palette
    poster = ImageOps.posterize(base, bits=4)

    # Edges
    gray = poster.convert('L')
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edges = ImageOps.invert(edges)
    # Increase edge strength and binarize
    edges = ImageEnhance.Contrast(edges).enhance(2.2)
    edges = edges.point(lambda p: 255 if p > 170 else 0)
    # Make edges slightly thicker
    edges = edges.filter(ImageFilter.MaxFilter(size=3))

    # Composite: multiply poster with edge mask
    edges_rgb = Image.merge('RGB', (edges, edges, edges))
    out = ImageChops.multiply(poster, edges_rgb)

    # Final polish
    out = ImageEnhance.Sharpness(out).enhance(1.35)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out.save(out_path, format='JPEG', quality=88, optimize=True, progressive=True)

if __name__ == '__main__':
    roots = [
        '/mnt/data/danang-v32/v23/server/public/brand',
        '/mnt/data/danang-v32/v23/webapp/public/brand'
    ]
    for root in roots:
        for p in sorted(glob.glob(os.path.join(root, 'afisha-*.jpg'))):
            orig = p.replace('.jpg', '.orig.jpg')
            if not os.path.exists(orig):
                try:
                    os.rename(p, orig)
                except OSError:
                    pass
            src = orig if os.path.exists(orig) else p
            cartoonize(src, p)
            print('cartoonized', p)
