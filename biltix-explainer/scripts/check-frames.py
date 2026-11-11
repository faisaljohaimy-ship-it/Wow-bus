#!/usr/bin/env python3
"""Frame check for rendered explainer files: single-frame drop-outs and the Demo-data chip.

    python3 scripts/check-frames.py                    # both 1080p masters and both 720p web files
    python3 scripts/check-frames.py path/to/file.mp4 [ar|en]

Needs python3 + numpy and ffmpeg/ffprobe on PATH (or FFMPEG / FFPROBE set). Exit 1 on any finding.

Every frame is scaled to 480 x 270 grey and compared with its neighbours, three ways:
  A. whole frame: the frame differs from the mean of its neighbours by more than 1.3x the neighbours'
     own difference, with > 0.15 % of pixels off by > 25 grey levels in the same direction from both;
  B. three horizontal bands: the band's edge energy is below 0.55x both neighbours' (one-frame hole);
  C. an 8 x 6 tile grid: a tile loses (< 0.5x) or gains (> 2x) edge energy while its neighbours agree
     (within 1.6x), or its pixels jump away from both neighbours. A tile flag is dismissed only when
     the frame lies between its neighbours (|this - mean(prev, next)| <= |prev - next|: a dissolve or
     an edge sliding across the tile boundary) or, for a pixel jump, when the tile keeps its edge energy
     and the neighbours also differ from each other (content that changes on every frame, like the
     rolling record counter). Dismissed flags are listed, so nothing is hidden.
Chip: the inside of the Demo-data pill (screen-fixed, top bar, inline-end) is compared with its median over
the file; a frame whose crop differs by > 8 grey levels on average, is not mostly white, or has no label
ink is reported.
The scene list and the 15-frame entrances are read from src/storyboard.ts so a finding can be placed.
"""
import os, re, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FFMPEG, FFPROBE = os.environ.get('FFMPEG', 'ffmpeg'), os.environ.get('FFPROBE', 'ffprobe')
W, H, GX, GY = 480, 270, 8, 6
TW, TH = W // GX, H // GY

sb = open(os.path.join(ROOT, 'src/storyboard.ts'), encoding='utf-8').read()
SCENES = [(m.group(1), int(m.group(2))) for m in re.finditer(r"\{ id: '(\w+)', frames: (\d+)", sb)]
TRANSITION = int(re.search(r'export const TRANSITION = (\d+)', sb).group(1))


def where(i):
    f0 = 0
    for sid, n in SCENES:
        if f0 <= i < f0 + n:
            return f'{sid} f{i - f0}' + (' (entrance)' if f0 and i - f0 < TRANSITION else '')
        f0 += n
    return '?'


def decode(path, vf, w, h):
    p = subprocess.Popen([FFMPEG, '-v', 'error', '-i', path, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], stdout=subprocess.PIPE)
    out = []
    while True:
        b = p.stdout.read(w * h)
        if len(b) < w * h:
            break
        out.append(np.frombuffer(b, np.uint8).astype(np.float32).reshape(h, w))
    p.wait()
    return np.stack(out)


def energy(a):
    return np.abs(np.diff(a, axis=-1)).mean(axis=(-2, -1)) + np.abs(np.diff(a, axis=-2)).mean(axis=(-2, -1))


def check(path, lang):
    F = decode(path, f'scale={W}:{H}', W, H)
    n = len(F)
    found, dismissed = {}, []
    # A: whole frame
    for i in range(1, n - 1):
        e = np.abs(F[i] - (F[i - 1] + F[i + 1]) / 2).mean(); c = np.abs(F[i - 1] - F[i + 1]).mean()
        d1, d2 = F[i] - F[i - 1], F[i] - F[i + 1]
        frac = ((np.abs(d1) > 25) & (np.abs(d2) > 25) & (np.sign(d1) == np.sign(d2))).mean()
        if frac > 0.0015 and e > 1.3 * c:
            found.setdefault(i, []).append(f'whole frame e={e:.2f} vs {c:.2f}')
    # B: bands
    bands = [(35, 110), (110, 185), (185, 230)]
    EB = np.stack([energy(F[:, a:b]) for a, b in bands], axis=1)
    for i in range(1, n - 1):
        for k in range(len(bands)):
            lo = min(EB[i - 1, k], EB[i + 1, k])
            if lo > 0.6 and EB[i, k] < 0.55 * lo:
                found.setdefault(i, []).append(f'band {k} energy {EB[i, k]:.2f} vs {EB[i - 1, k]:.2f}/{EB[i + 1, k]:.2f}')
    # C: tiles
    T = F.reshape(n, GY, TH, GX, TW).transpose(0, 1, 3, 2, 4)  # n, gy, gx, th, tw
    ET = energy(T)
    for i in range(1, n - 1):
        a, b, c = ET[i - 1], ET[i], ET[i + 1]
        lo, hi = np.minimum(a, c), np.maximum(a, c)
        agree = hi <= 1.6 * np.maximum(lo, 1e-6)
        P, A, N = T[i], T[i - 1], T[i + 1]
        dev = np.abs(P - (A + N) / 2).mean(axis=(-2, -1)); nd = np.abs(A - N).mean(axis=(-2, -1))
        same = (np.abs(P - A) > 25) & (np.abs(P - N) > 25) & (np.sign(P - A) == np.sign(P - N))
        frac = same.mean(axis=(-2, -1))
        for r in range(GY):
            for cc in range(GX):
                kind = []
                if agree[r, cc] and lo[r, cc] > 0.8 and b[r, cc] < 0.5 * lo[r, cc]: kind.append('vanish')
                if agree[r, cc] and hi[r, cc] > 0.8 and b[r, cc] > 2.0 * hi[r, cc]: kind.append('pop')
                if frac[r, cc] > 0.02 and dev[r, cc] > 2.0 * nd[r, cc] + 1.0: kind.append('pixel')
                if not kind:
                    continue
                txt = f'tile r{r}c{cc} {"/".join(kind)}: energy {a[r, cc]:.2f}/{b[r, cc]:.2f}/{c[r, cc]:.2f}, dev {dev[r, cc]:.2f} vs neighbours {nd[r, cc]:.2f}'
                if ('vanish' in kind or 'pop' in kind) and dev[r, cc] <= nd[r, cc]:
                    dismissed.append((i, txt + ' -> between its neighbours (transition)'))
                elif kind == ['pixel'] and 0.8 * lo[r, cc] <= b[r, cc] <= 1.25 * hi[r, cc] and nd[r, cc] > 2:
                    dismissed.append((i, txt + ' -> energy kept, neighbours differ too (changes every frame)'))
                else:
                    found.setdefault(i, []).append(txt)
    # chip
    pr = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip()
    s = int(pr) / 1920
    x0, x1 = (1668, 1816) if lang == 'en' else (103, 271)
    ev = lambda v: int(v * s) // 2 * 2
    X0, X1, Y0, Y1 = ev(x0), ev(x1), ev(52), ev(82)
    C = decode(path, f'crop={X1 - X0}:{Y1 - Y0}:{X0}:{Y0}', X1 - X0, Y1 - Y0).reshape(n, -1)
    ref = np.median(C, axis=0)
    cd = np.abs(C - ref).mean(axis=1); white = (C > 235).mean(axis=1); ink = (C < 120).mean(axis=1)
    nochip = [i for i in range(n) if cd[i] > 8 or white[i] < 0.5 or ink[i] < 0.03]

    name = os.path.basename(path)
    print(f'{name} [{lang}]: {n} frames')
    for i in sorted(found):
        print(f'  DROP-OUT frame {i} ({where(i)}): ' + '; '.join(found[i]))
    for i, t in dismissed:
        print(f'  dismissed frame {i} ({where(i)}): {t}')
    print(f'  single-frame drop-outs: {len(found)}' + (f' {sorted(found)}' if found else '') + f' · tile flags dismissed: {len(dismissed)}')
    print(f'  Demo-data chip: max diff {cd.max():.2f}, white >= {white.min():.2f}, ink >= {ink.min():.3f}; frames without it: {len(nochip)}' + (f' {nochip[:20]}' if nochip else ''))
    return not found and not nochip


if __name__ == '__main__':
    if len(sys.argv) > 1:
        path = sys.argv[1]
        lang = sys.argv[2] if len(sys.argv) > 2 else ('ar' if '-ar' in os.path.basename(path) else 'en')
        files = [(path, lang)]
    else:
        files = []
        for lang in ('ar', 'en'):
            files.append((os.path.join(ROOT, f'out/biltix-explainer-{lang}-1080p.mp4'), lang))
            files.append((os.path.join(ROOT, f'../biltix-hse/assets/video/explainer-{lang}-720p.mp4'), lang))
    ok = all([check(p, l) for p, l in files])
    print('frame check: ' + ('OK' if ok else 'FAILED'))
    sys.exit(0 if ok else 1)
