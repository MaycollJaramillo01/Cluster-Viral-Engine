import type { Cue } from '../phase00/contract';

// El acta de F00 enlaza phase00/subtitles.ts por hash, así que no se toca. Aquí el rótulo baja a la zona segura: margen superior 200 frente a 70.
// Márgenes y colores del estilo: la QA de F04 los comprueba, no los supone.
export const captionLayout = { width: 1080, height: 1920, margin_side: 110, margin_bottom: 340, margin_top: 200, text_rgb: 0xFFFFFF, outline_rgb: 0x101010 };
const { margin_side: side, margin_bottom: bottom, margin_top: top } = captionLayout;
const pad = (n: number) => String(n).padStart(2, '0');
const parts = (ms: number) => ({ hours: Math.floor(ms / 3600000), minutes: pad(Math.floor(ms / 60000) % 60), seconds: pad(Math.floor(ms / 1000) % 60) });
const srtClock = (ms: number) => { const { hours, minutes, seconds } = parts(ms); return `${pad(hours)}:${minutes}:${seconds},${String(ms % 1000).padStart(3, '0')}`; };
const assClock = (ms: number) => { const { hours, minutes, seconds } = parts(ms); return `${hours}:${minutes}:${seconds}.${pad(Math.floor(ms % 1000 / 10))}`; };
export const toSrt = (cues: Cue[]) => cues.map((c, i) => `${i + 1}\n${srtClock(c.start_ms)} --> ${srtClock(c.end_ms)}\n${c.text}\n`).join('\n');
export const toAss = (cues: Cue[], overlays: Cue[]) => `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,44,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,0,0,0,0,100,100,0,0,1,3,0,2,${side},${side},${bottom},1\nStyle: Overlay,Arial,30,&H00FFFFFF,&H00FFFFFF,&H00101010,&H88000000,0,0,0,0,100,100,0,0,1,2,0,8,${side},${side},${top},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
  cues.map(c => `Dialogue: 0,${assClock(c.start_ms)},${assClock(c.end_ms)},Default,,0,0,0,,${c.text}`).join('\n') + '\n' +
  overlays.map(o => `Dialogue: 1,${assClock(o.start_ms)},${assClock(o.end_ms)},Overlay,,0,0,0,,${o.text}`).join('\n');
