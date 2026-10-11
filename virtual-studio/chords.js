// Chord progressions for the piano: ported unchanged in substance from the Andy'K Music Lab chord generator
// (lab.djandykofficial.com/chord-generator). Music Lab itself is not modified; this is a read-only copy of its logic.

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// chord types: intervals from the root, and the quality shown in the name
const CHORD_TYPES = {
  maj: [[0, 4, 7], 'maj'], min: [[0, 3, 7], 'min'], dim: [[0, 3, 6], 'dim'], aug: [[0, 4, 8], 'aug'],
  maj7: [[0, 4, 7, 11], 'maj7'], min7: [[0, 3, 7, 10], 'min7'], dom7: [[0, 4, 7, 10], '7'],
};
// diatonic chord per scale degree
const DIATONIC_MAJOR = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const DIATONIC_MINOR = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];

export const GENRES = ['trance', 'house', 'pop', 'cinematic'];
const PROGRESSIONS = {
  trance: { major: [[0, 5, 2, 6], [0, 3, 4, 3], [3, 4, 0, 4]], minor: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 2, 3, 5]] },
  house: { major: [[0, 4, 5, 3], [0, 3, 0, 4], [1, 4, 0, 5]], minor: [[0, 6, 5, 6], [0, 4, 5, 6], [0, 2, 5, 3]] },
  pop: { major: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 0, 4, 5]], minor: [[0, 5, 2, 6], [0, 6, 3, 5], [0, 2, 4, 0]] },
  cinematic: { major: [[0, 2, 3, 4], [0, 5, 2, 3], [3, 0, 5, 4]], minor: [[0, 5, 6, 0], [0, 2, 5, 6], [0, 6, 3, 5]] },
};
const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

function buildChord(root, type) {
  const [intervals, quality] = CHORD_TYPES[type];
  return {
    name: NOTES[root] + (quality === 'maj' ? '' : quality === 'min' ? 'm' : quality),
    notes: intervals.map(i => NOTES[(root + i) % 12]),
    pcs: intervals.map(i => root + i),            // pitch classes from the root upwards (may exceed 11)
  };
}

export function progressions(keyName, mode, genre) {
  const key = NOTES.indexOf(keyName), scale = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const types = mode === 'major' ? DIATONIC_MAJOR : DIATONIC_MINOR, roman = mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;
  return PROGRESSIONS[genre][mode].map(degrees => degrees.map(deg => ({ ...buildChord((key + scale[deg]) % 12, types[deg]), roman: roman[deg], degree: deg })));
}

// a playable voicing: close position around middle C, as MIDI note numbers
export function voicing(chord) {
  const root = 48 + (chord.pcs[0] % 12) + (chord.pcs[0] % 12 < 5 ? 12 : 0); // keep it between F3 and E4
  return [root - 12, ...chord.pcs.map(pc => root + (pc - chord.pcs[0]))];    // bass note an octave down
}
