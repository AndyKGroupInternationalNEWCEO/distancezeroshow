// OPUS V: the instruments of the two configurations, for the information cards (English only; shown only when the
// viewer asks for them, never over a performance), and the credits of the 3D models in the room. A model is credited
// here only once it is actually in the room (licence checked, author and source kept); until then the list is empty.
export const INSTRUMENTS = [
  { name: 'Violin', section: 'Strings', places: 'First violin · Second violin',
    about: 'The smallest and highest bowed string instrument, with four strings tuned in fifths (G, D, A, E) and a body about 35.5 cm long.',
    role: 'The first violins usually carry the main melody and lead the orchestra through the concertmaster. The second violins play harmony, inner lines and counter-melodies, and often double the firsts an octave lower.' },
  { name: 'Viola', section: 'Strings', about: 'A bowed string instrument slightly larger than the violin, tuned a fifth lower (C, G, D, A). Its music is written mostly in the alto clef.',
    role: 'Fills the middle of the string harmony with a warm, darker tone and takes inner melodies.' },
  { name: 'Cello', section: 'Strings', about: 'A large bowed string instrument played seated, held between the knees on an endpin, tuned an octave below the viola (C, G, D, A).',
    role: 'Plays the bass line with the double basses and is one of the orchestra’s great lyrical solo voices.' },
  { name: 'Double bass', section: 'Strings', about: 'The largest and lowest bowed string instrument, about 1.8 m tall, played standing or on a high stool, with strings tuned in fourths (E, A, D, G).',
    role: 'The foundation of the orchestra’s harmony: it sounds an octave below the written bass line.' },
  { name: 'Flute', section: 'Woodwinds', about: 'A metal side-blown woodwind about 67 cm long. The player blows across the embouchure hole instead of through a reed.',
    role: 'The brightest of the woodwinds: agile melodies and the top of the woodwind chords.' },
  { name: 'Oboe', section: 'Woodwinds', about: 'A double-reed woodwind with a conical bore and a clear, penetrating tone.',
    role: 'Gives the tuning A to the orchestra before it plays, and is a leading melodic voice of the woodwinds.' },
  { name: 'Clarinet', section: 'Woodwinds', about: 'A single-reed woodwind with a cylindrical bore; the orchestral clarinet is usually in B♭ or A, about 66 cm long.',
    role: 'A wide range from a dark low register to a brilliant top; melodies, harmony and colour in the woodwind section.' },
  { name: 'Bassoon', section: 'Woodwinds', about: 'A double-reed woodwind whose bore folds back on itself; the instrument stands about 1.34 m tall.',
    role: 'The bass of the woodwind section, also used for lyrical and humorous solos.' },
  { name: 'French horn', section: 'Brass', about: 'A brass instrument of coiled tubing (about 3.7 m for the horn in F) with a wide bell, which the player shades with the right hand.',
    role: 'Links the brass and the woodwinds: sustained harmony, warm melodies and heroic calls.' },
  { name: 'Trumpet', section: 'Brass', about: 'The highest brass instrument of the orchestra, with three valves; the orchestral trumpet is usually in B♭ or C.',
    role: 'Brilliant fanfares, rhythmic accents and the climaxes of the music.' },
  { name: 'Timpani', section: 'Percussion', about: 'Large copper kettle drums with calfskin or plastic heads (about 58–81 cm across). A pedal tunes each drum to a definite pitch.',
    role: 'Played by the timpanist: the rhythmic and harmonic foundation of the percussion, usually on the tonic and the dominant.' },
  { name: 'Snare drum', section: 'Percussion', about: 'A shallow drum (usually 14 in, 35.6 cm) with wires, the snares, stretched under the lower head for a crisp, rattling sound.',
    role: 'Part of the percussionist’s setup: rolls, marches and rhythmic drive.' },
  { name: 'Concert bass drum', section: 'Percussion', about: 'A large double-headed drum (about 81–91 cm) hung in a tilting frame stand and played with a soft beater.',
    role: 'Part of the percussionist’s setup: deep accents, rolls and the weight of the orchestral climaxes.' },
];

// { instrument, title, author, authorUrl, licence, licenceUrl, source } — added as each approved model goes into the room
export const MODEL_CREDITS = [];
