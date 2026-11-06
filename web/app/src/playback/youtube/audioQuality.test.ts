import { describe, expect, it } from 'vitest';
import { pickAudioVariant, type AudioVariant } from './audioQuality';

function variant(audioCodec: string, kbps: number, id: string): AudioVariant & { id: string } {
  return {
    id,
    audioCodec,
    audioBandwidth: kbps * 1000,
    bandwidth: kbps * 1000,
    originalAudioId: id,
  };
}

const opus = [variant('opus', 48, '249'), variant('opus', 80, '250'), variant('opus', 160, '251')];
const aac = [variant('mp4a.40.2', 128, '140')];
const flac = [variant('flac', 1411, 'f251'), ...opus];

describe('audio quality selection', () => {
  it('picks the low, medium and high Opus rungs', () => {
    expect(pickAudioVariant(opus, 'low', ['opus', 'mp4a'])?.id).toBe('249');
    expect(pickAudioVariant(opus, 'medium', ['opus', 'mp4a'])?.id).toBe('250');
    expect(pickAudioVariant(opus, 'high', ['opus', 'mp4a'])?.id).toBe('251');
  });

  it('uses the highest available rung when only one exists', () => {
    const one = [variant('opus', 160, '251')];
    expect(pickAudioVariant(one, 'low', ['opus'])?.id).toBe('251');
    expect(pickAudioVariant(one, 'medium', ['opus'])?.id).toBe('251');
    expect(pickAudioVariant(one, 'high', ['opus'])?.id).toBe('251');
  });

  it('falls back to AAC when the preferred codec is absent', () => {
    expect(pickAudioVariant(aac, 'high', ['opus', 'mp4a'])?.id).toBe('140');
    expect(pickAudioVariant(aac, 'low', ['opus', 'mp4a'])?.id).toBe('140');
  });

  it('prefers a lossless codec for Lossless and otherwise falls back to High', () => {
    expect(pickAudioVariant(flac, 'lossless', ['opus', 'mp4a'])?.id).toBe('f251');
    expect(pickAudioVariant(opus, 'lossless', ['opus', 'mp4a'])?.id).toBe('251');
  });

  it('returns null when nothing matches', () => {
    expect(pickAudioVariant([], 'high', ['opus', 'mp4a'])).toBeNull();
  });
});
