function List({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="team-list">
      <b>{title}</b>
      <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul>
    </div>
  );
}

function RoleCard({ name, role, children, accent }) {
  return (
    <article className={`team-role-card team-role-${accent}`}>
      <header><span>{name}</span><small>{role}</small></header>
      {children}
    </article>
  );
}

export default function ResearchTeamReport({ brief }) {
  const team = brief?.research_team;
  if (!team) return null;
  const { kim = {}, lee = {}, park = {}, choi = {} } = team;

  return (
    <section className="research-team-report" aria-labelledby="research-team-title">
      <div className="home-section-head">
        <div>
          <span className="home-kicker">Research Desk · v{team.version}</span>
          <h2 id="research-team-title">4인 리서치팀 업무 보고</h2>
        </div>
        <span className="team-confidence">최부장 확신도 {choi.confidence || '낮음'}</span>
      </div>

      <div className="research-team-grid">
        <RoleCard name="김사원" role="원문·사실 정리" accent="kim">
          <p className="team-summary">글 {kim.post_count || 0}건 · 필자 {kim.source_count || 0}명 · 직접 의견 {kim.opinion_count || 0}건</p>
          {kim.key_evidence?.slice(0, 4).map((item, index) => (
            <a className="team-evidence" href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${index}`}>
              <b>{item.topic}</b><span>{item.fact}</span><small>{item.source} · 근거 {item.evidence_grade}</small>
            </a>
          ))}
          <List title="데이터 공백" items={kim.data_gaps} />
        </RoleCard>

        <RoleCard name="이대리" role="필자 의견 비교" accent="lee">
          <List title="공통 의견" items={lee.consensus} />
          <List title="의견 충돌" items={lee.conflicts} />
          <List title="소수 시각" items={lee.minority} />
          <List title="추가 질문" items={lee.questions} />
        </RoleCard>

        <RoleCard name="박과장" role="객관 데이터 감사" accent="park">
          <List title="확인된 사실" items={park.verified} />
          <List title="주장과 데이터 역행" items={park.contradictions} />
          <List title="핵심 리스크" items={park.risks} />
          <List title="판단 한계" items={park.data_gaps} />
        </RoleCard>

        <RoleCard name="최부장" role="최종 종합판단" accent="choi">
          <div className="team-decision-row"><strong>{choi.decision || '판단 유보'}</strong><span>확신도 {choi.confidence || '낮음'}</span></div>
          {choi.summary && <p className="team-final-summary">{choi.summary}</p>}
          <List title="판단 근거" items={choi.reasons} />
          {choi.counter_case && <div className="team-counter"><b>가장 강한 반론</b><p>{choi.counter_case}</p></div>}
          <List title="추가 확인" items={choi.watch_items} />
          <List title="판단 재검토 조건" items={choi.invalidation_conditions} />
        </RoleCard>
      </div>
    </section>
  );
}
