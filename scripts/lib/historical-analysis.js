import { parseJSONLoose } from './parsers.js';

const MODEL = 'claude-haiku-4-5-20251001';

export function buildHistoricalRepairPrompt(raw) {
  return `다음 텍스트는 투자 의견 추출용 JSON 응답이지만 형식이 깨졌습니다.
의미와 이미 완성된 값만 보존해 유효한 JSON 객체로 복구하세요.
잘린 배열 항목이나 불완전한 의견은 추측해서 채우지 말고 제거하세요.
설명이나 코드펜스 없이 JSON만 출력하세요.

${String(raw).slice(0, 12000)}`;
}

export async function requestHistoricalJSON(client, prompt, options = {}) {
  const maxAttempts = options.maxAttempts || 5;
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let repairSource = '';
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const repairing = Boolean(repairSource);
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: repairing ? 1800 : 900,
        messages: [{
          role: 'user',
          content: repairing ? buildHistoricalRepairPrompt(repairSource) : prompt,
        }],
      });
      const raw = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      try {
        return parseJSONLoose(raw);
      } catch (error) {
        repairSource = raw;
        lastError = error;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts) {
      await wait(Math.min(1000 * 2 ** (attempt - 1), 16000));
    }
  }

  throw lastError;
}
