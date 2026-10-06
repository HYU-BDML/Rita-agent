import { spawn } from 'node:child_process';
export const ffmpegBin = () => process.env.CORA_FFMPEG || 'ffmpeg';
export const ffprobeBin = () => process.env.CORA_FFPROBE || 'ffprobe';
/** Runs a binary with an argument array (never a shell), a hard time limit, and returns captured output. */
export function run(bin: string, args: string[], opts: { timeoutMs?: number; input?: string | Buffer; failMessage: string; timeoutMessage?: string }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const p = spawn(bin, args, { stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const finish = (fn: () => void) => { if (done) return; done = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => { p.kill('SIGKILL'); finish(() => reject(new Error(opts.timeoutMessage || '렌더 시간 초과'))); }, opts.timeoutMs ?? 120000);
    p.stdout!.on('data', d => { if (stdout.length < 1_000_000) stdout += d; });
    p.stderr!.on('data', d => { stderr = (stderr + d).slice(-4000); });
    p.on('error', () => finish(() => reject(new Error('FFmpeg 설치 경로를 확인해 주세요.'))));
    p.on('close', code => finish(() => code === 0 ? resolve({ stdout, stderr }) : reject(Object.assign(new Error(opts.failMessage), { stderr }))));
    if (opts.input !== undefined) { p.stdin!.on('error', () => {}); p.stdin!.end(opts.input); }
  });
}
export interface Probe { duration: number; width: number; height: number; hasVideo: boolean; hasAudio: boolean; subtitleLanguages: string[] }
export async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(ffprobeBin(), ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:stream_tags=language:format=duration', '-of', 'json', file], { timeoutMs: 20000, failMessage: '미디어 파일을 읽을 수 없습니다.' });
  const j = JSON.parse(stdout) as { streams?: { codec_type: string; width?: number; height?: number; tags?: { language?: string } }[]; format?: { duration?: string } };
  const v = j.streams?.find(s => s.codec_type === 'video');
  return { duration: Number(j.format?.duration) || 0, width: v?.width ?? 0, height: v?.height ?? 0, hasVideo: !!v, hasAudio: !!j.streams?.some(s => s.codec_type === 'audio'), subtitleLanguages: (j.streams ?? []).filter(s => s.codec_type === 'subtitle').map(s => s.tags?.language ?? '') };
}
