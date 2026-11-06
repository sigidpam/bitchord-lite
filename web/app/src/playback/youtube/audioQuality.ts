import type { AudioQuality } from '@/state/player';

/** The fields of a Shaka variant that the quality choice needs. */
export interface AudioVariant {
  audioCodec: string | null;
  audioBandwidth: number | null;
  bandwidth?: number | null;
  originalAudioId: string | null;
}

function bitrateOf(track: AudioVariant): number {
  return track.audioBandwidth ?? track.bandwidth ?? 0;
}

/**
 * Picks the rendition for [quality]: Low is the lowest-bitrate candidate of
 * the first preferred codec, Medium the next one up, High the best. Lossless
 * takes FLAC/ALAC when the source offers one and otherwise behaves as High,
 * because YouTube's own ladder is lossy.
 */
export function pickAudioVariant<T extends AudioVariant>(
  tracks: readonly T[],
  quality: AudioQuality,
  codecs: readonly string[],
): T | null {
  if (quality === 'lossless') {
    const lossless = tracks
      .filter((track) => /^(flac|alac)/i.test(track.audioCodec ?? ''))
      .sort((a, b) => bitrateOf(b) - bitrateOf(a))[0];
    if (lossless) return lossless;
  }

  for (const codec of codecs) {
    const candidates = tracks
      .filter((track) => (track.audioCodec ?? '').startsWith(codec))
      .sort((a, b) => bitrateOf(a) - bitrateOf(b));
    if (!candidates.length) continue;
    if (quality === 'low') return candidates[0]!;
    if (quality === 'medium') return candidates[Math.min(1, candidates.length - 1)]!;
    return candidates[candidates.length - 1]!;
  }
  return null;
}
