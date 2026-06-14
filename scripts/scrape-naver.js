/**
 * 네이버 블로그 이웃새글 수집기
 * 실행: CLAUDE_API_KEY=... NAVER_COOKIE=... node scripts/scrape-naver.js
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
    return {
      summary: title,
      stocks: [],
      sector: '기타',
      signal: '중립',
      key_points: [],
    };
  }
}

// ─── 네이버 블로그 본문 추출 ─────────────────────────────────────────────────
async function fetchPostContent(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);

    // 네이버 블로그는 mainFrame 안에 iframe 구조
    let text = '';

    // iframe 탐색
    for (const frame of page.frames()) {
      const t = await frame.evaluate(() => {
        const sel = '#postViewArea, .se-main-container, .post-view, #post-area, .blog_main';
        const el = document.querySelector(sel);
        return el ? el.innerText?.trim() : '';
      }).catch(() => '');
      if (t && t.length > text.length) text = t;
    }

    // fallback: body 전체
    if (text.length < 50) {
      text = await page.evaluate(() => document.body.innerText?.slice(0, 2000) ?? '');
    }

    return text;
  } finally {
    await page.close();
  }
}

// ─── 이웃새글 목록 파싱 ──────────────────────────────────────────────────────
async function scrapePostList(page) {
  // 섹션 블로그 이웃새글 페이지
  const TARGET = 'https://section.blog.naver.com/BlogHome.naver?directoryNo=0&currentPage=1&groupId=0';

  // AngularJS SPA: domcontentloaded 후 렌더링 대기
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 이웃새글 아이템이 DOM에 나타날 때까지 최대 15초 대기
  try {
    await page.waitForSelector(
      '.post_article_comments, .list_post_article, .item.multi_pic, .item.basic',
      { timeout: 15000 }
    );
    console.log('✅ 이웃새글 섹션 로드 확인');
  } catch {
    console.warn('⚠️ waitForSelector 타임아웃 - 3초 추가 대기 후 계속');
    await page.waitForTimeout(3000);
  }

  // [수정 B] 로그인 페이지 리다이렉트 감지
  const currentUrl = page.url();
  const title = await page.title();
  console.log(`📄 현재 페이지: "${title}" (${currentUrl})`);
  if (
    currentUrl.includes('nid.naver.com') ||
    title.includes('로그인') ||
    title.toLowerCase().includes('login')
  ) {
    console.error('❌ 네이버 로그인 페이지로 리다이렉트됨. 쿠키가 만료되었습니다.');
    console.error('   GitHub Secrets의 NAVER_COOKIE를 갱신해주세요.');
    process.exit(1);
  }

  // 스크롤로 더 많은 글 로드
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(600);
  }

  // 디버그: 현재 페이지 HTML 일부 출력
  const debugHtml = await page.evaluate(() => document.body.innerHTML.slice(0, 3000));
  console.log('\n🔍 페이지 HTML 샘플 (앞 3000자):\n', debugHtml.slice(0, 1500));

  const posts = await page.evaluate(() => {
    const results = [];

    // ── 1단계: 이웃새글 섹션 컨테이너 탐색 ──────────────────────────────────
    // DevTools breadcrumb: post_article_comments → div.item.multi_pic → ...
    const containerSelectors = [
      '.post_article_comments',
      '#post_article_comments',
      '.list_post_article',
      '.area_buddy',
      '.section_buddy',
      '[class*="post_article"]',
      '[id*="post_article"]',
    ];

    let container = null;
    let foundContainerSel = '';
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) { container = el; foundContainerSel = sel; break; }
    }
    console.log('[scraper] 컨테이너:', foundContainerSel || '못 찾음 (전체 페이지 탐색)');

    const scope = container || document;

    // ── 2단계: 아이템 탐색 ────────────────────────────────────────────────────
    // DevTools: div.item.multi_pic (또는 div.item)
    let items = Array.from(scope.querySelectorAll('div.item.multi_pic, div.item.basic'));
    if (items.length === 0) items = Array.from(scope.querySelectorAll('.item'));
    console.log('[scraper] 아이템 수:', items.length);

    items.forEach((item) => {
      // ── URL: blog.naver.com/userid/postno 형식 ────────────────────────────
      // a.text 가 briefContents 링크 (DevTools 확인됨)
      // 제목 링크는 a.title 또는 별도 요소일 가능성
      const allLinks = Array.from(item.querySelectorAll('a[href*="blog.naver.com"]'));
      const postLink = allLinks.find(a => /blog\.naver\.com\/[^/]+\/\d+/.test(a.href));
      if (!postLink) return;

      const url = postLink.href;

      // ── 제목: 여러 셀렉터 순차 시도 ─────────────────────────────────────
      const titleEl = item.querySelector(
        'a.title, .tit_post, strong.title, .title_post, .tit a, ' +
        '.info_post a.title, a[class*="title"], .subject, .post_title'
      );
      // a.text = 발췌(excerpt), 제목 못 찾으면 fallback
      const excerptEl = item.querySelector('a.text, .desc .text, .desc a');

      let title = titleEl?.textContent?.trim();
      if (!title || title.length < 2) {
        title = excerptEl?.textContent?.trim()?.slice(0, 80) || '(제목 없음)';
      }

      // ── 블로그명: 여러 셀렉터 순차 시도 ────────────────────────────────
      const blogEl = item.querySelector(
        '.nick, .blog_name, .writer, .author, ' +
        '.info_writer .nick, .name_writer, .tit_writer, ' +
        '.profile_area .nick, .writer_info .name, ' +
        '.area_writer .nick, [class*="nick"], [class*="writer"]'
      );
      const blog_name = blogEl?.textContent?.trim() || '알 수 없음';

      results.push({ title, url, blog_name });
    });

    // ── 3단계: 아이템을 못 찾았을 때만 fallback (핫토픽 제외 시도) ─────────
    if (results.length === 0) {
      console.log('[scraper] fallback: a 태그 전수 탐색 (이웃새글 섹션 우선)');
      // 핫토픽/광고 등 제외하기 위해 이웃새글 섹션 기준으로 제한
      const buddySection = document.querySelector(
        '.area_buddy, .section_buddy, [class*="buddy"], [class*="post_article"]'
      );
      const searchBase = buddySection || document;
      const links = Array.from(searchBase.querySelectorAll('a[href*="blog.naver.com"]'));
      const seen = new Set();
      links.forEach(a => {
        const url = a.href;
        if (seen.has(url) || !url.match(/blog\.naver\.com\/[^/]+\/\d+/)) return;
        seen.add(url);
        results.push({ title: a.textContent?.trim() || '(제목 없음)', url, blog_name: '알 수 없음' });
      });
    }

    return results;
  });

  return posts;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📅 ${TODAY} 이웃새글 수집 시작`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });

  // ── 네이버 쿠키 주입 ──────────────────────────────────────────────────────
  const cookieStr = process.env.NAVER_COOKIE || '';
  if (!cookieStr) {
    console.warn('⚠️  NAVER_COOKIE 미설정. 비로그인 상태로 시도합니다.');
  } else {
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
    await context.addCookies(cookies);
    console.log(`🍪 쿠키 ${cookies.length}개 주입 완료`);
  }

  const page = await context.newPage();

  try {
    // [수정 F] 기존 posts.json의 URL 목록 로드 (중복 분석 방지)
    let existingUrls = new Set();
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
      if (existing.date === TODAY && Array.isArray(existing.posts)) {
        existingUrls = new Set(existing.posts.map(p => p.url));
        console.log(`♻️  기존 데이터 ${existingUrls.size}개 URL 로드 (중복 스킵용)`);
      }
    } catch {
      // posts.json 없으면 무시
    }

    // 이웃새글 목록 수집
    const rawPosts = await scrapePostList(page);
    console.log(`\n📋 이웃새글 ${rawPosts.length}개 발견`);

    if (rawPosts.length === 0) {
      console.error('❌ 글 목록이 비어있습니다. 쿠키를 확인하거나 URL 구조가 바뀌었을 수 있습니다.');
      await browser.close();
      process.exit(1);
    }

    // 최대 MAX_POSTS개, 중복 URL 제외
    const limited = rawPosts
      .filter(p => !existingUrls.has(p.url))
      .slice(0, MAX_POSTS);

    console.log(`🆕 신규 글 ${limited.length}개 처리 예정 (중복 ${rawPosts.length - limited.length - Math.max(0, rawPosts.length - MAX_POSTS)}개 스킵)`);

    const results = [];

    for (let i = 0; i < limited.length; i++) {
      const post = limited[i];
      console.log(`\n[${i + 1}/${limited.length}] ${post.blog_name} - ${post.title}`);

      // 본문 가져오기
      const content = await fetchPostContent(context, post.url).catch(e => {
        console.warn('  본문 실패:', e.message);
        return '';
      });
      console.log(`  본문 ${content.length}자`);

      // [수정 E] 빈 본문이면 Claude API 스킵
      if (content.length < 30) {
        console.warn('  ⚠️ 본문이 너무 짧아 AI 분석 스킵');
        results.push({
          id: String(Date.now()) + String(i),
          date: TODAY,
          blog_name: post.blog_name,
          title: post.title,
          url: post.url,
          summary: '본문 추출 실패 (비공개 글이거나 이미지 전용 글)',
          stocks: [],
          sector: '기타',
          signal: '중립',
          key_points: [],
        });
        continue;
      }

      // Claude 분석
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

      // Rate limit 방지
      if (i < limited.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    // ── posts.json 저장 ────────────────────────────────────────────────────
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
