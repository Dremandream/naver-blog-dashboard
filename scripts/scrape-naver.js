/**
 * 네이버 블로그 이웃새글 수집기 v2
 * 방식: Playwright 네트워크 인터셉션 (CSS 셀렉터 불필요)
 * - Naver SPA가 로드될 때 발생하는 XHR/fetch 응답을 직접 캡처
 * - AngularJS 렌더링 완료 여부와 무관하게 안정적으로 동작
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '../public/data/posts.json');
const MAX_POSTS = 20;
const TODAY = new Date().toLocaleDateString('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).replace(/\. /g, '-').replace('.', '');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── Claude 요약 ────────────────────────────────────────────────────────────
async function analyzePost(title, content, blogName) {
  const prompt = `다음 블로그 글을 투자 관점으로 분석하세요.

블로그: ${blogName}
제목: ${title}
본문 (최대 2000자): ${content.slice(0, 2000)}

반드시 아래 JSON만 출력하세요 (마크다운 없이):
{
  "summary": "2~3문장 투자 관점 요약",
  "stocks": ["언급 종목명 (없으면 빈 배열)"],
  "sector": "반도체|2차전지|플랫폼|바이오|금융|에너지|기타",
  "signal": "매수|중립|매도",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]
}`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(text);
  } catch (e) {
    console.warn('  AI 분석 실패, 기본값 사용:', e.message);
    return { summary: title, stocks: [], sector: '기타', signal: '중립', key_points: [] };
  }
}

// ─── 네이버 블로그 본문 추출 ─────────────────────────────────────────────────
async function fetchPostContent(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    let text = '';
    for (const frame of page.frames()) {
      const t = await frame.evaluate(() => {
        const sel = '#postViewArea, .se-main-container, .post-view, #post-area, .blog_main';
        const el = document.querySelector(sel);
        return el ? el.innerText?.trim() : '';
      }).catch(() => '');
      if (t && t.length > text.length) text = t;
    }

    if (text.length < 50) {
      text = await page.evaluate(() => document.body.innerText?.slice(0, 2000) ?? '');
    }

    return text;
  } finally {
    await page.close();
  }
}

// ─── 이웃새글 목록 수집 (API 인터셉션) ──────────────────────────────────────
async function scrapePostList(browser, cookies) {
  // section.blog.naver.com은 headless 봇 차단 → 구버전 URL 사용
  const TARGET = 'https://blog.naver.com/SympathyList.naver';

  // 캡처된 API 응답 저장소
  const capturedPosts = [];
  const seenUrls = new Set();

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    extraHTTPHeaders: {
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  // 봇 감지 우회: navigator.webdriver 숨기기
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await context.addCookies(cookies);

  // ── 네트워크 응답 인터셉션 ───────────────────────────────────────────────
  context.on('response', async (response) => {
    const url = response.url();

    // Naver 블로그 API 패턴 탐지
    const isNaverApi =
      url.includes('section.blog.naver.com') ||
      url.includes('blog.naver.com/api') ||
      url.includes('/BlogFeed') ||
      url.includes('/SympathyFeed') ||
      url.includes('buddyFeeds') ||
      url.includes('sympathyFeeds') ||
      url.includes('followFeeds') ||
      url.includes('/PostList') ||
      url.includes('/Feed') ||
      url.includes('currentPage') ||
      url.includes('groupId');

    if (!isNaverApi) return;

    // JSON 응답만 처리
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;

    try {
      const json = await response.json().catch(() => null);
      if (!json) return;

      console.log(`📡 API 캡처: ${url.slice(0, 100)}`);
      console.log(`   응답 키: ${Object.keys(json).join(', ')}`);

      // 응답 구조에서 포스트 목록 추출 시도
      // Naver API는 다양한 형태로 응답할 수 있음
      const candidates = [
        json?.result?.postList,
        json?.result?.items,
        json?.result?.feeds,
        json?.postList,
        json?.items,
        json?.feeds,
        json?.data?.postList,
        json?.data?.items,
        json?.data?.feeds,
        Array.isArray(json) ? json : null,
      ].filter(Boolean);

      for (const list of candidates) {
        if (!Array.isArray(list) || list.length === 0) continue;

        console.log(`   포스트 목록 발견: ${list.length}개`);

        list.forEach((item) => {
          // 다양한 필드명 처리
          const postUrl =
            item?.blogUrl || item?.url || item?.link ||
            (item?.blogId && item?.logNo
              ? `https://blog.naver.com/${item.blogId}/${item.logNo}`
              : null);

          if (!postUrl || seenUrls.has(postUrl)) return;
          if (!postUrl.match(/blog\.naver\.com\/[^/]+\/\d+/)) return;

          seenUrls.add(postUrl);

          const title =
            item?.title || item?.postTitle || item?.subject || '(제목 없음)';
          const blog_name =
            item?.blogName || item?.nickName || item?.nick ||
            item?.author || item?.writerName || '알 수 없음';

          capturedPosts.push({ title, url: postUrl, blog_name });
        });
      }
    } catch (e) {
      // JSON 파싱 실패 → 무시
    }
  });

  const page = await context.newPage();

  try {
    console.log('🌐 페이지 로드 시작...');
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // API 호출이 완료될 때까지 대기 (네트워크 응답 수집용)
    await page.waitForTimeout(5000);

    // 로그인 확인
    const currentUrl = page.url();
    const title = await page.title();
    console.log(`📄 현재 페이지: "${title}" (${currentUrl})`);

    if (currentUrl.includes('nid.naver.com') || title.includes('로그인')) {
      console.error('❌ 네이버 로그인 페이지로 리다이렉트됨. 쿠키가 만료되었습니다.');
      process.exit(1);
    }
    if (title.includes('Access Denied') || title.includes('접근 거부')) {
      console.error('❌ Access Denied - Naver 봇 차단. 쿠키 재확인 필요.');
      process.exit(1);
    }

    // 스크롤로 추가 API 호출 유도
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(1000);
    }

    // 추가 API 응답 대기
    await page.waitForTimeout(2000);

    console.log(`\n📊 API 인터셉션으로 수집된 포스트: ${capturedPosts.length}개`);

    // API 인터셉션으로 못 가져온 경우 → DOM fallback
    if (capturedPosts.length === 0) {
      console.log('⚠️ API 인터셉션 실패 → DOM 직접 추출 시도');

      // 페이지 HTML 전체 덤프 (디버그용)
      const html = await page.content();
      const htmlPath = path.join(__dirname, '../public/data/debug_page.html');
      fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
      fs.writeFileSync(htmlPath, html, 'utf-8');
      console.log(`🔍 페이지 HTML 저장됨: ${htmlPath} (${html.length}자)`);

      // DOM에서 blog.naver.com/id/no 패턴 링크 추출
      const domPosts = await page.evaluate(() => {
        const results = [];
        const seen = new Set();
        const links = Array.from(document.querySelectorAll('a[href*="blog.naver.com"]'));
        links.forEach(a => {
          const url = a.href;
          if (seen.has(url) || !url.match(/blog\.naver\.com\/[^/]+\/\d+/)) return;
          seen.add(url);
          // 부모 요소에서 블로그명 찾기
          const parent = a.closest('[class*="item"], [class*="post"], li, article') || a.parentElement;
          const blogEl = parent?.querySelector('[class*="nick"], [class*="writer"], [class*="blog_name"], [class*="author"]');
          results.push({
            title: a.textContent?.trim() || '(제목 없음)',
            url,
            blog_name: blogEl?.textContent?.trim() || '알 수 없음',
          });
        });
        return results;
      });

      console.log(`   DOM fallback: ${domPosts.length}개 링크 발견`);
      capturedPosts.push(...domPosts);
    }

  } finally {
    await page.close();
    await context.close();
  }

  return capturedPosts;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📅 ${TODAY} 이웃새글 수집 시작 (v2: API 인터셉션)`);

  // 쿠키 파싱
  const cookieStr = process.env.NAVER_COOKIE || '';
  if (!cookieStr) {
    console.warn('⚠️  NAVER_COOKIE 미설정. 비로그인 상태로 시도합니다.');
  }

  const cookies = cookieStr
    .split(';')
    .map(c => {
      const idx = c.indexOf('=');
      if (idx < 0) return null;
      return {
        name: c.slice(0, idx).trim(),
        value: c.slice(idx + 1).trim(),
        domain: '.naver.com',
        path: '/',
      };
    })
    .filter(Boolean);

  console.log(`🍪 쿠키 ${cookies.length}개 준비`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    // 기존 posts.json 로드 (중복 방지)
    let existingUrls = new Set();
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
      if (existing.date === TODAY && Array.isArray(existing.posts)) {
        existingUrls = new Set(existing.posts.map(p => p.url));
        console.log(`♻️  기존 데이터 ${existingUrls.size}개 URL 로드`);
      }
    } catch { /* posts.json 없으면 무시 */ }

    // 이웃새글 수집
    const rawPosts = await scrapePostList(browser, cookies);
    console.log(`\n📋 총 ${rawPosts.length}개 발견`);

    if (rawPosts.length === 0) {
      console.error('❌ 글 목록이 비어있습니다.');
      console.error('   → 쿠키 만료 또는 Naver API 구조 변경 가능성');
      await browser.close();
      process.exit(1);
    }

    // 중복 제거 및 최대 개수 제한
    const limited = rawPosts
      .filter(p => !existingUrls.has(p.url))
      .slice(0, MAX_POSTS);

    console.log(`🆕 신규 ${limited.length}개 처리 예정`);

    // 본문 수집용 context
    const contentContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ko-KR',
    });
    await contentContext.addCookies(cookies);

    const results = [];

    for (let i = 0; i < limited.length; i++) {
      const post = limited[i];
      console.log(`\n[${i + 1}/${limited.length}] ${post.blog_name} - ${post.title}`);

      const content = await fetchPostContent(contentContext, post.url).catch(e => {
        console.warn('  본문 실패:', e.message);
        return '';
      });
      console.log(`  본문 ${content.length}자`);

      if (content.length < 30) {
        console.warn('  ⚠️ 본문 짧음 → AI 분석 스킵');
        results.push({
          id: String(Date.now()) + String(i),
          date: TODAY,
          blog_name: post.blog_name,
          title: post.title,
          url: post.url,
          summary: '본문 추출 실패 (비공개 글이거나 이미지 전용 글)',
          stocks: [], sector: '기타', signal: '중립', key_points: [],
        });
        continue;
      }

      const analysis = await analyzePost(post.title, content, post.blog_name);
      console.log(`  → ${analysis.sector} | ${analysis.signal} | ${analysis.stocks.join(', ')}`);

      results.push({
        id: String(Date.now()) + String(i),
        date: TODAY,
        blog_name: post.blog_name,
        title: post.title,
        url: post.url,
        summary: analysis.summary,
        stocks: analysis.stocks,
        sector: analysis.sector,
        signal: analysis.signal,
        key_points: analysis.key_points,
      });

      if (i < limited.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    await contentContext.close();

    // 저장
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ date: TODAY, posts: results }, null, 2), 'utf-8');
    console.log(`\n✅ 완료: ${results.length}개 저장 → ${OUTPUT_PATH}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('\n🔥 오류:', err);
  process.exit(1);
});
