# The piano versions' notes, transcribed from the recordings on the GPU pod (ByteDance piano_transcription, Kong et
# al. 2021: onsets, offsets and velocities of a solo piano recording). For each song in songs.json it fetches the
# recording and writes parts/<song id with / as __>.json in the part format of keys.js, WITHOUT an approval: a part
# moves the grand's keys only once DJ Andy'K has watched it and signed it off (docs/vienna-stage/SCORE-IMPORT.md).
#   python3 transcribe.py            (songs.json: [{ "id": …, "audio": url }, …])
import json, os, subprocess, sys, time
import librosa, torch
from piano_transcription_inference import PianoTranscription, sample_rate

HERE = os.path.dirname(os.path.abspath(__file__))
songs = json.load(open(os.path.join(HERE, 'songs.json')))
os.makedirs(os.path.join(HERE, 'parts'), exist_ok=True); os.makedirs(os.path.join(HERE, 'audio'), exist_ok=True)
model = PianoTranscription(device='cuda' if torch.cuda.is_available() else 'cpu')
for s in songs:
    name = s['id'].replace('/', '__')
    src = os.path.join(HERE, 'audio', name + os.path.splitext(s['audio'])[1])
    if not os.path.exists(src): subprocess.run(['curl', '-sfL', '-o', src, s['audio']], check=True)
    t0 = time.time()
    audio, _ = librosa.load(src, sr=sample_rate, mono=True)
    out = model.transcribe(audio, os.path.join(HERE, 'parts', name + '.mid'))
    notes = [{'t': round(float(e['onset_time']), 3), 'd': round(max(0.03, float(e['offset_time']) - float(e['onset_time'])), 3),
              'm': int(e['midi_note']), 'v': round(min(1.0, int(e['velocity']) / 127), 3)}
             for e in out['est_note_events'] if 21 <= int(e['midi_note']) <= 108]
    part = {'song': s['id'], 'kind': 'piano-part',
            'source': 'automatic transcription of the recording (ByteDance piano_transcription, Kong et al. 2021), not yet checked',
            'approved': None, 'offset': 0, 'duration': round(len(audio) / sample_rate, 2), 'notes': notes}
    json.dump(part, open(os.path.join(HERE, 'parts', name + '.json'), 'w'), separators=(',', ':'))
    print(f"{s['id']}: {len(notes)} notes, {part['duration']} s audio, {time.time() - t0:.0f} s", flush=True)
