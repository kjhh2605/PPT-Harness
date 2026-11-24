"""OKLCH 기반 faded 색 세트 생성기.
원칙: 세트 안에서 명도 L·채도 C는 고정, 색상 H만 바뀐다. 발표마다 H를 요청하면 같은 L/C로 스냅한다.
표준 라이브러리만 사용. 실행: python3 -I design/scripts/faded.py
"""
import json, math, sys

def oklch_to_srgb(L, C, h):
    a = C * math.cos(math.radians(h)); b = C * math.sin(math.radians(h))
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb= -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return r, g, bb

def gamma(c):
    return 12.92*c if c <= 0.0031308 else 1.055*c**(1/2.4) - 0.055

def to_hex(L, C, h):
    """감마 밖이면 채도를 줄여 스냅."""
    c = C
    while c >= 0:
        r, g, b = oklch_to_srgb(L, c, h)
        if all(-1e-6 <= v <= 1+1e-6 for v in (r, g, b)):
            return '#%02X%02X%02X' % tuple(round(gamma(max(0, min(1, v)))*255) for v in (r, g, b)), c
        c -= 0.002
    return '#000000', 0

def lum(hexs):
    h = hexs.lstrip('#'); r, g, b = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    f = lambda c: c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

def contrast(a, b):
    la, lb = lum(a), lum(b); hi, lo = max(la, lb), min(la, lb); return (hi+.05)/(lo+.05)

# 기준 배경(무채색 베이스는 추후 확정, 여기서는 대비 계산용 대표값)
BG_LIGHT, BG_DARK = '#ECE9E3', '#1E1D1B'

# 4색 역할별 색상각(H). brown/taupe는 본래 따뜻한 저채도이므로 C 배율을 둔다.
ROLES = ['red', 'blue', 'brown', 'taupe']
SETS = [
  dict(id='dusty',   name='Dusty',      ko='먼지 앉은',  L=.56, C=.070, H=dict(red=25,  blue=255, brown=62, taupe=75), Cmul=dict(brown=.85, taupe=.40)),
  dict(id='ink',     name='Faded Ink',  ko='바랜 잉크',  L=.47, C=.070, H=dict(red=25,  blue=258, brown=60, taupe=72), Cmul=dict(brown=.85, taupe=.40)),
  dict(id='chalk',   name='Chalk',      ko='분필',       L=.66, C=.060, H=dict(red=25,  blue=252, brown=65, taupe=78), Cmul=dict(brown=.85, taupe=.45)),
  dict(id='washed',  name='Washed',     ko='물 빠진',    L=.58, C=.045, H=dict(red=28,  blue=250, brown=63, taupe=76), Cmul=dict(brown=.90, taupe=.50)),
  dict(id='clay',    name='Clay',       ko='점토',       L=.54, C=.078, H=dict(red=38,  blue=240, brown=68, taupe=85), Cmul=dict(brown=.80, taupe=.38)),
  dict(id='berry',   name='Berry Slate',ko='베리와 슬레이트', L=.52, C=.062, H=dict(red=12, blue=270, brown=55, taupe=70), Cmul=dict(brown=.85, taupe=.42)),
]
DARK_LIFT = 0.16   # 다크 배경용: 같은 C, L만 올림

def build():
    out = []
    for s in SETS:
        colors = {}
        for r in ROLES:
            C = s['C'] * s.get('Cmul', {}).get(r, 1.0)
            lh, lc = to_hex(s['L'], C, s['H'][r])
            dh, dc = to_hex(min(.92, s['L']+DARK_LIFT), C, s['H'][r])
            colors[r] = dict(h=s['H'][r], C=round(C, 3),
                             light=dict(hex=lh, L=s['L'], C=round(lc, 3), cr_bg=round(contrast(lh, BG_LIGHT), 2)),
                             dark=dict(hex=dh, L=round(s['L']+DARK_LIFT, 2), C=round(dc, 3), cr_bg=round(contrast(dh, BG_DARK), 2)))
        out.append(dict(id=s['id'], name=s['name'], ko=s['ko'], L=s['L'], C=s['C'], colors=colors))
    return out

if __name__ == '__main__':
    sets = build()
    print(f"{'set':8}{'L':>5}{'C':>6} | " + ' | '.join(f"{r:>18}" for r in ROLES))
    for s in sets:
        row = ' | '.join(f"{s['colors'][r]['light']['hex']} {s['colors'][r]['light']['cr_bg']:>4} /{s['colors'][r]['dark']['cr_bg']:>4}" for r in ROLES)
        print(f"{s['id']:8}{s['L']:>5}{s['C']:>6} | {row}")
