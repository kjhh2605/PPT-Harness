"""색상(H) 하나 → 역할별 단계(ink/hero/support/tint) + 무채색 베이스 생성기.
실행: python3 -I design/scripts/ladder.py  → design/palettes/indigo-sets.json
"""
import json, sys
sys.path.insert(0, 'design/scripts')
from faded import to_hex, contrast

def neutrals(h, c, mode):
    """무채색 베이스. h: 기운 색상각, c: 아주 낮은 채도."""
    if mode == 'light':
        L = dict(bg=.935, surface=.965, text=.26, muted=.50, border=.85)
    else:
        L = dict(bg=.20, surface=.25, text=.92, muted=.70, border=.33)
    return {k: to_hex(v, c, h)[0] for k, v in L.items()}

def ladder(h, heroC, mode):
    if mode == 'light':
        steps = dict(ink=(.36, .09), hero=(.50, heroC), support=(.62, .05), tint=(.91, .03))
    else:
        steps = dict(ink=(.86, .07), hero=(.70, heroC), support=(.56, .05), tint=(.29, .04))
    return {k: to_hex(L, C, h)[0] for k, (L, C) in steps.items()}

SETS = [
  dict(id='indigo-paper',  name='Indigo on Paper',   ko='종이 위 인디고',  hue=278, heroC=.12, base=(80, .010),  mood='따뜻한 아이보리 종이에 정통 인디고. 가장 클래식.'),
  dict(id='indigo-slate',  name='Indigo on Slate',   ko='석판 위 인디고',  hue=270, heroC=.11, base=(270,.008),  mood='푸른 기운 회색 베이스. 전체가 한 색조로 묶여 차분함.'),
  dict(id='indigo-deep',   name='Deep Indigo Ink',   ko='짙은 인디고 잉크', hue=283, heroC=.14, base=(60, .006),  mood='hero를 조금 더 진하게. 강조가 가장 분명함.'),
  dict(id='indigo-dusty',  name='Dusty Indigo',      ko='먼지 앉은 인디고', hue=285, heroC=.09, base=(75, .012),  mood='가장 바랜 톤. 강조는 명도 차이로만.'),
  dict(id='indigo-violet', name='Violet Indigo',     ko='보랏빛 인디고',   hue=296, heroC=.11, base=(40, .008),  mood='보라 쪽으로 기운 인디고. 장밋빛 회색 베이스와 어울림.'),
  dict(id='indigo-ocean',  name='Ocean Indigo',      ko='바다 인디고',     hue=262, heroC=.12, base=(250,.010),  mood='파랑 쪽으로 기운 인디고. 서늘하고 기술적인 인상.'),
]
WARM = dict(brown=(62, .06), taupe=(75, .03))   # 따뜻한 중립 2색, 전 세트 공통

def build():
    out = []
    for s in SETS:
        d = dict(id=s['id'], name=s['name'], ko=s['ko'], hue=s['hue'], heroC=s['heroC'], mood=s['mood'])
        for mode in ('light', 'dark'):
            base = neutrals(*s['base'], mode)
            lad = ladder(s['hue'], s['heroC'], mode)
            warm = {k: to_hex(.52 if mode=='light' else .68, c, h)[0] for k, (h, c) in WARM.items()}
            d[mode] = dict(**base, **lad, **warm,
                           cr=dict(text=round(contrast(base['text'], base['bg']),2),
                                   ink=round(contrast(lad['ink'], base['bg']),2),
                                   hero=round(contrast(lad['hero'], base['bg']),2),
                                   support=round(contrast(lad['support'], base['bg']),2)))
        out.append(d)
    return out

if __name__ == '__main__':
    sets = build()
    json.dump(dict(note='인디고 hero 후보. 단계: ink/hero/support/tint. 무채 베이스 + 따뜻한 중립(brown/taupe) 포함.', sets=sets),
              open('design/palettes/indigo-sets.json','w'), ensure_ascii=False, indent=1)
    for s in sets:
        for m in ('light','dark'):
            c=s[m]; print(f"{s['id']:14}{m:6} bg {c['bg']} text {c['text']} ink {c['ink']} hero {c['hero']} sup {c['support']} tint {c['tint']} | cr text {c['cr']['text']} ink {c['cr']['ink']} hero {c['cr']['hero']} sup {c['cr']['support']}")
