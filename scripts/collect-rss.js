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

const TODAY_KST = new Date().toLocaleDateString('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).replace(/\. /g, '-').replace('.', '');

// 어제 날짜 (KST)
const YESTERDAY_KST = new Date(Date.now() - 86400000).toLocaleDateString('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).replace(/\. /g, '-').replace('.', '');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── RSS fetch ───────────────────────────────────────────────────────────────
function fetchRSS(blogId) {
  return new Promise((resolve, reject) => {
    https.get(`https://rss.blog.naver.com/${blogId}.xml`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
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
    return JSON.parse(text);
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
    return JSON.parse(text);
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
      console.log(`❌ ${blog.name}: ${e.message}`);
    }
  }

  console.log(`\n📊 수집 완료: ${collected.length}개`);

  if (collected.length === 0) {
    console.log('최근 2일간 새 글이 없습니다. posts.json을 업데이트하지 않습니다.');
    return;
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

  // ── 일별 종합 브리핑 ──────────────────────────────────────────────────────
  let dailyBrief = null;
  if (process.env.CLAUDE_API_KEY && results.length > 0) {
    console.log('\n📰 일별 브리핑 생성 중...');
    const brief = await generateDailyBrief(results);
    if (brief) {
      dailyBrief = { date: TODAY_KST, post_count: results.length, ...brief };
      console.log(`  → ${brief.headline}`);
    }
  }

  // ── 저장 (7일 히스토리 누적) ──────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  // 기존 데이터 읽기
  let existingPosts = [];
  let existingBrief = null;
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const raw = fs.readFileSync(OUTPUT_PATH, 'utf-8').replace(/\x00/g, '').trim();
      const parsed = JSON.parse(raw);
      existingPosts = parsed.posts ?? [];
      existingBrief = parsed.daily_brief ?? null;
    } catch (e) {
      console.warn('⚠️  기존 posts.json 읽기 실패, 새로 시작합니다.');
    }
  }

  // 7일 전 날짜 (KST) — 이보다 오래된 글은 제거
  const WEEK_AGO_KST = new Date(Date.now() - 7 * 86400000).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).replace(/\. /g, '-').replace('.', '');

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
      { date: TODAY_KST, daily_brief: dailyBrief ?? existingBrief, posts: merged },
      null, 2
    ),
    'utf-8'
  );

  console.log(`\n✅ 완료: 신규 ${results.length}개 추가, 누적 ${merged.length}개 저장 → ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('\n🔥 오류:', err);
  process.exit(1);
});
