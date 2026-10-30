import type { Cue, Manifest } from './contract';

function clock(ms: number, ass = false) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ass ? hours : p(hours)}:${p(minutes)}:${p(seconds)}${ass ? '.' : ','}${ass ? p(Math.floor(ms % 1000 / 10)) : String(ms % 1000).padStart(3, '0')}`;
}
export function subtitles(m: Manifest): { srt: string; ass: string } {
  const cues = m.scenes.flatMap(s => s.subtitle_segments.map(c => ({ ...c, start_ms: c.start_ms + s.start_ms, end_ms: c.end_ms + s.start_ms })));
  const overlays = m.scenes.map(s => `Dialogue: 1,${clock(s.start_ms, true)},${clock(s.start_ms + s.duration_ms, true)},Overlay,,0,0,0,,${s.overlay}`).join('\n');
  return {
    srt: cues.map((c, i) => `${i + 1}\n${clock(c.start_ms)} --> ${clock(c.end_ms)}\n${c.text}\n`).join('\n'),
    ass: `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,44,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,0,0,0,0,100,100,0,0,1,3,0,2,110,110,340,1\nStyle: Overlay,Arial,30,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,0,0,0,0,100,100,0,0,1,2,0,8,110,110,70,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
      cues.map(c => `Dialogue: 0,${clock(c.start_ms, true)},${clock(c.end_ms, true)},Default,,0,0,0,,${c.text}`).join('\n') + '\n' + overlays,
  };
}

// Provider timestamps only. Never label proportional fixture timings as forced alignment.
export function alignmentToCues(characters: string[], starts: number[], ends: number[]): Cue[] {
  if (characters.length !== starts.length || starts.length !== ends.length || !characters.length) throw new Error('INVALID_ALIGNMENT');
  const cues: Cue[] = [];
  let text = '', begin = 0, finish = 0;
  for (let i = 0; i < characters.length; i++) {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) || starts[i] < 0 || ends[i] <= starts[i] || (i && starts[i] < ends[i - 1])) throw new Error('INVALID_ALIGNMENT');
    if (!text) begin = starts[i];
    text += characters[i]; finish = ends[i];
    if ((text.length >= 60 && /\s/.test(characters[i])) || /[.!?]/.test(characters[i]) || i === characters.length - 1) {
      const clean = text.trim();
      if (clean.length > 84 || /[{}\\\r\n]/.test(clean)) throw new Error('UNSAFE_OR_LONG_CUE');
      if (clean) cues.push({ start_ms: Math.round(begin * 1000), end_ms: Math.round(finish * 1000), text: clean });
      text = '';
    }
  }
  return cues;
}
