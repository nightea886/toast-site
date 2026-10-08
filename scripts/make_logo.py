# 抠图脚本：把 assets/img/logo-src.jpg 的白色背景去掉（边缘泛洪填充，
# 只删与边缘连通的白底，保留猫身白色毛发），输出透明 PNG 到 assets/img/logo.png
# 用法：把 logo 原图保存为 assets/img/logo-src.jpg 后运行  python scripts/make_logo.py
import os
from collections import deque
from PIL import Image

BASE = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(BASE, 'assets', 'img', 'logo-src.jpg')
DST = os.path.join(BASE, 'assets', 'img', 'logo.png')

im = Image.open(SRC).convert('RGB')
w, h = im.size
px = im.load()
TOL = 235  # 近白阈值


def is_bg(p):
    return p[0] >= TOL and p[1] >= TOL and p[2] >= TOL


visited = bytearray(w * h)
dq = deque()
for x in range(w):
    for y in (0, h - 1):
        if not visited[y * w + x] and is_bg(px[x, y]):
            visited[y * w + x] = 1
            dq.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if not visited[y * w + x] and is_bg(px[x, y]):
            visited[y * w + x] = 1
            dq.append((x, y))
while dq:
    x, y = dq.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and is_bg(px[nx, ny]):
            visited[ny * w + nx] = 1
            dq.append((nx, ny))

out = Image.new('RGBA', (w, h))
op = out.load()
for y in range(h):
    for x in range(w):
        if visited[y * w + x]:
            op[x, y] = (0, 0, 0, 0)
            continue
        r, g, b = px[x, y]
        a = 255
        # 与背景相邻的近白像素做半透明过渡，去掉 JPG 白边光晕
        if r >= 200 and g >= 200 and b >= 200:
            nb = any(
                visited[ny * w + nx]
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                if 0 <= nx < w and 0 <= ny < h
            )
            if nb:
                a = max(0, min(255, int(255 * (255 - max(r, g, b)) / 55)))
        op[x, y] = (r, g, b, a)

out.save(DST)
clear = sum(visited)
print('ok:', DST, 'size=%dx%d' % (w, h), 'background=%.1f%%' % (clear / (w * h) * 100))
