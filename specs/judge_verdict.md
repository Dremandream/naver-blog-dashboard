# spec: judge_verdict v0.1 (초안)

> 시그널 문서 1건 → verdict(buy/watch/pass/needs_review) + confidence.
> 실행 모델은 아래 결정표만 적용한다. 표에 없는 추론·재량·정성 판단 금지. 추론은 최대 3단계.

---

## 0. 입력 (시그널 문서 — 모두 사전 계산되어 제공됨)

| 필드 | 타입 | 정의 |
|---|---|---|
| `ticker` | string | 정규화된 종목명 |
| `N` | int | 최근 2일 언급 인원수 (person 단위 중복 제거) |
| `B` | int | 강세 인원수 (비중립만) |
| `R` | int | 약세 인원수 (비중립만) |
| `P5` | float\|null | 5일 주가 등락률 %. 시세 없으면 null |
| `FRESH_H` | float | 데이터 수집 시각 → 판정 시각 경과 시간(시간 단위) |

### 0.1 파생값 (판정 전 기계적으로 계산, 3단계 추론의 1단계)

**여론 방향 DIR:**
| 조건 | DIR |
|---|---|
| B − R ≥ 2 | `bull` |
| R − B ≥ 2 | `bear` |
| \|B − R\| ≤ 1 | `mixed` |

**가격 방향 PDIR:**
| 조건 | PDIR |
|---|---|
| P5 = null | `none` |
| P5 ≥ +2.0 | `up` |
| P5 ≤ −2.0 | `down` |
| −2.0 < P5 < +2.0 | `flat` |

**착시괴리율 ILLUSION:**
| 조건 | ILLUSION |
|---|---|
| (DIR=`bull` AND PDIR=`down`) OR (DIR=`bear` AND PDIR=`up`) | `True` |
| (DIR=`bull` AND PDIR=`up`) OR (DIR=`bear` AND PDIR=`down`) | `False` |
| 그 외 전부 (PDIR=`none`/`flat`, DIR=`mixed`) | `미확인` |

---

## 1. confidence 산정 — 완전 결정표

confidence 허용값 집합: **{0.10, 0.20, 0.30, 0.40, 0.50}**. "1단계" = 정확히 **0.10**.

### 1.1 base 결정표 (DIR ≠ mixed일 때)

| N | ILLUSION=False | ILLUSION=미확인 |
|---|---|---|
| N ≥ 5 | 0.50 | 0.40 |
| 3 ≤ N ≤ 4 | 0.40 | 0.30 |
| N = 2 | 0.20 | 0.10 |

- DIR=`mixed` → base = **0.20** (ILLUSION 무관)
- ILLUSION=`True` → base 산정 생략, confidence = **0.10 고정** (§2에서 needs_review 강제되므로)

> 표 자체에 "미확인 = False보다 1단계(0.10) 낮음"이 반영되어 있다. 별도 감점 연산을 중복 적용하지 말 것.

### 1.2 추가 감점 (base 산정 후, 순서대로 적용)

| # | 조건 | 감점 |
|---|---|---|
| D1 | 24.0 < FRESH_H ≤ 48.0 | −0.10 |
| D2 | DIR=`bull`인데 R ≥ 1 (반대 소수의견 존재) 또는 DIR=`bear`인데 B ≥ 1 | −0.10 |

### 1.3 적용 순서 (고정)

```
1) base 결정 (§1.1)
2) D1 적용 → D2 적용 (순서 고정, 각 1회만)
3) 하한 적용: max(결과, 0.10)
4) 상한 적용: min(결과, 0.50)   ← 항상 마지막
```

---

## 2. verdict 판정 결정표

### 2.1 규칙 (위에서 아래로 첫 매칭 적용 — 이 순서가 곧 충돌 우선순위)

| 우선순위 | 조건 | verdict |
|---|---|---|
| 1 | ILLUSION = `True` | `needs_review` |
| 2 | FRESH_H > 48.0 | `needs_review` |
| 3 | DIR = `bear` | `pass` |
| 4 | DIR = `bull` AND ILLUSION = `False` AND N ≥ 3 | `buy` |
| 5 | 그 외 전부 (default) | `watch` |

> 충돌 예: ILLUSION=True이면서 DIR=bear → 우선순위 1이 먼저 매칭 → `needs_review`.
> `watch`가 default인 이유: 불확실 → 관망이 가장 안전한 오류 방향.

### 2.2 추론 단계 상한 (3단계)
```
1단계: 파생값 계산 (DIR, PDIR, ILLUSION)
2단계: verdict 결정표 첫 매칭
3단계: confidence 결정표 + 감점 + clamp
```
이 외 단계 추가 금지.

---

## 3. 골든 케이스 6개

| # | 입력 | 파생 | verdict | confidence | 검증 포인트 |
|---|---|---|---|---|---|
| G1 | N=5, B=5, R=0, P5=+3.1, FRESH=2h | bull/up/False | `buy` | **0.50** | 상한 걸림 (base 0.50, 감점 없음) |
| G2 | N=5, B=5, R=0, P5=+1.9, FRESH=2h | bull/flat/미확인 | `watch` | **0.40** | 감점 직후 — P5가 +2.0이면 buy/0.50이었을 경계 |
| G3 | N=5, B=5, R=0, P5=−2.0, FRESH=2h | bull/down/True | `needs_review` | **0.10** | 착시 True 강제 (P5=−2.0 경계 포함 확인) |
| G4 | N=4, B=3, R=1, P5=+2.0, FRESH=2h | bull/up/False | `buy` | **0.30** | 상한 안 걸림: base 0.40 − D2(반대의견 R=1) 0.10 = 0.30 |
| G5 | N=2, B=2, R=0, P5=+8.0, FRESH=2h | bull/up/False | `watch` | **0.20** | 인원 부족 → buy 조건(N≥3) 미달, default watch |
| G6 | N=6, B=1, R=5, P5=−8.0, FRESH=30h | bear/down/False | `pass` | **0.40** | base 0.50 − D1(신선도 30h) 0.10 = 0.40. 감점 직전 대비: FRESH=24.0h였다면 0.50 |

---

## 4. 실행 후 자기검증 체크리스트 (5항목 — 전부 통과해야 출력)

1. [ ] confidence ∈ {0.10, 0.20, 0.30, 0.40, 0.50} 인가?
2. [ ] ILLUSION=True인 건의 verdict가 전부 `needs_review`이고 confidence=0.10인가?
3. [ ] 감점을 각 1회만 적용하고, 마지막에 min(x, 0.50)·max(x, 0.10)을 적용했는가?
4. [ ] verdict가 §2.1 표의 첫 매칭 규칙과 일치하는가? (표 밖 근거로 바꾸지 않았는가)
5. [ ] 출력에 ticker/verdict/confidence/사용한 파생값(DIR·PDIR·ILLUSION) 4요소가 모두 있는가?
