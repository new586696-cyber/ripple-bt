/** Audio helpers for voice messages: waveform extraction and formatting. */

export const WAVEFORM_BUCKETS = 48;

/** Decodes a recorded blob and downsamples it to normalised 0–1 peaks. */
export async function extractWaveform(
  blob: Blob,
  buckets = WAVEFORM_BUCKETS,
): Promise<number[]> {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return fallbackWaveform(buckets);
    const ctx = new Ctx();
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const size = Math.floor(channel.length / buckets) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < buckets; i += 1) {
      let sum = 0;
      const start = i * size;
      const end = Math.min(start + size, channel.length);
      for (let j = start; j < end; j += 1) sum += (channel[j] ?? 0) ** 2;
      peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
    }
    void ctx.close();
    const max = Math.max(...peaks, 0.0001);
    return peaks.map((p) => Math.min(1, Math.max(0.06, p / max)));
  } catch {
    return fallbackWaveform(buckets);
  }
}

function fallbackWaveform(buckets: number) {
  return Array.from({ length: buckets }, (_, i) => 0.25 + Math.abs(Math.sin(i / 2.2)) * 0.6);
}

export function readWaveform(meta: unknown, buckets = WAVEFORM_BUCKETS): number[] {
  const raw = (meta as { waveform?: unknown } | null)?.waveform;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((v) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.min(1, Math.max(0.06, n)) : 0.2;
    });
  }
  return fallbackWaveform(buckets);
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
