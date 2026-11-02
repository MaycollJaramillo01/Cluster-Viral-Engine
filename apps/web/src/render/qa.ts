type Stream = { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; pix_fmt?: string; sample_aspect_ratio?: string; nb_frames?: string; duration?: string; sample_rate?: string; channels?: number };
export type ProbeReport = { streams?: Stream[]; format?: { duration?: string } };
const LOUDNESS_TARGET = -14, LOUDNESS_TOLERANCE = 2, MAX_TRUE_PEAK = -0.5;

export function isFaststart(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 8 <= b.length;) {
    const size = b.readUInt32BE(at), type = b.toString('latin1', at + 4, at + 8);
    if (type === 'moov') return true;
    if (type === 'mdat' || size === 0) return false;
    at += size === 1 ? Number(b.readBigUInt64BE(at + 8)) : size;
  }
  return false;
}
// El resumen de ebur128 está al final del log; se toma la última aparición de cada medida.
export function parseLoudness(log: string) {
  const last = (pattern: RegExp) => { const found = [...log.matchAll(pattern)].at(-1); return found ? Number(found[1]) : null; };
  return { integrated_lufs: last(/\bI:\s+(-?[\d.]+) LUFS/g), true_peak_dbfs: last(/\bPeak:\s+(-?[\d.]+) dBFS/g) };
}
// Autovalida con lo que mide el propio archivo. Lo que un programa no puede juzgar queda como pendiente de una persona.
export function evaluateOutput(input: { probe: ProbeReport; loudness: string; master: Uint8Array; expectedMs: number }) {
  const streams = input.probe.streams ?? [], video = streams.find(s => s.codec_type === 'video'), audio = streams.find(s => s.codec_type === 'audio');
  const duration = Number(input.probe.format?.duration) * 1000, frames = Number(video?.nb_frames), wantedFrames = Math.round(input.expectedMs * 30 / 1000);
  const { integrated_lufs, true_peak_dbfs } = parseLoudness(input.loudness);
  const row = (check: string, passed: boolean, detail: unknown) => ({ check, status: passed ? 'PASS' : 'FAIL', detail });
  const checks = [
    row('video_codec', video?.codec_name === 'h264', video?.codec_name ?? null),
    row('audio_codec', audio?.codec_name === 'aac', audio?.codec_name ?? null),
    row('resolution', video?.width === 1080 && video?.height === 1920, `${video?.width}x${video?.height}`),
    row('sample_aspect', !video?.sample_aspect_ratio || video.sample_aspect_ratio === '1:1', video?.sample_aspect_ratio ?? null),
    row('frame_rate', video?.avg_frame_rate === '30/1', video?.avg_frame_rate ?? null),
    row('pixel_format', video?.pix_fmt === 'yuv420p', video?.pix_fmt ?? null),
    row('duration', Math.abs(duration - input.expectedMs) <= 200, { measured_ms: duration, expected_ms: input.expectedMs }),
    row('frame_count', Math.abs(frames - wantedFrames) <= 1, { measured: frames, expected: wantedFrames }),
    row('av_sync', Math.abs(Number(audio?.duration) - Number(video?.duration)) <= 0.1, { audio: audio?.duration ?? null, video: video?.duration ?? null }),
    row('audio_layout', audio?.sample_rate === '48000' && audio?.channels === 2, { sample_rate: audio?.sample_rate ?? null, channels: audio?.channels ?? null }),
    row('faststart', isFaststart(input.master), null),
    row('loudness', integrated_lufs !== null && Math.abs(integrated_lufs - LOUDNESS_TARGET) <= LOUDNESS_TOLERANCE, { integrated_lufs, target: LOUDNESS_TARGET }),
    row('no_clipping', true_peak_dbfs !== null && true_peak_dbfs <= MAX_TRUE_PEAK, { true_peak_dbfs, max: MAX_TRUE_PEAK }),
  ];
  return { passed: checks.every(c => c.status === 'PASS'), checks, needs_human: ['subtitle_legibility', 'motion_quality', 'visual_variety', 'audible_mix'] };
}
