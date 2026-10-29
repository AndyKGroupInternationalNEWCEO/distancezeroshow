# the approval drawings, from plan.json (plan.py): two floor plans (quartet, chamber) and a section, to scale
import json, math, sys, html
D = json.load(open('plan.json')); E = html.escape
S = 38; Z0, Z1, X0, X1 = -7.2, 5.4, -22.6, -10.2
W, H = (Z1 - Z0) * S, (X1 - X0) * S
sx = lambda z: (Z1 - z) * S          # audience's left (+z) on the left
sy = lambda x: (x - X0) * S          # deeper (−x) up, the studio at the bottom
R, SK = 12.6, 13.2
FAM = {'Violin I': 'str', 'Violin II': 'str', 'Viola': 'str', 'Cello': 'str', 'Double bass': 'str', 'Flute': 'ww', 'Oboe': 'ww', 'Clarinet': 'ww', 'Bassoon': 'ww', 'French horn': 'br', 'Trumpet': 'br', 'Timpani': 'pc', 'Percussion': 'pc'}
AB = {'Violin I': 'V1', 'Violin II': 'V2', 'Viola': 'Va', 'Cello': 'Vc', 'Double bass': 'Cb', 'Flute': 'Fl', 'Oboe': 'Ob', 'Clarinet': 'Cl', 'Bassoon': 'Bn', 'French horn': 'Hn', 'Trumpet': 'Tp', 'Timpani': 'Timp', 'Percussion': 'Perc'}
FOOT = {'Violin I': .40, 'Violin II': .40, 'Viola': .42, 'Cello': .50, 'Double bass': .55, 'Flute': .45, 'Oboe': .45, 'Clarinet': .45, 'Bassoon': .50, 'French horn': .50, 'Trumpet': .45, 'Timpani': 1.0, 'Percussion': 1.2}
A, HALF = 4.544, math.asin(4 / 13.2)
def arcpath(r, a0, a1, n=40):
    pts = [(r * math.sin(a0 + (a1 - a0) * i / n), 1 + r * math.cos(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    return 'M' + ' L'.join(f'{sx(z):.1f},{sy(x):.1f}' for x, z in pts)
def plan(kind):
    o = [f'<svg viewBox="0 0 {W:.0f} {H + 24:.0f}" role="img" aria-label="{kind} floor plan" class="plan">']
    o.append(f'<defs><pattern id="hatch-{kind}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hatch"/></pattern></defs>')
    # the annex box and its walls
    o.append(f'<rect x="{sx(4.6):.1f}" y="{sy(-22):.1f}" width="{11.2 * S:.1f}" height="{(22 - 10.0) * S:.1f}" class="annex"/>')
    # the studio's side: everything inside the wall circle is the studio
    o.append(f'<path d="{arcpath(SK, 4.0, 5.1)} L{sx(Z0):.1f},{H:.1f} L{sx(Z1):.1f},{H:.1f} Z" class="studio"/>')
    o.append(f'<path d="{arcpath(SK, 4.0, A - HALF)}" class="wall"/><path d="{arcpath(SK, A + HALF, 5.1)}" class="wall"/>')
    o.append(f'<path d="{arcpath(SK, A - HALF, A + HALF)}" class="opening"/>')
    # the leaves' path (behind the opening): kept clear
    band = arcpath(14.3, A - HALF, A + HALF) + ' L' + arcpath(R - 0.35, A + HALF, A - HALF)[1:] + ' Z'
    o.append(f'<path d="{band}" fill="url(#hatch-{kind})" class="leafzone"/>')
    # the fixed returns
    for e in (A + HALF + 0.02, A - HALF - 0.02):
        o.append(f'<line x1="{sx(1 + SK * math.cos(e)):.1f}" y1="{sy(SK * math.sin(e)):.1f}" x2="{sx(1 + 14.7 * math.cos(e)):.1f}" y2="{sy(14.7 * math.sin(e)):.1f}" class="ret"/>')
    # the quartet walls: in (solid) or flown out (dashed)
    for a, b in D['TQ']:
        o.append(f'<line x1="{sx(a[1]):.1f}" y1="{sy(a[0]):.1f}" x2="{sx(b[1]):.1f}" y2="{sy(b[0]):.1f}" class="{"qwall" if kind == "quartet" else "qwall flown"}"/>')
    FC = D['FC']
    if kind == 'chamber':
        for k, r0, r1, w in D['RISERS']:
            t0, t1 = math.radians(w), -math.radians(w)
            pts = [(FC[0] - r * math.cos(t), FC[1] + r * math.sin(t)) for r, ts in ((r0, [t0 + (t1 - t0) * i / 30 for i in range(31)]), (r1, [t1 + (t0 - t1) * i / 30 for i in range(31)])) for t in ts]
            pts = [(max(x, -21.75), z) for x, z in pts]
            o.append('<path d="M' + ' L'.join(f'{sx(z):.1f},{sy(x):.1f}' for x, z in pts) + f' Z" class="riser r{k}"/>')
            o.append(f'<text x="{sx(FC[1] + (r0 + 0.12) * math.sin(t0)):.1f}" y="{sy(FC[0] - (r0 + 0.12) * math.cos(t0)):.1f}" class="lbl small">riser {k} · {0.3 * k:.1f} m</text>')
        o.append(f'<line x1="{sx(3.9):.1f}" y1="{sy(-18.0):.1f}" x2="{sx(-5.9):.1f}" y2="{sy(-18.0):.1f}" class="bridge"/><text x="{sx(-5.9) + 4:.1f}" y="{sy(-18.0) - 4:.1f}" class="lbl small">OV4 bridge · 4.8 m</text>')
        places = D['CH']; cams = [('OV1', -15.2, 3.9), ('OV2', -13.9, -5.6), ('OV3', -13.0, -1.15)]
    else:
        places = D['QU']; cams = [('OV1', -14.9, 1.4), ('OV2', -14.3, -3.7), ('OV3', -13.05, -1.15)]
        o.append(f'<line x1="{sx(1.7):.1f}" y1="{sy(-16.4):.1f}" x2="{sx(-3.7):.1f}" y2="{sy(-16.4):.1f}" class="bridge"/><text x="{sx(-3.7) + 4:.1f}" y="{sy(-16.4) + 4:.1f}" class="lbl small">OV4 bridge · 3.9 m</text>')
        o.append(f'<rect x="{sx(1.6):.1f}" y="{sy(-17.6):.1f}" width="{5.2 * S:.1f}" height="{2.9 * S:.1f}" class="canopy"/><text x="{sx(1.5):.1f}" y="{sy(-17.6) + 12:.1f}" class="lbl small">canopy 4.2 m</text>')
    for p in places:
        c = FAM[p['inst']]; r = FOOT[p['inst']]
        o.append(f'<circle cx="{sx(p["z"]):.1f}" cy="{sy(p["x"]):.1f}" r="{r * S:.1f}" class="pl {c}"><title>{E(p["inst"])}</title></circle>')
        o.append(f'<text x="{sx(p["z"]):.1f}" y="{sy(p["x"]) + 3.5:.1f}" class="ab">{AB[p["inst"]]}</text>')
    for n, x, z in cams + [('CCTV', -21.6, -6.2)]:
        o.append(f'<g transform="translate({sx(z):.1f},{sy(x):.1f})"><rect x="-5" y="-5" width="10" height="10" class="cam"/><text x="8" y="4" class="lbl cam-l">{n}</text></g>')
    # dimensions
    o.append(f'<line x1="{sx(4.6):.1f}" y1="{sy(-22) - 10:.1f}" x2="{sx(-6.6):.1f}" y2="{sy(-22) - 10:.1f}" class="dim"/><text x="{(sx(4.6) + sx(-6.6)) / 2:.1f}" y="{sy(-22) - 14:.1f}" class="lbl mid">11.2 m</text>' if False else '')
    o.append(f'<text x="{(sx(4.6) + sx(-6.6)) / 2:.1f}" y="{sy(-22) + 14:.1f}" class="lbl mid">back wall · amber LED fins · 11.2 m</text>')
    o.append(f'<text x="{sx(-1.2):.1f}" y="{H - 8:.1f}" class="lbl mid">STUDIO · the grand 7 m this way ↓</text>')
    o.append(f'<text x="{sx(3.5):.1f}" y="{sy(-11.2):.1f}" class="lbl small">show timer, 4.5 m up ◆</text>')
    o.append(f'<text x="{(sx(2.84) + sx(-5.05)) / 2:.1f}" y="{sy(-12.25):.1f}" class="lbl mid op">8 m opening</text>')
    o.append(f'<text x="{sx(-6.4):.1f}" y="{sy(-15.5):.1f}" class="lbl small vert">9.4 m</text>')
    # scale bar
    o.append(f'<g transform="translate(10,{H + 10:.0f})"><line x1="0" y1="0" x2="{2 * S}" y2="0" class="dim"/><text x="{2 * S + 6}" y="4" class="lbl small">2 m</text></g>')
    o.append('</svg>'); return ''.join(o)
def section():
    s = 30; xs = lambda d: 30 + d * s; ys = lambda y: 330 - y * s
    o = ['<svg viewBox="0 0 620 360" role="img" aria-label="section through the room" class="plan sec">']
    o.append(f'<rect x="{xs(0)}" y="{ys(10)}" width="{9.4 * s}" height="{10 * s}" class="annex"/>')
    o.append(f'<rect x="{xs(-0.6)}" y="{ys(8.4)}" width="{0.6 * s}" height="{4.4 * s}" class="wallsec"/><text x="{xs(-0.5)}" y="{ys(8.6)}" class="lbl small">studio wall 8.4 m</text>')
    o.append(f'<rect x="{xs(0.6)}" y="{ys(8.2)}" width="{0.7 * s}" height="{4.0 * s}" class="leaf"/><text x="{xs(1.4)}" y="{ys(7.9)}" class="lbl small">wall leaves, risen (4.2–8.2 m)</text>')
    o.append(f'<rect x="{xs(-0.6)}" y="{ys(4.0)}" width="{0.7 * s}" height="{4.0 * s}" class="leaf ghost"/><text x="{xs(-0.5)}" y="{ys(1.8)}" class="lbl small vtext">closed</text>')
    # quartet walls flown / in, canopies, bridge, risers, trusses
    o.append(f'<rect x="{xs(4.7) - 3}" y="{ys(9.8)}" width="6" height="{4.4 * s}" class="qwall-s"/><text x="{xs(4.7) + 6}" y="{ys(9.2)}" class="lbl small">quartet back wall, flown out (5.4–9.8 m)</text>')
    o.append(f'<rect x="{xs(4.7) - 3}" y="{ys(4.4)}" width="6" height="{4.4 * s}" class="qwall-s ghost"/><text x="{xs(4.7) + 6}" y="{ys(2.3)}" class="lbl small">… flown in for the quartet</text>')
    o.append(f'<rect x="{xs(1.6)}" y="{ys(4.2) - 3}" width="{3.0 * s}" height="5" class="canopy-s ghost"/><text x="{xs(1.6)}" y="{ys(4.2) + 12}" class="lbl small">quartet canopy 4.2 m</text>')
    o.append(f'<rect x="{xs(1.6)}" y="{ys(6.2) - 3}" width="{2.85 * s}" height="5" class="canopy-s"/><rect x="{xs(4.95)}" y="{ys(6.2) - 3}" width="{4.05 * s}" height="5" class="canopy-s"/><text x="{xs(5.1)}" y="{ys(6.2) + 13}" class="lbl small">orchestra canopy 6.2 m: two panels, the wall line between them</text>')
    o.append(f'<rect x="{xs(5.4) - 8}" y="{ys(4.8)}" width="16" height="6" class="bridge-s"/><text x="{xs(5.4) + 12}" y="{ys(4.8) + 6}" class="lbl small">OV4 bridge 4.8 m (3.9 m for the quartet)</text>')
    for d0, d1, h in ((5.3, 6.4, 0.3), (6.4, 9.0, 0.6)): o.append(f'<rect x="{xs(d0)}" y="{ys(h)}" width="{(d1 - d0) * s}" height="{h * s}" class="riser-s"/>')
    o.append(f'<text x="{xs(5.4)}" y="{ys(0.8)}" class="lbl small">risers: lifts, flush for the quartet</text>')
    for d in (2.5, 6.0, 8.6): o.append(f'<circle cx="{xs(d)}" cy="{ys(7.0)}" r="4" class="truss"/>')
    o.append(f'<text x="{xs(6.2)}" y="{ys(7.3)}" class="lbl small">light trusses 7 m</text>')
    o.append(f'<line x1="{xs(0)}" y1="{ys(0)}" x2="{xs(9.4)}" y2="{ys(0)}" class="floor"/><text x="{xs(0.4)}" y="{ys(10) + 14}" class="lbl small">annex ceiling 10 m</text>')
    o.append(f'<text x="{xs(-0.6)}" y="{ys(-0.6)}" class="lbl small">STUDIO</text><text x="{xs(4.7)}" y="{ys(-0.6)}" class="lbl small mid">9.4 m deep</text>')
    o.append('</svg>'); return ''.join(o)
json.dump(dict(quartet=plan('quartet'), chamber=plan('chamber'), section=section()), open('drawings.json', 'w'))
print('ok')
