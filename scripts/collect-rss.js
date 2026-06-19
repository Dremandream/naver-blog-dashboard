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
  const prompt = `다음 블로그 글을 투자 관점으로 분석하세요.

블로그: ${blogName}
제목: ${title}
본문: ${content.slice(0, 2000)}

[sector 분류 기준] 본문이 짧거나 없어도 제목 키워드로 반드시 분류하세요. 기타는 정말 어떤 섹터에도 해당하지 않을 때만 사용.
- 반도체: HBM, DRAM, LPDDR, 메모리, 반도체, 삼성전자, SK하이닉스, 엔비디아, AI칩, 파운드리
- 거시경제: 수출, 금리, 환율, GDP, 코스닥, 코스피, 주도주, 시장, 지수, 수급, 매크로
- 2차전지: 배터리, 전기차, 양극재, 음극재, LG에너지, 삼성SDI
- 플랫폼: 카카오, 네이버, 구글, 메타, AI서비스, 앱
- 자동차·로봇: 현대차, 기아, 로봇, 테슬라, 자율주행

[signal 판단 기준 — 엄격히 적용]
▶ 매수: 글쓴이가 아래 중 하나 이상을 직접 표현한 경우만
  - "매수", "담았다", "샀다", "비중 확대", "추가 매수", "목표가 상향", "저점 매수 기회", "강력 추천"
  - 구체적인 목표가/수익률을 제시하며 긍정 전망 표명
▶ 매도: 글쓴이가 아래 중 하나 이상을 직접 표현한 경우만
  - "매도", "팔았다", "비중 축소", "손절", "목표가 하향", "리스크 경고", "하락 예상"
▶ 중립: 위 두 조건 모두 해당 없으면 무조건 중립
  - 단순 뉴스 정리, 시장 현황 요약, 전망 불분명, 본문 부족

[signal_reason 규칙] 절대 빈칸 금지. 위 기준에 해당하는 구체적 표현을 인용하거나, 해당 표현이 없으면 "명시적 매수/매도 표현 없음 → 중립"으로 명시.

반드시 아래 JSON만 출력하세요 (마크다운 없이):
{
  "summary": "글쓴이의 핵심 주장과 투자 근거를 2~3문장으로 요약. 본문이 없거나 투자와 무관하면 '투자 관련 내용 없음'으로 명시",
  "stocks": ["언급된 종목명만 (없으면 빈 배열)"],
  "sector": "반도체|2차전지|플랫폼|바이오|금융|에너지|자동차·로봇|방산|부동산|소재·화학|거시경제|기타",
  "signal": "매수|중립|매도",
  "signal_reason": "signal 판단 근거 1문장 — 매수/매도라면 글에서 인용한 표현 포함. 중립이면 '명시적 매수/매도 표현 없음 → 중립' (절대 빈칸 금지)",
  "key_points": ["핵심 포인트 1 (수치나 근거 포함)", "핵심 포인트 2", "핵심 포인트 3"]
}`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content[0].text.trim()
      .replace(/^```json\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(text);
  } catch (e) {
    console.warn('  AI 분석 실패:', e.message);
    return { summary: title, stocks: [], sector: '기타', signal: '중립', signal_reason: 'AI 분석 실패', key_points: [] };
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
    console.log(`\n[${i + 1}/${collected.length}] AI 분석 중: ${post.blog_name} - ${post.title}`);

    let analysis = { summary: post.title, stocks: [], sector: '기타', signal: '중립', key_points: [] };

    if (process.env.CLAUDE_API_KEY && post.content.length > 30) {
      analysis = await analyzePost(post.title, post.content, post.blog_name);
      console.log(`  → ${analysis.sector} | ${analysis.signal} | ${analysis.stocks.join(', ') || '종목 없음'}`);
    }

    results.push({
      id: `${post.blog_id}_${Date.now()}_${i}`,
      date: post.postDate,
      blog_name: post.blog_name,
      title: post.title,
      url: post.url,
      summary: analysis.summary,
      stocks: analysis.stocks,
      sector: analysis.sector,
      signal: analysis.signal,
      signal_reason: analysis.signal_reason || '',
      key_points: analysis.key_points,
    });

    if (i < collected.length - 1) await new Promise(r => setTimeout(r, 500));
  }

  // ── 저장 ──────────────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ date: TODAY_KST, posts: results }, null, 2),
    'utf-8'
  );

  console.log(`\n✅ 완료: ${results.length}개 저장 → ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('\n🔥 오류:', err);
  process.exit(1);
});
