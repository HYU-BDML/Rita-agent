/** 썸네일 한 장이 몇 토큰인지 실측한다. count_tokens 는 무료다. */
import { promises as fs } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const DIR = 'C:/Users/mooja/AppData/Local/Temp';
const PROMPT =
  '이 영상 썸네일에 박힌 글자를 그대로 옮겨 적어라. 없으면 빈 문자열. 설명하지 말고 글자만.';

async function main() {
  const client = new Anthropic();
  for (const f of ['th0.jpg', 'th1.jpg', 'th2.jpg']) {
    const data = (await fs.readFile(`${DIR}/${f}`)).toString('base64');
    const content = [
      { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data } },
      { type: 'text' as const, text: PROMPT },
    ];
    for (const model of ['claude-opus-5', 'claude-haiku-4-5']) {
      const r = await client.messages.countTokens({ model, messages: [{ role: 'user', content }] });
      console.log(`${f}  ${model.padEnd(16)} 입력 ${r.input_tokens.toLocaleString('ko-KR')} 토큰`);
    }
  }
}
main();
