# plan.md — 텔레그램 채널 통합 (세션 9)

> 이전 계획(정보 밀도 업그레이드, 세션 5)은 전부 완료됨. 이 파일은 세션 9 계획으로 교체.

## 목표
투자 블로거 RSS + **텔레그램 공개 채널 3개**를 함께 수집 → 하나의 통합 분석·종합 브리핑으로 대시보드에 표시 (표면 A: 웹).

## 추가 채널 (검증 완료 — 3개 모두 공개, t.me/s/ 수집 가능)
| id | 표시 이름 | t.me/s 테스트 |
|---|---|---|
| comvestment | 투자콤 | ✅ HTTP 200, 16 메시지 |
| jake8lee | 잠실개미(텔레) | ✅ HTTP 200, 19 메시지 |
| skitteam | IT는 SK | ✅ HTTP 200, 20 메시지 |

## 설계 핵심
기존 파이프라인은 "글 → analyzePost(통일 스키마) → generateDailyBrief(종합)" 구조.
**텔레그램 메시지를 같은 스키마의 '글' 객체로 변환해 `collected` 배열에 넣기만 하면** 종합 분석·브리핑이 자동 통합된다.

- 채널별로 **하루치 메시지를 1개 글로 합쳐서** 분석 (메시지당 분석 X → 비용/노이즈 절감).
- 각 글에 `source: 'telegram' | 'blog'` 필드 추가.

## 변경 파일
1. `config/telegram-channels.json` (신규) — 채널 목록
2. `scripts/collect-rss.js` — 텔레그램 수집·파싱 함수 + main() 통합, `source` 필드 추가
3. `src/components/PostCard.jsx` — source 배지 (📱 텔레그램 / 블로그)
4. `src/App.css` — 텔레그램 배지 스타일 (최소)

## 하위호환
- 기존 글엔 `source` 필드 없음 → PostCard에서 `post.source==='telegram'`일 때만 배지 표시, 기본은 블로그로 간주
- 텔레그램 글 url = 채널/메시지 링크 (t.me/채널/메시지id)

## 완료 기준
1. `node scripts/collect-rss.js` 로컬 실행 → 텔레그램 채널 글이 posts.json에 `source:"telegram"`으로 저장
2. 종합 브리핑에 블로거+텔레그램 시각이 함께 반영
3. 로컬 빌드 통과 → (확인 후) git push → Vercel에서 텔레그램 카드 표시

## 미결정 (사용자 확인 후 push)
- 로컬 검증까지 완료 후, git push 전에 사용자에게 확인받는다.
