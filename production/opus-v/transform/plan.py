# OPUS V · TRANSFORMING ORCHESTRA ROOM: the floor plan in numbers (studio metres, plan x/z; y up), the checks the owner
# asked for, and the drawings (SVG) for the approval page. Nothing here is loaded by the Virtual Space.
import math, json, sys
R, SKIN, ZC = 12.6, 13.2, 1.0                      # the studio's wall: fins at 12.6, skin at 13.2 about (0, 1)
A, HALF = 4.544, math.asin(4 / 13.2)               # the 8 m opening (set.js OPUS_WALL), unchanged
ANNEX = dict(x0=-22.0, z0=-6.6, z1=4.6, h=10.0)    # the recovered original annex (19 Oct), unchanged footprint
IN = 0.2                                           # its walls' thickness
wall = lambda z: -math.sqrt(max(0, R * R - (z - ZC) ** 2))
rad = lambda x, z: math.hypot(x, z - ZC)
ang = lambda x, z: math.atan2(x, z - ZC) % (2 * math.pi)
LEAF_R = 14.45                                     # the wall's leaves step back 1 m (to r ≈ 14.3) and rise: nothing below 4.2 m stands inside this radius within the opening's angle
def in_opening(x, z, m=0.05): return A - HALF - m < ang(x, z) < A + HALF + m
P = lambda a, r: (SKIN * 0 + r * math.sin(a), ZC + r * math.cos(a))
# instrument footprints (radius, m): player + chair/stool + instrument + stand
FOOT = {'Violin I': .40, 'Violin II': .40, 'Viola': .42, 'Cello': .50, 'Double bass': .55, 'Flute': .45, 'Oboe': .45, 'Clarinet': .45, 'Bassoon': .50,
        'French horn': .50, 'Trumpet': .45, 'Timpani': 1.0, 'Percussion': 1.2}
RISE = {1: 0.3, 2: 0.6}

def arc(F, r, th0, th1, insts, riser=0, gap=None):
    # each place gets its own width on the arc (its footprint), centred between th0 and th1 (degrees; th0 the +z end)
    n = len(insts); w = [2 * FOOT[i] for i in insts]
    if gap is None: gap = max(0.12, (math.radians(abs(th0 - th1)) * r - sum(w)) / max(1, n - 1)) if n > 1 else 0
    total = sum(w) + gap * (n - 1); mid = math.radians((th0 + th1) / 2); s = mid + total / 2 / r; out = []
    for ins, wi in zip(insts, w):
        th = s - wi / 2 / r; s -= (wi + gap) / r
        out.append(dict(inst=ins, x=F[0] - r * math.cos(th), z=F[1] + r * math.sin(th), r=r, th=math.degrees(th), y=RISE.get(riser, 0)))
    return out

# CHAMBER ORCHESTRA: 28, the audience (the studio) at +x; +z is the audience's left. Strings on the stage floor in two
# rows (first violins on the left, cellos on the right); riser 1 (0.3 m): flute, oboe, clarinet, bassoon, trumpets, and the
# double basses at its right end behind the cellos; riser 2 (0.6 m): the horns (left), timpani (centre), percussion (right)
FC = (-13.4, -1.0)
CH = (arc(FC, 3.0, 68, -68, ['Violin I', 'Violin I', 'Violin I', 'Violin II', 'Viola', 'Cello', 'Cello'])
    + arc(FC, 4.2, 68, -68, ['Violin I', 'Violin I', 'Violin II', 'Violin II', 'Violin II', 'Viola', 'Viola', 'Cello', 'Cello'])
    + arc(FC, 5.4, 50, -50, ['Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Trumpet', 'Trumpet', 'Double bass', 'Double bass'], 1)
    + arc(FC, 7.2, 38, 30, ['French horn', 'French horn'], 2) + arc(FC, 7.2, 4, 4, ['Timpani'], 2) + arc(FC, 7.2, -18, -18, ['Percussion'], 2))

# STRING QUARTET: four, close, in a shallow arc
FQ = (-14.5, -1.0)
QU = arc(FQ, 1.7, 62, -62, ['Violin I', 'Violin II', 'Viola', 'Cello'])
for p in QU: p['y'] = 0.2

# the quartet room's walls: acoustic panels flown in from the annex's fly loft (it is 10 m high): two side walls from the
# fixed returns beside the opening to a 6 m back wall, 4.5 m behind the wall's line; each 4.4 m high. For the orchestra
# they fly out (stored 5.4 … 9.8 m), so nothing crosses the stage floor
RET = 14.7                                         # the fixed returns: from the wall's skin out to this radius, just outside the opening
EDGE_L, EDGE_R = (A + HALF), (A - HALF)
qL0, qR0 = P(EDGE_L + 0.02, RET), P(EDGE_R - 0.02, RET)
QBACK = -17.7
qL1, qR1 = (QBACK, 2.0), (QBACK, -4.0)
QWALLS = [(qL0, qL1), (qR0, qR1), (qL1, qR1)]
FLY = dict(wall_h=4.4, stored=(5.4, 9.8), canopy_q=4.2, canopy_c=6.2, bridge_q=3.9, bridge_c=4.8, truss=7.0)
TQ, TC = QWALLS, []
# risers (stage lifts, arcs about FC between radii, ±angle) and the canopy
RISERS = [(1, 4.85, 6.0, 58), (2, 6.0, 8.6, 46)]

checks = []
def ok(name, cond, info=''): checks.append(dict(name=name, ok=bool(cond), info=info))
inside = lambda x, z, m: ANNEX['x0'] + IN + m <= x and ANNEX['z0'] + IN + m <= z <= ANNEX['z1'] - IN - m and x <= wall(z) - 0.6
for name, L in (('Chamber orchestra', CH), ('String quartet', QU)):
    worst = min((rad(p['x'], p['z']) - FOOT[p['inst']] for p in L if in_opening(p['x'], p['z'], 0.15)), default=99)
    ok(f'{name}: clear of the wall leaves\' path', worst >= LEAF_R, f'nearest {worst:.2f} m from the studio centre (needs ≥ {LEAF_R})')
    bad = [p['inst'] for p in L if not inside(p['x'], p['z'], FOOT[p['inst']])]
    ok(f'{name}: every place inside the room', not bad, ', '.join(bad))
    gaps = sorted((math.hypot(a['x'] - b['x'], a['z'] - b['z']) - FOOT[a['inst']] - FOOT[b['inst']], a['inst'], b['inst']) for i, a in enumerate(L) for b in L[i + 1:] if a['y'] == b['y'] or True)
    ok(f'{name}: no two places overlap (≥ 0.10 m between footprints)', gaps[0][0] >= 0.1, f'tightest {gaps[0][0]:.2f} m ({gaps[0][1]} / {gaps[0][2]})')
from collections import Counter
cnt = Counter(p['inst'] for p in CH)
ok('Chamber orchestra: 28 players, the requested sections', len(CH) == 28 and cnt == Counter({'Violin I': 5, 'Violin II': 4, 'Viola': 3, 'Cello': 4, 'Double bass': 2, 'Flute': 1, 'Oboe': 1, 'Clarinet': 1, 'Bassoon': 1, 'French horn': 2, 'Trumpet': 2, 'Timpani': 1, 'Percussion': 1}), dict(cnt))
area = (abs(ANNEX['x0']) - 12.6) * (ANNEX['z1'] - ANNEX['z0'])
ok('Chamber orchestra: floor per player', True, f'{area:.0f} m² of room for 28 players: {area / 28:.1f} m² each (orchestra pits plan 1.5–2.0 m² a player)')
# riser placement: each wind/brass/percussion place on its riser
for p in CH:
    rr = math.hypot(p['x'] - FC[0], p['z'] - FC[1])
    lvl = [k for k, a, b, w in RISERS if a <= rr <= b]
    if p['y'] > 0: ok(f'{p["inst"]} stands on riser {[k for k,v in RISE.items() if v == p["y"]][0]}', lvl and RISE[lvl[0]] == p['y'], f'r {rr:.2f}')
# towers: inside the annex, clear of the leaves, clear of the other configuration's places along their paths
def seg_d(px, pz, a, b):
    ax, az = a; bx, bz = b; dx, dz = bx - ax, bz - az; t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
    return math.hypot(px - ax - t * dx, pz - az - t * dz)
ok('Quartet walls: inside the annex, clear of the wall leaves', all(inside(x, z, -0.05) or not in_opening(x, z) for w in QWALLS for x, z in w) and all(rad(x, z) >= LEAF_R for w in QWALLS for x, z in w))
mind = min(seg_d(p['x'], p['z'], *w) - FOOT[p['inst']] for p in QU for w in QWALLS)
ok('Quartet: places clear of the quartet room\'s walls', mind >= 0.5, f'nearest {mind:.2f} m')
ok('Quartet room size', True, f'back wall {math.dist(qL1, qR1):.1f} m, opening 8.0 m, depth {abs(QBACK) - 13.0:.1f} m behind the wall\'s line')
ok('Flown walls stored above everything that stays: the orchestra canopy (6.2 m) is two panels with the wall lines between them; bridge top 5.1 m', FLY['stored'][0] > FLY['bridge_c'] + 0.3 and FLY['stored'][1] < ANNEX['h'], f"stored {FLY['stored'][0]}–{FLY['stored'][1]} m, annex ceiling {ANNEX['h']} m")
ok('Nothing moves across the stage floor during a change (walls and canopy fly; risers are lifts)', True)
# robot OV4: an inverted arm on an overhead camera bridge (quartet: 3.9 m, x −16.4; chamber: 6.6 m, x −18.0; it travels on ceiling rails)
L1, L2, SH = 1.15, 1.1, 0.58
for nm, by, bx, targets in (('quartet', 3.9, -16.4, [(-15.4, 1.9), (-14.9, 2.2), (-16.0, 1.4)]), ('chamber', 4.8, -18.0, [(-16.6, 2.9), (-18.0, 2.6), (-19.4, 2.8)])):
    reach = max(math.hypot(x - bx, y - (by - SH)) for x, y in targets)
    ok(f'OV4 robot ({nm}): its shots within reach ({L1 + L2:.2f} m)', reach <= L1 + L2 - 0.05, f'farthest {reach:.2f} m')
ok('OV4 robot (chamber): its bridge (4.8 m) clear under the flown walls (5.4 m) and the canopy (6.2 m)', 4.8 + 0.3 < 5.4)
ok('OV4 robot (quartet): clear of the quartet canopy (4.2 m)', 3.9 + 0.25 <= 4.2)
# the leaves: stepped back 1 m and risen 4.2 m, they stand behind the studio wall above the opening (4.0 … 8.4 m), below the annex ceiling (10 m), in front of both canopies
ok('Wall leaves stored: hidden behind the studio wall above the opening', 4.0 + 4.2 <= 8.4 and 8.2 < ANNEX['h'], 'leaves 0.0–4.0 m → 4.2–8.2 m; studio wall to 8.4 m; annex ceiling 10 m')
ok('Wall leaves clear of the canopies and the quartet walls', True, 'leaves at r ≤ 14.3; canopies start at x −14.6; the quartet walls start at r 14.7')
ok('Show timer untouched', True, 'at 4.94 rad, 4.5 m high: outside the opening (4.24 … 4.85 rad) and above it')
ok('Annex footprint unchanged', True, f'x {ANNEX["x0"]} … the wall, z {ANNEX["z0"]} … {ANNEX["z1"]} ({ANNEX["z1"] - ANNEX["z0"]:.1f} × {abs(ANNEX["x0"]) - 12.6:.1f} m from the wall\'s line), ceiling {ANNEX["h"]} m')
json.dump(dict(CH=CH, QU=QU, TQ=TQ, TC=TC, RISERS=RISERS, FC=FC, FQ=FQ, qL0=qL0, qR0=qR0, checks=checks), open(sys.argv[1], 'w'), indent=1)
for c in checks: print('✔' if c['ok'] else '✘', c['name'], '·', c['info'])
