import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { probe } from './ffmpeg';
import { safeId, userVideoDir } from './paths';
import { mediaSource } from './manifest';
import { videoStore, type AudioRow } from './db';
/** F043 background music upload: mp3/m4a/wav, at most 10 MB decoded, license note required. */
export const AUDIO_MAX_BYTES = 10 * 1024 * 1024;
export const audioExt = (b: Buffer): 'mp3' | 'm4a' | 'wav' | null => {
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') return 'm4a';
  if (b.length > 3 && (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return 'mp3';
  return null;
};
export const audioPath = (userId: string, row: Pick<AudioRow, 'id' | 'ext'>) => path.join(userVideoDir(userId, 'audio'), `${safeId(row.id)}.${row.ext}`);
export function parseAudioUpload(b: Record<string, unknown>) {
  const license = typeof b.license === 'string' ? b.license.trim() : '';
  if (!license || license.length > 200 || /[\u0000-\u001f]/.test(license)) throw new Error('배경음악의 이용 조건(라이선스) 메모를 1~200자로 적어 주세요.');
  const name = typeof b.name === 'string' ? b.name.replace(/[\u0000-\u001f/\\]/g, '').trim().slice(0, 80) : '';
  if (!name) throw new Error('배경음악 이름이 필요합니다.');
  if (typeof b.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)) throw new Error('오디오 데이터는 base64 문자열이어야 합니다.');
  if (b.data.length > Math.ceil(AUDIO_MAX_BYTES / 3) * 4 + 4) throw new Error('오디오 파일은 10MB 이하여야 합니다.');
  const bytes = Buffer.from(b.data, 'base64'); if (bytes.length > AUDIO_MAX_BYTES) throw new Error('오디오 파일은 10MB 이하여야 합니다.');
  const ext = audioExt(bytes); if (!ext) throw new Error('mp3, m4a, wav 오디오만 올릴 수 있습니다.');
  return { license, name, bytes, ext, source: mediaSource(b.source, 'user-upload') };
}
export async function saveAudio(userId: string, b: Record<string, unknown>) {
  const a = parseAudioUpload(b); const dir = userVideoDir(userId, 'audio'); await mkdir(dir, { recursive: true });
  const id = randomUUID(), tmp = path.join(dir, `${id}.tmp`), final = path.join(dir, `${id}.${a.ext}`);
  try {
    await writeFile(tmp, a.bytes); await rename(tmp, final);
    const info = await probe(final);
    if (!info.hasAudio || !(info.duration > 0.5) || info.duration > 1800) throw new Error('재생할 수 있는 오디오(0.5초~30분)가 아닙니다.');
    return videoStore().addAudio(userId, { name: a.name, ext: a.ext, bytes: a.bytes.length, license: a.license, source: a.source, duration: Math.round(info.duration * 10) / 10 }, id);
  } catch (e) { await rm(tmp, { force: true }); await rm(final, { force: true }); throw e; }
}
export async function removeAudio(userId: string, id: string) {
  const row = videoStore().getAudio(userId, id); if (!row) return false;
  videoStore().deleteAudio(userId, id); await rm(audioPath(userId, row), { force: true }); return true;
}
