/**
 * RSS 기반 네이버 블로그 이웃새글 수집기
 * 실행: node scripts/collect-rss.js
 * - config/blogs.json 에서 블로그 목록 읽기
 * - 각 블로그 RSS fetch → 최근 2일치 글 수집
 * - Claude AI 투자 요약
 * - public/data/posts.json 저장
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOGS_PATH  = path.join(__dirname, '../config/blogs.json');
const OUTPUT_PATH = path.join(__dirname, '../public/data/posts.json');

// KST 날짜 유틸 (YYYY-MM-DD)
function kstDate(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '');
}
const TODAY_KST     = kstDate(0);
const YESTERDAY_KST = kstDate(1);
const WEEK_AGO_KST  = kstDate(7);

// 종목명 별칭 정규화 테이블
const ALIASES_PATH = path.join(__dirname, '../config/stock-aliases.json');
let stockAliases = {};
try {
  stockAliases = JSON.parse(fs.readFileSync(ALIASES_PATH, 'utf8'));
} catch {
  console.warn('⚠️  stock-aliases.json 로드 실패 — 별칭 정규화 스킵');
}

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── RSS fetch (15초 타임아웃 + 상태코드 체크) ───────────────────────────────
async function fetchRSS(blogId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─── 본문 전문 수집 (모바일 페이지) ──────────────────────────────────────────
function fetchMobileHTML(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 3) return reject(new Error('리다이렉트 과다'));
    https.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://m.blog.naver.com${res.headers.location}`;
        return fetchMobileHTML(next, depth + 1).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

function extractBody(html) {
  // SmartEditor ONE
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

async function fetchFullContent(postUrl) {
  try {
    const mUrl = postUrl.replace('https://blog.naver.com', 'https://m.blog.naver.com');
    const { status, html } = await fetchMobileHTML(mUrl);
    if (status !== 200) return null;
    return extractBody(html);
  } catch {
    return null;
  }
}

// ─── RSS 파싱 ────────────────────────────────────────────────────────────────
function parseAllPosts(xml, blogId, blogName) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return items.map(item => {
    const title   = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || '(제목 없음)';
    const url     = item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1]
                 || item.match(/<guid>(.*?)<\/guid>/)?.[1] || '';
    const desc    = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

    const postDate = pubDate
      ? new Date(pubDate).toLocaleDateString('ko-KR', {
          timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
        }).replace(/\. /g, '-').replace('.', '')
      : '';

    return {
      blog_id: blogId,
      blog_name: blogName,
      title,
      url: url.split('?')[0],
      content: desc.replace(/<[^>]+>/g, '').slice(0, 2000),
      pubDate,
      postDate,
    };
  });
}

// ─── Claude AI 투자 요약 ──────────────────────────────────────────────────────
async function analyzePost(title, content, blogName) {
  const prompt = `당신은 투자 리서치 어시스턴트입니다. 아래 블로그 글을 읽고, 독자가 원글을 열지 않아도 판단할 수 있게 정보를 최대한 구체적으로 추출하세요.

블로그: ${blogName}
제목: ${title}
본문: ${content.slice(0, 6000)}

[추출 규칙 — 매우 중요]
1. 글에 실제로 나온 내용만 추출. 수치·주장을 지어내지 마세요.
2. 두루뭉술 금지: "긍정적 전망" (X) → "2Q 영업이익 90조 전망, 컨센서스 75~84조 상회" (O)
3. 숫자가 있으면 반드시 포함: 목표가, 전망치, 증감률, 날짜, 밸류에이션.
4. 글쓴이의 논리 구조(주장 → 근거)를 보존하세요.

[sector 분류 기준] 본문이 짧거나 없어도 제목 키워드로 반드시 분류하세요. 기타는 정말 어떤 섹터에도 해당하지 않을 때만 사용.
- 반도체: HBM, DRAM, LPDDR, 메모리, 반도체, 삼성전자, SK하이닉스, 엔비디아, AI칩, 파운드리
- 거시경제: 수출, 금리, 환율, GDP, 코스닥, 코스피, 주도주, 시장, 지수, 수급, 매크로
- 2차전지: 배터리, 전기차, 양극재, 음극재, LG에너지, 삼성SDI
- 플랫폼: 카카오, 네이버, 구글, 메타, AI서비스, 앱
- 자동차·로봇: 현대차, 기아, 로봇, 테슬라, 자율주행

반드시 아래 JSON만 출력하세요 (마크다운 없이):
{
  "summary": "핵심 주장 + 투자 근거를 2~3문장. 구체 수치 포함. 본문이 없거나 투자와 무관하면 '투자 관련 내용 없음'",
  "stocks": ["언급된 종목명만 (없으면 빈 배열)"],
  "sector": "반도체|2차전지|플랫폼|바이오|금융|에너지|자동차·로봇|방산|부동산|소재·화학|거시경제|기타",
  "key_points": ["핵심 포인트 3~5개, 각각 수치·근거 포함"],
  "numbers": ["글에 나온 핵심 수치 최대 4개, 맥락 포함 (예: 'SK하이닉스 목표가 320만원 (UBS)') — 없으면 빈 배열"],
  "stance": "강세|약세|중립|해당없음 (글쓴이의 시각 톤. 추천이 아니라 글의 논조)",
  "reasoning": "글쓴이 주장의 가장 중요한 근거 1문장 — 없으면 빈 문자열",
  "risks": ["글쓴이가 직접 언급한 리스크·유보 조건만 (없으면 빈 배열)"]
}`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text.trim()
      .replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(text);
    // AI 응답 스키마 검증 (배열 타입 보장)
    const normalizeArr = v => Array.isArray(v) ? v : [];
    result.stocks     = normalizeArr(result.stocks).map(s => stockAliases[s] || s);
    result.key_points = normalizeArr(result.key_points);
    result.numbers    = normalizeArr(result.numbers);
    result.risks      = normalizeArr(result.risks);
    result.generatedAt = new Date().toISOString();
    return result;
  } catch (e) {
    console.warn('  AI 분석 실패:', e.message);
    return {
      summary: title, stocks: [], sector: '기타', key_points: [],
      numbers: [], stance: '해당없음', reasoning: '', risks: [],
    };
  }
}

// ─── 일별 종합 브리핑 ─────────────────────────────────────────────────────────
async function generateDailyBrief(posts) {
  const digest = posts.map(p => ({
    blog: p.blog_name,
    title: p.title,
    sector: p.sector,
    stance: p.stance,
    summary: p.summary,
    numbers: p.numbers,
  }));

  const prompt = `당신은 투자 리서치 어시스턴트입니다. 아래는 오늘 수집된 투자 블로거들의 글 분석 결과입니다. 이를 종합해 "그날의 브리핑"을 작성하세요.

${JSON.stringify(digest, null, 2)}

[작성 원칙 — 매우 중요]
1. 매수/매도 추천이나 당신의 판단을 넣지 마세요. 블로거들의 시각을 비교·정리만 합니다.
2. 핵심은 비교: 누가 어떤 근거로 무엇을 주장하는지, 어디서 겹치고 어디서 갈리는지.
3. 글이 1개뿐이면 비교 없이 그 글의 핵심만 정리하고 consensus/divergence는 빈 배열.
4. 투자 무관 글은 무시하세요.
5. 구체 수치를 포함하세요.

반드시 아래 JSON만 출력하세요 (마크다운 없이):
{
  "headline": "오늘의 핵심 한 줄 (예: '3명이 삼성전자 2Q 실적 주목 — 강세 시각 우세')",
  "brief": "블로거들의 시각을 비교하는 종합 3~5문장. '콤디티는 ~근거로 강세, 의교창은 ~' 형식",
  "consensus": ["여러 블로거가 공통으로 보는 시각 (없으면 빈 배열)"],
  "divergence": ["의견이 갈리는 지점 — 깊게 확인할 가치가 있는 부분 (없으면 빈 배열)"],
  "hot_stocks": ["2명 이상이 언급한 종목 (없으면 빈 배열)"]
}`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text.trim()
      .replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const _r=JSON.parse(text); _r.generatedAt=new Date().toISOString(); return _r;
  } catch (e) {
    console.warn('  브리핑 생성 실패:', e.message);
    return null;
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📅 ${TODAY_KST} RSS 수집 시작`);
  console.log(`📆 수집 범위: ${YESTERDAY_KST} ~ ${TODAY_KST} (최근 2일)\n`);

  const { blogs } = JSON.parse(fs.readFileSync(BLOGS_PATH, 'utf-8'));
  console.log(`📋 블로그 ${blogs.length}개: ${blogs.map(b => b.name).join(', ')}\n`);

  const targetDates = new Set([TODAY_KST, YESTERDAY_KST]);
  const collected = [];
  let fetchFailures = 0;

  // ── RSS 수집 ──────────────────────────────────────────────────────────────
  for (const blog of blogs) {
    try {
      const xml = await fetchRSS(blog.id);
      const posts = parseAllPosts(xml, blog.id, blog.name);
      const recent = posts.filter(p => targetDates.has(p.postDate));

      console.log(`✅ ${blog.name}: 최근 2일 ${recent.length}개`);
      recent.forEach(p => console.log(`   → [${p.postDate}] ${p.title}`));

      collected.push(...recent);
    } catch (e) {
      fetchFailures++;
      console.log(`❌ ${blog.name}: ${e.message}`);
    }
  }

  console.log(`\n📊 수집 완료: ${collected.length}개 (fetch 실패 ${fetchFailures}/${blogs.length})`);

  // 모든 블로그 fetch 실패 → GitHub Actions 실패 처리
  if (blogs.length > 0 && fetchFailures === blogs.length) {
    console.error('🔥 모든 블로그 RSS 수집 실패 — 종료 코드 1');
    process.exit(1);
  }

  if (collected.length === 0) {
    console.log('최근 2일간 새 글이 없습니다. 기존 데이터 7일 필터링 + 저장만 수행합니다.');
  }

  // ── Claude AI 요약 ────────────────────────────────────────────────────────
  if (!process.env.CLAUDE_API_KEY) {
    console.warn('\n⚠️  CLAUDE_API_KEY 없음 → AI 요약 스킵 (구조만 저장)\n');
  }

  const results = [];

  for (let i = 0; i < collected.length; i++) {
    const post = collected[i];
    console.log(`\n[${i + 1}/${collected.length}] 분석 중: ${post.blog_name} - ${post.title}`);

    // 본문 전문 수집 (실패 시 RSS description 그대로 사용)
    const fullBody = await fetchFullContent(post.url);
    if (fullBody && fullBody.length > post.content.length) {
      console.log(`  📄 본문 전문 수집: ${fullBody.length.toLocaleString()}자 (RSS: ${post.content.length}자)`);
      post.content = fullBody;
    } else {
      console.log(`  📄 RSS 본문 사용: ${post.content.length}자`);
    }

    let analysis = {
      summary: post.title, stocks: [], sector: '기타', key_points: [],
      numbers: [], stance: '해당없음', reasoning: '', risks: [],
    };

    if (process.env.CLAUDE_API_KEY) {
      analysis = await analyzePost(post.title, post.content, post.blog_name);
      console.log(`  → ${analysis.sector} | ${analysis.stance || '-'} | ${analysis.stocks.join(', ') || '종목 없음'}`);
    }

    results.push({
      id: `${post.blog_id}_${post.postDate}_${post.url.split('/').pop() || i}`,
      date: post.postDate,
      blog_name: post.blog_name,
      title: post.title,
      url: post.url,
      summary: analysis.summary,
      stocks: analysis.stocks,
      sector: analysis.sector,
      key_points: analysis.key_points,
      numbers: analysis.numbers ?? [],
      stance: analysis.stance ?? '해당없음',
      reasoning: analysis.reasoning ?? '',
      risks: analysis.risks ?? [],
    });

    if (i < collected.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // ── 저장 (7일 히스토리 누적) ──────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  // 기존 데이터 읽기 (daily_brief 단수 → daily_briefs 배열 하위 호환)
  let existingPosts = [];
  let existingBriefs = [];
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8').replace(/\x00/g, '').trim();
      const parsed = JSON.parse(raw);
      existingPosts = parsed.posts ?? [];
      if (parsed.daily_briefs) {
        existingBriefs = parsed.daily_briefs;
      } else if (parsed.daily_brief) {
        existingBriefs = [parsed.daily_brief]; // 기존 단수 데이터 마이그레이션
      }
    } catch (e) {
      console.warn('⚠️  기존 posts.json 읽기 실패, 새로 시작합니다.');
    }
  }

  // ── 일별 종합 브리핑 ──────────────────────────────────────────────────────
  let todayBrief = null;
  if (process.env.CLAUDE_API_KEY && results.length > 0) {
    console.log('\n📰 일별 브리핑 생성 중...');
    const cachedBrief = existingBriefs[0];
    const isCached = cachedBrief && cachedBrief.date === TODAY_KST;
    const brief = isCached
      ? (console.log('[DailyBrief] 캐시 사용:', cachedBrief.generatedAt) || cachedBrief)
      : await generateDailyBrief(results);
    if (brief) {
      todayBrief = { ...brief, date: TODAY_KST, post_count: results.length };
      console.log(`  → ${brief.headline}`);
    }
  }

  // daily_briefs 배열 업데이트: 오늘 브리핑을 맨 앞에, 최대 7개 유지
  let updatedBriefs = existingBriefs;
  if (todayBrief) {
    updatedBriefs = [todayBrief, ...existingBriefs.filter(b => b.date !== TODAY_KST)]; // 오늘 것 중복 제거
  }
  updatedBriefs = updatedBriefs.slice(0, 7); // 최대 7일치 유지

  // 새 글 ID 목록 (중복 방지)
  const newIds = new Set(results.map(p => p.id));

  // 병합: 기존 글(7일 이내 + 중복 아닌 것) + 새 글 → 날짜 내림차순
  const merged = [
    ...existingPosts.filter(p => p.date >= WEEK_AGO_KST && !newIds.has(p.id)),
    ...results,
  ].sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { date: TODAY_KST, daily_briefs: updatedBriefs, posts: merged },
      null, 2
    ),
    'utf-8'
  );

  console.log(`\n✅ 완료: 신규 ${results.length}개 추가, 누적 ${merged.length}개 저장, 브리핑 ${updatedBriefs.length}일치 → ${OUTPUT_PATH}`);

  // ── 텔레그램 알림 ──────────────────────────────────────────────────────────
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && todayBrief) {
    await sendTelegram(todayBrief, results.length);
  }
}

async function sendTelegram(brief, postCount) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // HTML 특수문자 이스케이프 (parse_mode: HTML 안전성)
  const esc = (s = '') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const stocks = brief.hot_stocks?.length
    ? `\n📌 공통 언급: ${esc(brief.hot_stocks.join(', '))}`
    : '';
  const consensus = brief.consensus?.length
    ? `\n✅ 합의: ${esc(brief.consensus[0])}`
    : '';
  const divergence = brief.divergence?.length
    ? `\n⚡ 이견: ${esc(brief.divergence[0])}`
    : '';

  const text = [
    `📈 <b>네이버 블로그 투자 브리핑</b> (${esc(brief.date)})`,
    `글 ${postCount}개 종합`,
    ``,
    `<b>${esc(brief.headline)}</b>`,
    ``,
    esc(brief.brief),
    stocks,
    consensus,
    divergence,
  ].filter(Boolean).join('\n').slice(0, 4000);

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const json = await res.json();
    if (json.ok) {
      console.log('📲 텔레그램 알림 전송 완료');
    } else {
      console.warn('⚠️  텔레그램 전송 실패:', json.description);
    }
  } catch (e) {
    console.warn('⚠️  텔레그램 전송 오류:', e.message);
  }
}

main().catch(err => {
  console.error('\n🔥 오류:', err);
  process.exit(1);
});
