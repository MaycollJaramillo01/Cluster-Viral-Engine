import { z } from 'zod';
import { AppError } from '@cluster/contracts';
import type { VoiceSettings } from './contract';

export type TtsRequest = { voice_id: string; model_id: string; settings: VoiceSettings; text: string };
export type TtsResult = {
  audio: Uint8Array; extension: 'mp3' | 'wav'; mime_type: string; duration_ms: number;
  alignment: { characters: string[]; starts: number[]; ends: number[] };
  timing_source: 'PROVIDER' | 'SYNTHETIC'; billed_chars: number; request_id: string | null;
};
export type TtsProvider = { name: string; usdPer1kChars: number; synthesize(request: TtsRequest): Promise<TtsResult> };
// RATE_LIMITED y UPSTREAM no cobran y admiten reintento. REJECTED y AUTH requieren intervención.
// NO_RESPONSE y MALFORMED pudieron cobrarse: no se repiten sin confirmación.
export type TtsErrorCode = 'RATE_LIMITED' | 'UPSTREAM' | 'REJECTED' | 'AUTH' | 'NO_RESPONSE' | 'MALFORMED';
export class TtsError extends Error {
  constructor(public code: TtsErrorCode, public retryAfterSeconds: number | null = null) { super(code); }
}

const responseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: z.object({ characters: z.array(z.string()).min(1), character_start_times_seconds: z.array(z.number()), character_end_times_seconds: z.array(z.number()) }),
});
// BLOCKED_EXTERNAL: forma tomada de la referencia pública with-timestamps, probada solo contra un servidor falso. Sin clave no se ha llamado a la API real.
// Las cabeceras xi-api-key, character-cost y request-id no figuran en esa página: comprobarlas con la primera llamada real.
export function elevenLabsProvider(apiKey: string, usdPer1kChars: number, fetcher: typeof fetch = fetch, timeoutMs = 60000): TtsProvider {
  return {
    name: 'elevenlabs', usdPer1kChars,
    async synthesize(request) {
      let response: Response;
      try {
        response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(request.voice_id)}/with-timestamps?output_format=mp3_44100_128`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ text: request.text, model_id: request.model_id, voice_settings: request.settings }),
        });
      } catch { throw new TtsError('NO_RESPONSE'); }
      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after'));
        throw new TtsError('RATE_LIMITED', Number.isFinite(wait) && wait >= 0 ? wait : null);
      }
      if (response.status === 401 || response.status === 403) throw new TtsError('AUTH');
      if (response.status >= 500) throw new TtsError('UPSTREAM');
      if (!response.ok) throw new TtsError('REJECTED');
      let parsed: z.infer<typeof responseSchema>;
      try { parsed = responseSchema.parse(await response.json()); } catch { throw new TtsError('MALFORMED'); }
      const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = parsed.alignment;
      const billed = Number(response.headers.get('character-cost'));
      return { audio: Buffer.from(parsed.audio_base64, 'base64'), extension: 'mp3', mime_type: 'audio/mpeg', duration_ms: Math.ceil((ends.at(-1) ?? 0) * 1000), alignment: { characters, starts, ends },
        timing_source: 'PROVIDER', billed_chars: Number.isFinite(billed) && billed > 0 ? billed : request.text.length, request_id: response.headers.get('request-id') };
    },
  };
}

// Tono audible, no silencio: la mezcla y la medición de loudness de F05 necesitan señal.
export function toneWav(milliseconds: number) {
  const rate = 8000, samples = Math.round(milliseconds * rate / 1000), out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples * 2, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) out.writeInt16LE(Math.round(4000 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
  return out;
}
const MOCK_MS_PER_CHAR = 65;
// BLOCKED_EXTERNAL: no es voz. Los tiempos son proporcionales y quedan marcados SYNTHETIC: no prueban sincronización real.
export const mockTts = (usdPer1kChars = 0): TtsProvider => ({
  name: 'mock-elevenlabs', usdPer1kChars,
  async synthesize(request) {
    const characters = Array.from(request.text), duration_ms = characters.length * MOCK_MS_PER_CHAR;
    return { audio: toneWav(duration_ms), extension: 'wav', mime_type: 'audio/wav', duration_ms, timing_source: 'SYNTHETIC', billed_chars: request.text.length, request_id: null,
      alignment: { characters, starts: characters.map((_, i) => i * MOCK_MS_PER_CHAR / 1000), ends: characters.map((_, i) => (i + 1) * MOCK_MS_PER_CHAR / 1000) } };
  },
});
export function ttsFromEnv(env: Record<string, string | undefined>): TtsProvider {
  if (env.APP_ENV === 'local' && env.TTS_PROVIDER === 'mock') return mockTts();
  // Sin tarifa no hay presupuesto que aplicar: no se usa la API aunque exista la clave.
  const rate = Number(env.ELEVENLABS_USD_PER_1K_CHARS);
  if (env.TTS_PROVIDER === 'elevenlabs' && env.ELEVENLABS_API_KEY && rate > 0) return elevenLabsProvider(env.ELEVENLABS_API_KEY, rate);
  throw new AppError('BLOCKED_EXTERNAL', 503);
}
export const limitsFromEnv = (env: Record<string, string | undefined>) => ({ maxUsdPerVideo: Number(env.MAX_COST_USD_PER_VIDEO) || 3 });
export type SpendLimits = ReturnType<typeof limitsFromEnv>;
