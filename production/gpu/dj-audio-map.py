# The DJ Room openings' music map, measured from the masters (on the pod): the kick's beats as they fall in the
# recording, the energy of the lows, mids and highs 20 times a second, and the big hits. The DJ Room's light follows
# it (melbourne/index.js): the pulses land on the real beats, the levels rise and fall with the music, the strobe
# and fog answer the hits, the mixer's meters show the recording's level. Nothing is guessed: all of it is measured.
#   python3 dj-audio-map.py big.wav short.wav  → dj-audio-map.json
import base64, json, sys
import numpy as np, librosa

FPS = 20
def u8(a):   # 0…1 → one byte per frame, base64
    return base64.b64encode((np.clip(a, 0, 1) * 255).round().astype(np.uint8).tobytes()).decode()

def measure(path, bpm):
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop = sr // FPS
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    def band(lo, hi):
        e = librosa.amplitude_to_db(np.sqrt((S[(f >= lo) & (f < hi)] ** 2).mean(axis=0)) + 1e-9)
        a, b = np.percentile(e, 5), np.percentile(e, 99.5)
        return (e - a) / max(1e-6, b - a)
    low, mid, high = band(30, 150), band(150, 2000), band(2000, 10000)
    # the beats: tracked on the kick (low-band onsets, 5.8 ms resolution), free to follow the tempo where it moves
    # (the openings drift between about 134 and 140 BPM); `fit` says how much stronger the kick is on the beats than
    # on average (well above 1: the beats sit on the kicks)
    H = 128; kick = librosa.onset.onset_strength(y=y, sr=sr, hop_length=H, fmax=160, n_mels=24)
    tempo, bf = librosa.beat.beat_track(onset_envelope=kick, sr=sr, hop_length=H, start_bpm=bpm or 138, tightness=60)
    beats = librosa.frames_to_time(bf, sr=sr, hop_length=H)
    near = lambda i: kick[max(0, i - 2):i + 3].max()
    fit = float(np.mean([near(i) for i in bf]) / (kick.mean() + 1e-9))
    # the kick itself, 50 times a second (0…1, its strongest 1 % at 1): what the pulses of the light follow
    k = librosa.resample(kick, orig_sr=sr / H, target_sr=50) if hasattr(librosa, 'resample') else kick
    kick50 = np.clip(k / (np.percentile(k, 99) + 1e-9), 0, 1)
    # the bar: the beat phase (of 4) whose beats carry the most low end is the downbeat
    lowAt = lambda t: low[min(len(low) - 1, int(t * FPS))]
    phase = int(np.argmax([np.mean([lowAt(t) for t in beats[p::4]]) for p in range(4)])) if len(beats) > 8 else 0
    # the hits: the strongest onsets (top 3 %), at least 0.4 s apart
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=512, units='frames')
    thr = np.percentile(env[on], 97) if len(on) else 1
    hits, last = [], -1
    for i in on:
        t = float(librosa.frames_to_time(i, sr=sr, hop_length=512))
        if env[i] >= thr and t - last >= 0.4: hits.append(round(t, 3)); last = t
    return {'duration': round(len(y) / sr, 2), 'tempo': round(float(np.atleast_1d(tempo)[0]), 2), 'fit': round(fit, 2), 'downbeat': phase,
            'beats': [round(float(t), 3) for t in beats], 'kickFps': 50, 'kick': u8(kick50), 'hits': hits, 'fps': FPS, 'low': u8(low), 'mid': u8(mid), 'high': u8(high)}

out = {'big': measure(sys.argv[1], 140), 'short': measure(sys.argv[2], None)}
json.dump(out, open('dj-audio-map.json', 'w'), separators=(',', ':'))
for k, v in out.items(): print(k, v['duration'], 's, tempo', v['tempo'], 'fit', v['fit'], ',', len(v['beats']), 'beats, downbeat phase', v['downbeat'], ',', len(v['hits']), 'hits')
