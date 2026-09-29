import { promises as fs } from 'node:fs';
import { characterNativeDiscovery as d } from '../lib/discoveries/character-native';

async function main() {
  const db = JSON.parse(await fs.readFile('data/db.json', 'utf8'));
  const snap = db.snapshots.filter((s: any) => s.discoveryId === 'character-native').pop();
  if (!snap) return console.log('스냅샷 없음');
  const fresh = d
    .normalize(snap.raw, { runId: snap.runId, runAt: snap.at, mock: false })
    .map((c: any) => ({ ...c, origin: { ...c.origin, mock: false } }));
  const prev = new Map<string, any>(db.candidates.map((c: any) => [c.id, c]));
  db.candidates = [
    ...db.candidates.filter((c: any) => c.origin.discoveryId !== 'character-native'),
    ...fresh.map((c: any) => ({ ...c, review: prev.get(c.id)?.review ?? 'pending' })),
  ];
  await fs.writeFile('data/db.json', JSON.stringify(db, null, 2));
  console.log('재정규화 반영:', fresh.length, '건 (API 호출 0회)');
}
main();
