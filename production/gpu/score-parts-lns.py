# Letters Never Sent (Piano): its sheet music came from the first trial (djandyk-landing/piano-reference/sheet-music:
# engrave.py + arrange.py), not the batch score-parts.py reads. Run in a COPY of that folder's engrave.py, arrange.py,
# beats_800.npy, lns_piano.json, melody.json, review.json, sections.json (and arr_rh.ily / arr_lh.ily in orig/ to check
# against), with numpy: it rebuilds the arrangement, checks the staves come out identical, and writes notes.json with
# every note's time in the recording. score-parts.js and assets/piano-parts/human-stories__letters-never-sent-piano
# .score.json were written from it (nudged −0.015 s by the best onset match).
import json, sys, numpy as np
import types
sf = types.ModuleType('soundfile'); sf.read = lambda *a, **k: (np.full((44100 * 400, 2), 1e-3), 44100); sys.modules['soundfile'] = sf   # dynamics only: the notes do not use it
ns = {'__name__': 'arr'}
sys.argv = ['arrange.py']
exec(open('arrange.py').read(), ns)
same = open('arr_rh.ily').read() == open('orig/arr_rh.ily').read() and open('arr_lh.ily').read() == open('orig/arr_lh.ily').read()
BT = ns['BT']; idx = np.arange(len(BT)); ih, it = BT[1] - BT[0], BT[-1] - BT[-2]
def sec(b):
    if b < 0: return BT[0] + b * ih
    if b > len(BT) - 1: return BT[-1] + (b - len(BT) + 1) * it
    return float(np.interp(b, idx, BT))
notes = []
for vel, voice in ((0.78, ns['V1']), (0.55, ns['V2']), (0.6, ns['LH'])):
    for e in voice:
        L = e.get('L', e.get('qoff', 0) - e['q']); t0, t1 = sec(e['q'] / 4), sec((e['q'] + L) / 4)
        ps = e['ps'] if 'ps' in e else [(e['p'], e.get('col'))]
        for p in ps:
            p = p[0] if isinstance(p, (list, tuple)) else p
            notes.append(dict(t=round(max(0, t0), 4), d=round(max(0.05, t1 - max(0, t0)), 4), m=int(p), v=vel))
notes.sort(key=lambda n: (n['t'], n['m']))
json.dump(notes, open('notes.json', 'w'))
print('score reproduced exactly' if same else 'SCORE DIFFERS', len(notes), 'notes', 'V1/V2/LH', len(ns['V1']), len(ns['V2']), len(ns['LH']))
