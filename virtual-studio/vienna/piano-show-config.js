// D//0 — PIANO SESSIONS: the show's media and its rules. Edit here; the 3D scene does not change.
//
// Audio: the two official masters (copied from the originals; checksums in docs/vienna-stage/PIANO-SHOW.md). After
// replacing a file, run `node virtual-studio/vienna/audio-map.mjs` so the timing follows the new recording.
// Video: the official opening video, when it exists: set `opening.video` to its path. It plays over the 3D studio
// in step with the opening's audio (the audio stays the master clock: the video itself plays muted), the 3D opening
// runs underneath, and when the video ends it fades into the live stage. Leave it null until the video is delivered.
export const SHOW = {
  title: 'D//0 — PIANO SESSIONS',
  opening: {
    label: 'Short opening · official ident',
    audio: 'assets/audio/piano-sessions/dz-piano-sessions-opening.wav',
    video: null,             // e.g. 'assets/video/dz-piano-sessions-opening.mp4' (muted; synced to the audio)
    videoFade: 1.2,          // seconds of cross-fade from the video into the 3D stage
  },
  theme: {
    label: 'Long opening · official piano theme',
    audio: 'assets/audio/piano-sessions/dz-piano-theme.wav',
  },
  live: { label: 'Live piano performance', camera: 'P1', lights: 'WARM PIANO' },
  // between songs: played by hand only (never after each song by itself), as often as wanted; back to live after it.
  // Warm light, the keyboard close-up and slow camera moves; the lift does not move
  between: {
    label: 'Between songs · official ident',
    audio: 'assets/audio/piano-sessions/dz-piano-between-songs.wav',
    lights: 'WARM PIANO', cams: ['P2', 'P3', 'P2', 'P5'], last: 'P1', minShot: 5,
  },
  // closing: slow shots, the light coming down step by step, the last shot on the grand in a soft light with the
  // DISTANCE // ZERO logo behind it; when the recording has died away, SHOW ENDED
  closing: {
    label: 'Closing · official closing ident',
    audio: 'assets/audio/piano-sessions/dz-piano-sessions-closing.wav',
    cams: ['P5', 'P3', 'P4', 'P2'], last: 'P1', minShot: 7,
    dimTo: 0.35,                 // the light level the closing ends on (1 = the mode's full level)
  },
  ended: { label: 'Show ended', lights: 'WARM PIANO' },

  // the theme's camera script, made from the measured sections: how long a shot lasts and which cameras a section
  // of that energy uses, in turn (never the same camera twice in a row); cuts snap to a measured onset within `snap` s
  shots: {
    quiet: { length: 12, cams: ['P2', 'P3', 'P1'], lights: 'WARM PIANO' },
    mid: { length: 10, cams: ['P1', 'P3', 'P5', 'P2'], lights: 'CINEMATIC' },
    loud: { length: 8, cams: ['P4', 'P1', 'P5', 'P3'], lights: 'CINEMATIC' },
    climax: { lights: 'PERFORMANCE' },   // the loudest loud section
    snap: 1.5,
  },
};
