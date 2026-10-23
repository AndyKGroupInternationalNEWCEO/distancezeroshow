# The grand's parts from the piano sheet music on its desk. Rebuilds each song's solo piano arrangement exactly as the
# sheet-music batch did (djandyk-landing/piano-reference/sheet-music/batch, WORK=work2 ARR=chords; it checks that
# rh.ily and lh.ily come out identical), keeps the beat grid the score was written on and its three voices (melody,
# chord tones, left hand), and writes every note with its time in the recording (score -> seconds through that grid).
# Run in a COPY of the batch (sheet.py, stages.py, chordarr.py, tracks.json and the songs' work2/ folders: it rewrites
# them), with numpy: python score-parts.py -> score-notes.json; the stage's files (assets/piano-parts/*.score.json,
# virtual-studio/vienna/score-parts.js) were written from that, each nudged by its best onset match (|offset| <= 0.03 s), the first bar's chords clipped to start at 0 s.
import json, os, sys, types
os.environ.update(WORK='work2', ARR='chords')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, chordarr
CAP = {}
_arr = chordarr.arrange
def arrange(*a, **k):
    r = _arr(*a, **k); CAP['V'] = r[:3]; return r
chordarr.arrange = arrange
src = open('sheet.py').read()
assert src.count('    BT = BT[b0:]\n') == 1
src = src.replace('    BT = BT[b0:]\n', '    BT = BT[b0:]\n    _CAP["BT"] = BT.copy(); _CAP["tempo"] = A["tempo"]\n')
mod = types.ModuleType('sheet'); mod.__dict__['_CAP'] = CAP; mod.__file__ = os.path.abspath('sheet.py')
exec(compile(src, 'sheet.py', 'exec'), mod.__dict__)
tracks = {f"{t['album']}--{t['slug']}": t for t in json.load(open('tracks.json'))}
out = {}
for d in sorted(os.listdir('work2')):
    t = tracks[d]; before = open(f'work2/{d}/rh.ily').read() + open(f'work2/{d}/lh.ily').read()
    CAP.clear(); mod.build(t)
    after = open(f'work2/{d}/rh.ily').read() + open(f'work2/{d}/lh.ily').read()
    BT = CAP['BT']; idx = np.arange(len(BT)); ih, it = BT[1] - BT[0], BT[-1] - BT[-2]
    def sec(beat):
        if beat < 0: return BT[0] + beat * ih
        if beat > len(BT) - 1: return BT[-1] + (beat - len(BT) + 1) * it
        return float(np.interp(beat, idx, BT))
    V1, V2, LH = CAP['V']; notes = []
    for vel, voice in ((0.78, V1), (0.55, V2), (0.6, LH)):
        for e in voice:
            t0, t1 = sec(e['q'] / 4), sec((e['q'] + e['L']) / 4)
            for p, col in e['ps']: notes.append(dict(t=round(t0, 4), d=round(max(0.05, t1 - t0), 4), m=int(p), v=vel))
    notes.sort(key=lambda n: (n['t'], n['m']))
    out[d] = dict(same_score=before == after, notes=notes, bars=len(BT) // 4)
    print(d, 'score reproduced exactly' if before == after else 'SCORE DIFFERS', len(notes), 'notes')
json.dump(out, open('score-notes.json', 'w'))
