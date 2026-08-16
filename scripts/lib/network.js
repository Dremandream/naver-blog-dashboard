export function isRetryableNetworkError(error) {
  return /HTTP (429|5\d\d)|abort|timeout|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(String(error?.message || error));
}

export async function fetchTextWithRetry(url, options = {}) {
  const retries = options.retries ?? 4;
  const timeoutMs = options.timeoutMs ?? 20000;
  const fetchImpl = options.fetchImpl || fetch;
  const wait = options.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          ...(options.referer ? { Referer: options.referer } : {}),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt >= retries || !isRetryableNetworkError(error)) throw error;
      await wait(Math.min(1000 * 2 ** attempt, 8000));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function assertNoTransientSourceFailures(sources) {
  const failed = (sources || []).filter((source) => source.error && isRetryableNetworkError(source.error));
  if (failed.length) {
    const labels = failed.map((source) => `${source.person || source.id}: ${source.error}`).join(', ');
    throw new Error(`과거 원문 수집이 완료되지 않았습니다 (${labels}). 부분 데이터를 배포하지 않고 다시 시도합니다.`);
  }
}
