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
const TELEGRAM_PATH = path.join(__dirname, '../config/telegram-channels.json');
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

// ─── 견고한 JSON 파서 ────────────────────────────────────────────────────────
// 모델이 JSON 앞뒤에 설명/코드펜스를 붙여도 안전하게 첫 번째 {...} 블록만 추출.
function parseJSONLoose(raw) {
  let t = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 첫 '{' 부터 괄호 균형이 맞는 지점까지 스캔 (문자열 내 중괄호 무시)
  const start = t.indexOf('{');
  if (start === -1) return JSON.parse(t); // 실패 시 원래대로 throw
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  return JSON.parse(t.slice(start)); // 닫힘 못 찾으면 원래 오류 전파
}

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
function parseAllPosts(xml, blogId, blogName, person) {
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
      person: person || blogName,
      title,
      url: url.split('?')[0],
      content: desc.replace(/<[^>]+>/g, '').slice(0, 2000),
      pubDate,
      postDate,
    };
  });
}

// ─── 텔레그램 공개 채널 수집 (t.me/s/ 웹 미리보기) ───────────────────────────
async function fetchTelegramChannel(channelId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://t.me/s/${channelId}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; blog-dashboard/1.0)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// HTML 엔티티 디코드 + 태그 제거
function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

// 채널 HTML → 메시지 배열 [{ text, postDate, url }]
function parseTelegramMessages(html, channelId) {
  const messages = [];
  // 메시지 텍스트 블록
  const textRe = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  // 메시지 래퍼(데이터 속성 + 시간 포함)를 순서대로 매칭
  const wrapRe = /data-post="([^"]+)"[\s\S]*?<time[^>]*datetime="([^"]+)"/g;

  const texts = [];
  let tm;
  while ((tm = textRe.exec(html)) !== null) texts.push(stripHtml(tm[1]));

  const metas = [];
  let wm;
  while ((wm = wrapRe.exec(html)) !== null) {
    metas.push({ post: wm[1], datetime: wm[2] });
  }

  // 텍스트가 없는 메시지(사진만 등)가 있으면 개수가 어긋날 수 있어,
  // 텍스트 블록 기준으로 가장 가까운 메타를 매칭하기보다 최소 개수만큼 정렬 매칭
  const n = Math.min(texts.length, metas.length);
  for (let i = 0; i < n; i++) {
    const text = texts[i];
    if (!text) continue;
    const postDate = new Date(metas[i].datetime).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\. /g, '-').replace('.', '');
    messages.push({
      text,
      postDate,
      url: `https://t.me/${metas[i].post}`,
    });
  }
  return messages;
}

// ─── 주가 수집 (네이버 금융, 무료 공개 API) ──────────────────────────────────
const CODES_PATH = path.join(__dirname, '../config/stock-codes.json');

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 이름 → { code, market } (네이버 자동완성, 캐시 우선). 비상장이면 null 캐시.
async function resolveStockCode(name, cache) {
  if (name in cache) return cache[name];
  try {
    const raw = await fetchJSON(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(name)}&target=stock`);
    const item = (JSON.parse(raw).items || []).find(i => i.category === 'stock');
    cache[name] = item
      ? { code: item.reutersCode || item.code, market: item.nationCode === 'KOR' ? 'KR' : 'US', matched: item.name }
      : null; // 비상장/미매칭
  } catch {
    return undefined; // 일시 오류 — 캐시하지 않음
  }
  return cache[name];
}

function yyyymmdd(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
}

// 일봉 종가 배열 (과거→최신)
async function fetchCloses(info) {
  if (info.market === 'KR') {
    const raw = await fetchJSON(`https://api.finance.naver.com/siseJson.naver?symbol=${info.code}&requestType=1&startTime=${yyyymmdd(45)}&endTime=${yyyymmdd(0)}&timeframe=day`);
    // 유사 JSON([['날짜',...],["20260601",시,고,저,종,...]) → 행 파싱
    const rows = [...raw.matchAll(/\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/g)];
    return rows.map(r => Number(r[5]));
  }
  const raw = await fetchJSON(`https://api.stock.naver.com/chart/foreign/item/${info.code}/day?startDateTime=${yyyymmdd(45)}0000&endDateTime=${yyyymmdd(0)}2359`);
  return JSON.parse(raw).map(c => Number(c.closePrice));
}

function pctChange(closes, n) {
  if (closes.length < n + 1) return null;
  const last = closes[closes.length - 1], prev = closes[closes.length - 1 - n];
  return prev ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
}

// 종목명 목록 → { 종목명: { price, d1, d5, d20, market } }
async function fetchPrices(stockNames) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CODES_PATH, 'utf8')); } catch { /* 첫 실행 */ }

  const prices = {};
  for (const name of stockNames) {
    try {
      const info = await resolveStockCode(name, cache);
      if (!info) { if (info === null) console.log(`  ⏭️  ${name}: 비상장/미매칭 스킵`); continue; }
      const closes = await fetchCloses(info);
      if (closes.length === 0) continue;
      prices[name] = {
        market: info.market,
        price: closes[closes.length - 1],
        d1: pctChange(closes, 1),
        d5: pctChange(closes, 5),
        d20: pctChange(closes, 20),
      };
      console.log(`  💹 ${name}(${info.market}): ${prices[name].price.toLocaleString()} | 1일 ${prices[name].d1}% 5일 ${prices[name].d5}%`);
      await new Promise(r => setTimeout(r, 250));
    } catch (e) {
      console.warn(`  ⚠️  ${name} 시세 실패: ${e.message}`);
    }
  }
  fs.writeFileSync(CODES_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  return prices;
}

// ─── 시황 수집 (지수 + 투자자별 수급) ────────────────────────────────────────
async function fetchIndexCloses(symbol) {
  const raw = await fetchJSON(`https://api.finance.naver.com/siseJson.naver?symbol=${symbol}&requestType=1&startTime=${yyyymmdd(45)}&endTime=${yyyymmdd(0)}&timeframe=day`);
  const rows = [...raw.matchAll(/\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/g)];
  return rows.map(r => Number(r[5]));
}

// 투자자별 매매동향 (억원): sosok 01=코스피, 02=코스닥. 최신일 + 외국인 5일 누적.
async function fetchInvestorFlows(sosok) {
  const raw = await fetchJSON(`https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=${yyyymmdd(0)}&sosok=${sosok}`);
  // 행 구조: <td class="date2">26.07.10</td> 이후 숫자 셀들 [개인, 외국인, 기관계, ...] (단위: 억원)
  const days = [];
  const re = /class="date2">(\d{2}\.\d{2}\.\d{2})<\/td>((?:\s*<td[^>]*>-?[\d,]+<\/td>){3,})/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const nums = [...m[2].matchAll(/<td[^>]*>(-?[\d,]+)<\/td>/g)].map(x => Number(x[1].replace(/,/g, '')));
    if (nums.length >= 3) days.push({ date: m[1], individual: nums[0], foreign: nums[1], institution: nums[2] });
  }
  if (days.length === 0) return null;
  const latest = days[0];
  latest.foreign5d = days.slice(0, 5).reduce((s, d) => s + d.foreign, 0);
  return latest;
}

async function fetchMarketData() {
  const market = {};
  for (const [key, symbol, sosok] of [['kospi', 'KOSPI', '01'], ['kosdaq', 'KOSDAQ', '02']]) {
    try {
      const closes = await fetchIndexCloses(symbol);
      const flows = await fetchInvestorFlows(sosok);
      market[key] = {
        index: closes[closes.length - 1],
        d1: pctChange(closes, 1),
        d5: pctChange(closes, 5),
        d20: pctChange(closes, 20),
        flows, // { date, individual, foreign, institution, foreign5d } 단위: 억원
      };
      console.log(`  📈 ${symbol}: ${market[key].index?.toLocaleString()} (1일 ${market[key].d1}%, 5일 ${market[key].d5}%) | 외인 ${flows?.foreign?.toLocaleString()}억 기관 ${flows?.institution?.toLocaleString()}억`);
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`  ⚠️  ${symbol} 시황 실패: ${e.message}`);
    }
  }
  return market;
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
  "headline": "이 글의 핵심을 담은 30자 이내 한 줄 제목 (예: 'SK하이닉스 ADR 상장 + 반도체 수출 급증')",
  "summary": "핵심 주장 + 투자 근거를 2~3문장. 구체 수치 포함. 본문이 없거나 투자와 무관하면 '투자 관련 내용 없음'",
  "stocks": ["언급된 종목명만. 정식 명칭으로 통일: 한국 종목은 정확한 한글 상장명(예: 'SK하이닉스','삼성전자'), 해외 종목은 널리 쓰이는 한글명(예: '엔비디아','마이크론','메타'). 오타·영문약자 금지. (없으면 빈 배열)"],
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
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    });
    const result = parseJSONLoose(res.content[0].text);
    // sector 단일화: 여러 개("반도체|거시경제")로 나오면 첫 번째만 사용 (필터 매칭 보장)
    if (typeof result.sector === 'string') result.sector = result.sector.split(/[|,/]/)[0].trim();
    // AI 응답 스키마 검증 (배열 타입 보장)
    const normalizeArr = v => Array.isArray(v) ? v : [];
    result.stocks     = normalizeArr(result.stocks).map(s => stockAliases[s] || s);
    result.key_points = normalizeArr(result.key_points);
    result.numbers    = normalizeArr(result.numbers);
    result.risks      = normalizeArr(result.risks);
    result.headline   = typeof result.headline === 'string' ? result.headline.trim() : '';
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
async function generateDailyBrief(posts, prices = {}, market = {}) {
  const digest = posts.map(p => ({
    blog: p.blog_name,
    person: p.person || p.blog_name,
    source: p.source === 'telegram' ? '텔레그램' : '블로그',
    title: p.title,
    sector: p.sector,
    stance: p.stance,
    summary: p.summary,
    reasoning: p.reasoning,
    numbers: p.numbers,
  }));

  // 쏠림 지표: 섹터 집중도 + 스탠스 편향 (인물 단위) — 프롬프트에 근거로 제공
  const sectorCnt = {};
  const personStance = {};
  for (const p of posts) {
    sectorCnt[p.sector] = (sectorCnt[p.sector] || 0) + 1;
    const per = p.person || p.blog_name;
    const st = p.stance === '강세' ? '강세' : p.stance === '약세' ? '약세' : '중립';
    if (!personStance[per] || (personStance[per] === '중립' && st !== '중립')) personStance[per] = st;
  }
  const topSector = Object.entries(sectorCnt).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  const sectorPct = Math.round((topSector[1] / (posts.length || 1)) * 100);
  const stances = Object.values(personStance);
  const bullN = stances.filter(s => s === '강세').length;
  const bearN = stances.filter(s => s === '약세').length;
  const concentration = `섹터 집중: ${topSector[0]} ${sectorPct}% (${topSector[1]}/${posts.length}글) | 스탠스: 강세 ${bullN}명 vs 약세 ${bearN}명`;

  const priceLines = Object.entries(prices)
    .map(([name, v]) => `${name}: 현재 ${v.price.toLocaleString()}${v.market === 'KR' ? '원' : '$'} | 1일 ${v.d1 ?? '?'}% | 5일 ${v.d5 ?? '?'}% | 20일 ${v.d20 ?? '?'}%`)
    .join('\n');

  const prompt = `당신은 투자 리서치 어시스턴트입니다. 아래는 오늘 수집된 투자 블로거·텔레그램 채널들의 글 분석 결과입니다. 이를 종합해 독자가 15개 소스를 직접 안 읽어도 되도록 "그날의 종합의견"을 작성하세요.

${JSON.stringify(digest, null, 2)}

[실제 주가 데이터 — 여론과 대조할 것]
${priceLines || '(주가 데이터 없음)'}

[쏠림 지표 — 오늘 소스들의 편향]
${concentration}

[시황 데이터 — 지수·수급 (단위: 억원)]
${Object.entries(market).map(([k, v]) =>
    `${k.toUpperCase()}: ${v.index?.toLocaleString()} | 1일 ${v.d1}% 5일 ${v.d5}% 20일 ${v.d20}%` +
    (v.flows ? ` | 최근일 수급: 개인 ${v.flows.individual?.toLocaleString()} 외국인 ${v.flows.foreign?.toLocaleString()} 기관 ${v.flows.institution?.toLocaleString()} (외인 5일 누적 ${v.flows.foreign5d?.toLocaleString()})` : '')
  ).join('\n') || '(시황 데이터 없음)'}

[작성 원칙 — 매우 중요]
1. 매수/매도 추천이나 당신의 판단을 넣지 마세요. 필자들의 시각을 비교·정리만 합니다.
2. 핵심은 비교: 누가 어떤 근거로 무엇을 주장하는지, 어디서 겹치고 어디서 갈리는지.
3. 구체 수치를 반드시 포함 (목표가, 전망치, 증감률 등).
4. 투자 무관 글은 무시하세요.
5. **동일 인물 중복 주의**: 같은 person이 블로그와 텔레그램에 모두 쓸 수 있습니다(예: '너쟁이', '잠실개미'). "몇 명이 합의"를 셀 때 person 기준으로 세고, 같은 사람을 2명으로 세지 마세요.
6. **소수의견(minority)이 가장 중요**: 다수와 다르게 보는 1~2명의 근거 있는 시각, 또는 남들이 놓친 관점을 반드시 찾아내세요. 다수 합의는 이미 시장에 반영됐을 가능성이 크고, 소수·역발상 의견이 오히려 리서치 가치가 높습니다. 억지로 만들지 말되, 실제로 있으면 놓치지 마세요.
7. 글이 1개뿐이면 비교 없이 핵심만 정리하고 나머지는 빈 배열.

8. **관전 포인트(watch_points)**: 앞으로 시장 방향을 가를 확인 변수·촉매·일정을 짚으세요(예: '7/20 빅테크 CAPEX 발표', 'HBM 가격 협상', '외국인 순매수 전환 여부'). 독자가 스스로 판단하도록 돕는 체크리스트입니다.
9. **말 vs 가격 대조(divergence 분석) — 매우 중요**: 위 주가·시황 데이터와 여론을 반드시 대조하세요. 지수 흐름과 외국인/기관 수급도 여론 평가의 배경으로 활용하세요(예: 여론 강세인데 외인 5일 연속 순매도면 명시). 여론이 강세인데 주가가 하락 중이면(또는 반대) 그 괴리를 headline과 price_check에 명시하고, 가능한 해석(선반영 소화 vs 수급 이탈 vs 매수 기회)을 병기하세요. 여론과 가격이 같은 방향이면 "추세 확인"으로 서술하세요. 가격은 여론보다 정직한 신호일 수 있습니다.
10. **쏠림 경고(crowding)**: 위 쏠림 지표를 근거로, 오늘 소스들이 한 섹터/한 방향에 몰렸으면 경고하세요. 다수 합의는 이미 반영됐을 위험이 크고, 쏠림이 심할수록 역발상 가치가 커집니다. crowding 필드에 "무엇에 얼마나 쏠렸는지 + 그래서 무엇을 경계할지"를 담으세요.
11. **소외된 시각(neglected)**: 다수(반도체·주도 섹터)에 묻힌 다른 섹터·다른 자산·반대 방향 의견을 반드시 발굴하세요. 단 1명이 말했더라도 남들과 다른 섹터(예: 금융·2차전지·바이오·소비)나 반대 포지션이면 여기에 담으세요. 없으면 빈 배열.
12. 이것은 증권사 리포트처럼 읽혀야 합니다. 각 논거는 "누가 — 무엇을 — 어떤 수치·근거로" 완결된 문장으로.

반드시 아래 JSON만 출력하세요 (마크다운 없이):
{
  "headline": "오늘의 결론 한 줄 — 시장 시각의 무게중심 서술(추천 아님). 예: '강세론 우세하나 기관은 사이클 피크 경고'",
  "brief": "리서치 리포트 서두처럼 정보 밀도 높은 종합 4~6문장. 누가 어떤 근거·수치로 무엇을 보는지.",
  "bull_case": ["강세 논거 — '누가: 근거+수치' 완결 문장 2~4개 (없으면 빈 배열)"],
  "bear_case": ["약세·신중 논거 — '누가: 근거+수치' 완결 문장 2~4개 (없으면 빈 배열)"],
  "minority": ["소수·역발상 관점 — 다수와 다른 근거 있는 시각이나 남들이 놓친 관점. 누가 왜 그렇게 보는지 근거까지 (진짜 없으면 빈 배열)"],
  "crowding": "쏠림 경고 한 문장 — 무엇에 얼마나 몰렸고 무엇을 경계할지 (쏠림 약하면 빈 문자열)",
  "neglected": ["다수에 묻힌 다른 섹터·다른 자산·반대 방향 의견 — 누가/무엇을 (없으면 빈 배열)"],
  "price_check": ["말 vs 가격 대조 — 여론과 주가가 역행/동행하는 종목과 그 해석. 예: 'SK하이닉스: 여론 강세 7명 vs 5일 -10% 역행 — 선반영 소화 vs 수급 이탈 쟁점' (주가 데이터 없으면 빈 배열)"],
  "watch_points": ["앞으로 확인할 핵심 변수·촉매·일정 2~4개 (없으면 빈 배열)"],
  "hot_stocks": ["2명 이상(person 기준) 언급 종목 (없으면 빈 배열)"]
}`;

  try {
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });
    const _r = parseJSONLoose(res.content[0].text); _r.generatedAt=new Date().toISOString(); return _r;
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
      const posts = parseAllPosts(xml, blog.id, blog.name, blog.person);
      const recent = posts.filter(p => targetDates.has(p.postDate));

      console.log(`✅ ${blog.name}: 최근 2일 ${recent.length}개`);
      recent.forEach(p => console.log(`   → [${p.postDate}] ${p.title}`));

      collected.push(...recent);
    } catch (e) {
      fetchFailures++;
      console.log(`❌ ${blog.name}: ${e.message}`);
    }
  }

  console.log(`\n📊 블로그 수집 완료: ${collected.length}개 (fetch 실패 ${fetchFailures}/${blogs.length})`);

  // ── 텔레그램 채널 수집 ─────────────────────────────────────────────────────
  let channels = [];
  try {
    ({ channels } = JSON.parse(fs.readFileSync(TELEGRAM_PATH, 'utf-8')));
  } catch {
    console.warn('⚠️  telegram-channels.json 로드 실패 — 텔레그램 수집 스킵');
  }

  if (channels.length > 0) {
    console.log(`\n📱 텔레그램 채널 ${channels.length}개: ${channels.map(c => c.name).join(', ')}`);
    for (const ch of channels) {
      try {
        const html = await fetchTelegramChannel(ch.id);
        const msgs = parseTelegramMessages(html, ch.id);
        // 채널별로 하루치 메시지를 1개 글로 병합 (targetDates 범위만)
        for (const date of targetDates) {
          const dayMsgs = msgs.filter(m => m.postDate === date);
          if (dayMsgs.length === 0) continue;
          const content = dayMsgs.map(m => m.text).join('\n\n---\n\n').slice(0, 8000);
          collected.push({
            blog_id: ch.id,
            blog_name: ch.name,
            person: ch.person || ch.name,
            title: `${ch.name} 텔레그램 (${date}, ${dayMsgs.length}건)`,
            url: dayMsgs[0].url,
            content,
            postDate: date,
            source: 'telegram',
          });
          console.log(`✅ ${ch.name}: [${date}] ${dayMsgs.length}건 병합`);
        }
      } catch (e) {
        console.log(`❌ ${ch.name} (텔레그램): ${e.message}`);
      }
    }
  }

  console.log(`\n📊 전체 수집: ${collected.length}개 (블로그 ${blogs.length} + 텔레그램 ${channels.length}채널)`);

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

    // 본문 전문 수집 (텔레그램은 이미 본문 확보 → 스킵, 블로그만 수집)
    if (post.source === 'telegram') {
      console.log(`  📱 텔레그램 본문 사용: ${post.content.length}자`);
    } else {
      const fullBody = await fetchFullContent(post.url);
      if (fullBody && fullBody.length > post.content.length) {
        console.log(`  📄 본문 전문 수집: ${fullBody.length.toLocaleString()}자 (RSS: ${post.content.length}자)`);
        post.content = fullBody;
      } else {
        console.log(`  📄 RSS 본문 사용: ${post.content.length}자`);
      }
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
      source: post.source || 'blog',
      blog_name: post.blog_name,
      person: post.person || post.blog_name,
      // 텔레그램 글은 기계적 제목 대신 AI 헤드라인 사용 (건수는 뒤에 유지)
      title: post.source === 'telegram' && analysis.headline
        ? `${analysis.headline} (${post.title.match(/\d+건/)?.[0] || ''})`.replace(' ()', '')
        : post.title,
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

  // 새 글 ID 목록 (중복 방지)
  const newIds = new Set(results.map(p => p.id));

  // 병합: 기존 글(7일 이내 + 중복 아닌 것) + 새 글 → 날짜 내림차순
  const merged = [
    ...existingPosts.filter(p => p.date >= WEEK_AGO_KST && !newIds.has(p.id)),
    ...results,
  ].sort((a, b) => b.date.localeCompare(a.date));

  // ── 주가 수집 (7일 내 2명 이상 언급 종목, 상한 25) — 브리핑보다 먼저 ───────
  console.log('\n💹 주가 수집 중...');
  const personsByStock = {};
  for (const p of merged) {
    for (const s of p.stocks ?? []) {
      (personsByStock[s] = personsByStock[s] || new Set()).add(p.person || p.blog_name);
    }
  }
  const priceTargets = Object.entries(personsByStock)
    .filter(([, persons]) => persons.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 25)
    .map(([name]) => name);
  let prices = {};
  try {
    prices = await fetchPrices(priceTargets);
  } catch (e) {
    console.warn('⚠️  주가 수집 실패(여론 데이터는 정상 저장):', e.message);
  }

  // ── 시황 수집 (지수 + 수급) ────────────────────────────────────────────────
  console.log('\n📈 시황 수집 중...');
  let market = {};
  try {
    market = await fetchMarketData();
  } catch (e) {
    console.warn('⚠️  시황 수집 실패:', e.message);
  }

  // ── 일별 종합 브리핑 (주가 데이터 포함 → 말 vs 가격 괴리 분석) ──────────────
  let todayBrief = null;
  if (process.env.CLAUDE_API_KEY && results.length > 0) {
    console.log('\n📰 일별 브리핑 생성 중...');
    const cachedBrief = existingBriefs[0];
    const isCached = cachedBrief && cachedBrief.date === TODAY_KST;
    const brief = isCached
      ? (console.log('[DailyBrief] 캐시 사용:', cachedBrief.generatedAt) || cachedBrief)
      : await generateDailyBrief(results, prices, market);
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

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      { date: TODAY_KST, daily_briefs: updatedBriefs, market, prices, posts: merged },
      null, 2
    ),
    'utf-8'
  );

  console.log(`\n✅ 완료: 신규 ${results.length}개 추가, 누적 ${merged.length}개 저장, 브리핑 ${updatedBriefs.length}일치 → ${OUTPUT_PATH}`);

  // ── 텔레그램 알림 ──────────────────────────────────────────────────────────────────────────
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
