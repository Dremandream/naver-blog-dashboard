/**
 * 네이버 이웃새글 수집 + Claude API 요약 스크립트
 * 
 * 사용법:
 *   CLAUDE_API_KEY=sk-ant-... node scripts/collect.js
 *
 * 이 스크립트는 Cowork(Claude)가 Chrome MCP로 직접 실행합니다.
 * 수동 실행도 가능합니다.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../public/data/posts.json");
const MAX_POSTS = 20;

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

/**
 * Claude API로 블로그 본문을 투자 관점으로 요약
 */
async function summarizePost(title, content, blogName) {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `다음 블로그 글을 투자 관점으로 분석해주세요.

블로그명: ${blogName}
제목: ${title}
본문: ${content.slice(0, 3000)}

아래 JSON 형식으로만 답변하세요 (다른 텍스트 없이):
{
  "summary": "2-3문장 요약",
  "stocks": ["언급된 종목명 배열 (없으면 빈 배열)"],
  "sector": "반도체|2차전지|플랫폼|바이오|금융|에너지|기타 중 하나",
  "signal": "매수|중립|매도 중 하나",
  "key_points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]
}`,
      },
    ],
  });

  try {
    const text = response.content[0].text.trim();
    return JSON.parse(text);
  } catch {
    return {
      summary: content.slice(0, 100) + "...",
      stocks: [],
      sector: "기타",
      signal: "중립",
      key_points: [],
    };
  }
}

/**
 * 기존 posts.json 로드 (없으면 빈 구조 반환)
 */
function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf-8"));
  } catch {
    return { date: "", posts: [] };
  }
}

/**
 * posts.json 저장
 */
function savePosts(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const data = { date: today, posts };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✅ posts.json 저장 완료: ${posts.length}개`);
}

/**
 * 메인: rawPosts 배열을 받아 요약 후 저장
 * rawPosts: [{ title, url, blog_name, content, date }]
 */
export async function processAndSave(rawPosts) {
  const limited = rawPosts.slice(0, MAX_POSTS);
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  for (let i = 0; i < limited.length; i++) {
    const p = limited[i];
    console.log(`[${i + 1}/${limited.length}] 요약 중: ${p.title}`);
    try {
      const analysis = await summarizePost(p.title, p.content, p.blog_name);
      results.push({
        id: String(i + 1),
        date: p.date ?? today,
        blog_name: p.blog_name,
        title: p.title,
        url: p.url,
        ...analysis,
      });
    } catch (err) {
      console.error(`  ⚠️ 실패: ${err.message}`);
    }
    // Rate limit 방지
    if (i < limited.length - 1) await new Promise((r) => setTimeout(r, 500));
  }

  savePosts(results);
  return results;
}

// 직접 실행 시 (테스트용 샘플 데이터)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("스크립트 직접 실행 — 샘플 데이터로 테스트합니다.");
  const sample = [
    {
      title: "삼성전자 HBM 공급망 확대 전망",
      url: "https://blog.naver.com/sample1",
      blog_name: "투자노트",
      content: "삼성전자가 HBM3E 양산을 본격화하며 엔비디아 공급망 진입 가능성이 높아졌습니다. AI 반도체 수요 증가와 함께 실적 개선이 기대됩니다.",
      date: new Date().toISOString().slice(0, 10),
    },
  ];
  processAndSave(sample).catch(console.error);
}
