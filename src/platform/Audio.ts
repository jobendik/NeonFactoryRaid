// Legacy single-call shim that M13's audio layer replaces. Existing callers
// import { playRisingChord } from this module; we re-route through the new
// AudioBus + sfx layer so the chord plays via the master/SFX gain chain
// (and honors the mute button). Kept as a re-export so we don't have to
// patch every callsite at once - new callers should import from ../audio/sfx
// directly.

import { sfxExtractionSuccess } from '../audio/sfx';

export function playRisingChord(): void {
  sfxExtractionSuccess();
}
