/**
 * 검증용: 네이버 모바일 블로그 본문이 단순 HTTP fetch로 잡히는지 테스트
 * 실행: node scripts/test-fetch-body.js
 * 성공 기준: 본문 길이 2000자 이상 + 글 내용 텍스트 출력
 */

import https from 'https';

// 테스트 대상: 본문 긴 글 1개 + RSS 본문 없는 블로그 글 1개
const TEST_URLS = [
  'https://m.blog.naver.com/audistar/224337637035', // 콤디티 - 삼성전자 2Q26 (본문 긴 글)
];

function fetchMobile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    }, (res) => {
      // 리다이렉트 따라가기
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://m.blog.naver.com${res.headers.location}`;
        console.log(`  ↪ 리다이렉트: ${res.statusCode} → ${next}`);
        return fetchMobile(next).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

function extractBody(html) {
  // SmartEditor ONE 본문
  let m = html.match(/<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*se_component_wrap/)
       || html.match(/<div[^>]*class="[^"]*se-main-container[^"]*"[^>]*>([\s\S]*)/);
  // 구버전 에디터
  if (!m) m = html.match(/<div[^>]*id="viewTypeSelector"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*post_footer/);
  if (!m) return null;

  return m[1]
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

for (const url of TEST_URLS) {
  console.log(`\n🔍 테스트: ${url}`);
  try {
    const { status, html } = await fetchMobile(url);
    console.log(`  HTTP ${status}, HTML ${html.length.toLocaleString()}자`);

    const body = extractBody(html);
    if (!body) {
      console.log('  ❌ 본문 추출 실패 — HTML 구조 확인 필요');
      console.log('  se-main-container 포함 여부:', html.includes('se-main-container'));
      console.log('  viewTypeSelector 포함 여부:', html.includes('viewTypeSelector'));
    } else {
      console.log(`  ✅ 본문 추출 성공: ${body.length.toLocaleString()}자`);
      console.log(`  ── 앞 500자 ──\n${body.slice(0, 500)}`);
    }
  } catch (e) {
    console.log(`  ❌ 요청 실패: ${e.message}`);
  }
}
