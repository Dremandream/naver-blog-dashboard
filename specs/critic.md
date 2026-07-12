# spec: critic v0.1 (초안)

> judge_verdict 출력 배치(발송 직전) → 2차 심사. 결정표만 적용, 재량 금지, 추론 3단계 이하.
> blocked = 발송 차단(해당 건 제거), flagged = 발송하되 경고 표시.

---

## 0. 입력

- `batch`: judge_verdict 출력 배열. 각 건 = { ticker, verdict, confidence, DIR, PDIR, ILLUSION, FRESH_H, asOf }
- `history`: 직전 5회 배치의 verdict 분포 기록 [{date, buy_pct, ...}] (buy_pct = buy 건수 ÷ 전체 건수 × 100, 소수 1자리)

---

## 1. 검사 5항목 — 결정표

### C1. 데이터 신선도
| 조건 (건별 FRESH_H) | 판정 |
|---|---|
| FRESH_H ≤ 24.0 | 통과 |
| 24.0 < FRESH_H ≤ 48.0 | `flagged` (rule: "stale-warn") |
| FRESH_H > 48.0 | `blocked` (rule: "stale") |

### C2. verdict 분포 급변
- 산식: `Δ = |이번 배치 buy_pct − 직전 5회 buy_pct 평균|` (%p, 소수 1자리)
- history가 5회 미만이면 이 검사 생략(통과).

| 안 | 임계 X | Δ ≤ X | Δ > X |
|---|---|---|---|
| 보수 | 15.0%p | 통과 | `flagged` (rule: "dist-shift") |
| **중간 (기본 채택)** | 25.0%p | 통과 | `flagged` (rule: "dist-shift") |
| 공격 | 40.0%p | 통과 | `flagged` (rule: "dist-shift") |

> flagged(차단 아님)인 이유: 급변은 실제 시장 급변일 수 있음. 차단하면 정보 손실, 경고가 옳은 오류 방향.

### C3. 착시 규칙 위반 차단
| 조건 (건별) | 판정 |
|---|---|
| ILLUSION=`True` AND verdict ≠ `needs_review` | `blocked` (rule: "illusion-violation") |
| ILLUSION=`True` AND verdict = `needs_review` | 통과 |
| ILLUSION ≠ `True` | 통과 |

### C4. confidence 위반 차단
| 조건 (건별) | 판정 |
|---|---|
| confidence > 0.50 | `blocked` (rule: "conf-cap") |
| confidence ∉ {0.10, 0.20, 0.30, 0.40, 0.50} | `blocked` (rule: "conf-step") |
| 그 외 | 통과 |

### C5. 동일 티커 중복
- 배치를 입력 순서대로 스캔. 같은 `ticker`가 2회 이상 등장하면 **첫 건은 유지, 2번째 이후 건 전부** `blocked` (rule: "dup-ticker").

---

## 2. 출력 스키마 (이 형식 외 출력 금지)

```json
{
  "pass": true,
  "blocked": [ { "ticker": "SK하이닉스", "rule": "illusion-violation", "detail": "ILLUSION=True인데 verdict=buy" } ],
  "flagged": [ { "ticker": "*", "rule": "dist-shift", "detail": "buy_pct 62.0 vs 5회평균 30.0 (Δ32.0%p > 25.0)" } ]
}
```
- `pass` = blocked 배열이 비어있으면 true, 아니면 false.
- 배치 단위 검사(C2)의 ticker는 `"*"`.

---

## 3. 골든 케이스 6개

| # | 입력 요약 | 기대 출력 |
|---|---|---|
| K1 | 전 건 정상, FRESH 전부 ≤24h, buy_pct 30.0 vs 평균 28.0 | pass=true, blocked=[], flagged=[] |
| K2 | 1건 FRESH=36.0h (나머지 정상) | pass=true, flagged=[stale-warn 1건] — 경계: 24.0h였다면 flagged 없음 |
| K3 | 1건 FRESH=48.1h | pass=false, blocked=[stale 1건] — 경계: 48.0h였다면 flagged |
| K4 | 1건 ILLUSION=True + verdict=buy | pass=false, blocked=[illusion-violation] |
| K5 | 1건 confidence=0.55, 1건 confidence=0.35 | pass=false, blocked=[conf-cap(0.55), conf-step(0.35 — 허용 집합 밖)] |
| K6 | SK하이닉스 3건 포함 배치, buy_pct 60.0 vs 평균 30.0 (중간안) | pass=false, blocked=[dup-ticker 2건(2·3번째)], flagged=[dist-shift Δ30.0>25.0] |

---

## 4. 자기검증 체크리스트 (5항목)

1. [ ] 5개 검사(C1~C5)를 전부 실행했는가? (하나라도 생략 금지, C2만 history<5회 시 생략 허용)
2. [ ] blocked/flagged의 모든 항목에 ticker·rule·detail 3필드가 있는가?
3. [ ] pass 값이 "blocked 비어있음"과 정확히 일치하는가?
4. [ ] C2에서 임계값(기본 25.0%p)과 Δ를 detail에 수치로 기록했는가?
5. [ ] 결정표 밖 사유로 blocked/flagged를 추가하지 않았는가?
