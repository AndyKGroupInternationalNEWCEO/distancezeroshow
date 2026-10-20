# Piano parts for the grand's keys

The grand on the Vienna Piano Stage can show its keys going down as a song plays (`virtual-studio/vienna/keys.js`).
It does this only from an **approved piano part**: a list of notes timed to the original recording, checked by a
musician and signed off. Until a song has one, its keys stay still. Nothing is generated, guessed or made up to fill
the gap.

At the moment **no song has an approved part**. The panel says so for every song ("Keys: still — no approved piano
part for this song yet").

## The part file

```js
{
  song: 'opus-no-1-vienna/i-prologue',                // the repertoire id (repertoire.js)
  kind: 'piano-part',                                  // 'piano-part': the recording's own piano
                                                       // 'accompaniment': a verified chord accompaniment, when the
                                                       //   recording has no piano of its own to follow
  source: 'score PDF (Opus No. 1 Vienna, I) → MusicXML (OMR), corrected; timed to the recording, beat map checked',
  approved: { by: 'DJ Andy\'K', on: '2026-11-02' },   // without it the part is refused
  offset: 0,                                           // seconds: note time 0 = this point in the recording
  notes: [{ t: 12.345, d: 0.5, m: 60, v: 0.8 }, …],   // start (s), length (s), MIDI note number 21–108, velocity 0–1
}
```

- **Times are seconds in the recording,** not beats.
- **MIDI note numbers** are only a way of naming pitches: A0 = 21, middle C = 60, C8 = 108. No MIDI file is needed.
- **Refused parts:** `validatePart` refuses a part with no approval, no source, an unknown kind, or a note outside
  the piano's range. The keys then stay still and the reasons are returned.
- **Registering a part:** add it to `parts` in `virtual-studio/vienna/index.js`, keyed by the song id. That is
  the only place parts are read.

## Where a part can come from

MIDI is **not required**. Any of these sources can lead to a part. Each needs the same timing and checking steps
below before it is used.

| Source | What it gives | What is still needed |
|---|---|---|
| **Professional piano score (PDF)** | pitches, rhythm in beats, voicing, pedalling, dynamics | the notes in machine-readable form, and their times in the recording |
| MusicXML or a notation file (Sibelius, Dorico, Finale, MuseScore) | the notes, already machine-readable | times in the recording |
| MIDI from the DAW session that made the recording | notes and times, usually already aligned | a check that it is the final take and its offset to the master |
| Song sheet (chords only) | the chord progression | voicings and rhythm decided by a musician; the result is an `accompaniment`, never a `piano-part` |

## From a professional score PDF

The Opus No. 1 Vienna movements already have scores on djandykofficial.com (linked in the panel). A PDF score knows
pitches and rhythm but **not time**: it has no seconds, and a played performance speeds up, holds back and
pauses. The library's BPM is only an average. So the times must be taken from the recording itself and checked by
ear before any key moves.

### 1. Rights and version

- **Rights:** use only scores that DJ Andy'K owns or has a licence for.
- **Matching version:** confirm that the score is the version on the recording, with the same arrangement, repeats,
  cuts and key. If the recording departs from it (an added intro, a skipped repeat, an improvised passage), write
  that down: those bars are left out or played from a corrected score, never filled in by guessing.

### 2. Notes: PDF → MusicXML

- **Born-digital PDF** (exported from notation software): ask for the original notation file or a MusicXML export
  first. It is exact, and no recognition step is needed.
- **Otherwise, optical music recognition (OMR):** Audiveris (free), PlayScore 2, ScanScore, or PhotoScore in Sibelius.
  The output is MusicXML.
- **Correction:** a musician corrects the MusicXML in MuseScore, Dorico or Sibelius against the PDF, bar by bar. OMR
  regularly gets these wrong:
  - accidentals and key changes;
  - ties against slurs;
  - voices crossing between the hands;
  - tuplets;
  - grace notes;
  - ottava lines;
  - pedal marks.
- **Result:** a corrected MusicXML file that plays back exactly what the PDF says.

### 3. Times: a beat map from the recording

The score's bars and beats are matched to the recording. Two ways:

- **Beat map by hand (most reliable for rubato):** in Sonic Visualiser, or a DAW such as Logic or Reaper, mark every
  beat (or at least every bar line) on the recording. Tapping along gives a first pass; each mark is then moved
  onto the actual attack in the waveform. The marks are exported as a list of times, one per beat.
- **Automatic alignment (faster, still checked):** audio-to-score alignment, for example the MATCH plugin in Sonic
  Visualiser against a rendering of the MusicXML, or `synctoolbox` (dynamic time warping). It gives a first beat map,
  which is corrected by hand wherever it drifts. This is usually at fermatas, rubato, very quiet or very dense
  passages, and wherever the recording departs from the score.

Each note's beat position from the MusicXML is then converted into seconds through the beat map. Within a beat the
time is interpolated between its two beat marks. This gives `t` and `d` for every note. Two adjustments:

- **Sustain pedal:** a note's `d` is how long the key is held, not how long it rings under the pedal. The keys show
  the fingers, not the pedal.
- **Offset:** if the recording starts with silence or a non-piano intro, use `offset` (or the beat map's first
  mark) so that note time 0 is the first bar.

### 4. Musical verification (before approval)

The part is checked against the recording by a musician, not by the tool that made it.

1. **Listen with the part.**
   - Play the recording with the part sounding quietly on top: a MIDI render of the part, or clicks on its attacks.
   - Listen all the way through.
   - Every attack must land on the recording's attack. As a rule of thumb, a misalignment of about 30 ms or more is
     audible and must be corrected.
2. **Watch with the part.**
   - Run the song on the stage with the part loaded (see *Preview* below) and watch P2, the keyboard shot.
   - Check the passages that matter most:
     - the opening;
     - every tempo change;
     - fermatas and pauses;
     - the fastest passage;
     - the ending.
3. **Jump and pause:**
   - jump to several places, forward and back, and pause there;
   - the keys must match the sound at once (they are set from the recording's time alone).
4. **Write it down:**
   - what was checked;
   - what was left out and why (for example bars the recording does not play as written);
   - the source chain, which goes in `source`.

Only then is `approved` filled in, by the person signing off, with the date.

### 5. What is never done

- **No guessing:** no notes made up for passages the score or recording does not support.
- **No silent tempo:** no constant tempo from the library's BPM in place of a beat map.
- **No audio transcription without checks:** no automatic transcription of the mixed recording (piano-to-MIDI from
  audio) used as a part on its own. It can help to find a beat map or to spot a missing passage, but its notes are not
  trusted until steps 2 to 4 have been done on them.
- **No chords as a piano part:** chords from the song sheet are never shown as if they were the recording's own
  piano part.

## MIDI from the DAW (when it exists)

If the recording was made from MIDI, its notes are the most exact source.

1. **Export:** export the piano track from the final session, then convert it to the part format: times in seconds,
   note numbers, velocities scaled to 0–1.
2. **Check the alignment:** confirm that the export starts at the same point as the master.
   - Bounce offsets and a pre-roll are common.
   - Set `offset` if they do not match.
3. **Verify:** do step 4 above as for any part.

## Preview of a part before approval (local only)

Approval is required for a part to be accepted, so a draft is previewed under a draft approval in the browser
console of the local stage page (`vienna-dev.html`). It is never committed or registered in that form.

```js
const e = __studio.ext;
e.performSong();                                          // the picked song, on its original recording
e.keyPlayer.load({ ...draft, approved: { by: 'DRAFT — not approved', on: '—' } });
e.show.seek(60);                                          // jump to 1:00; the keys follow
```

Performing a song again unloads the draft: the keys go back to still.

## Status

| | |
|---|---|
| Approved parts | none |
| Scores available | Opus No. 1 Vienna I–IV (PDF) on djandykofficial.com |
| Converter (MusicXML + beat map → part file) | not built yet: to be written when the first corrected MusicXML and beat map exist |
