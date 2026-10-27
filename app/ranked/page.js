'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, HeroImg, Seg, TierChip, Gauge } from '@/components/ui';
import { useHeroes, useMatchups } from '@/lib/useHeroes';
import { PICK_ORDER, TURN_SECONDS, addRankedMeta, suggest, banSuggest, aiNominations, resolveBans, aiPick, scoreHero, POSITIONS, POS_SHORT } from '@/lib/ranked';
import { laneReport } from '@/lib/positions';
import { tierOf } from '@/lib/grade';
import { addHistory, newId } from '@/lib/store';
import db from '@/components/draftboard.module.css';
import styles from './ranked.module.css';

const ATTRS = [['str', 'Strength'], ['agi', 'Agility'], ['int', 'Intelligence'], ['uni', 'Universal']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function RankedPage() {
  const { heroes: rawHeroes, loading, error } = useHeroes();
  const heroes = useMemo(() => addRankedMeta(rawHeroes), [rawHeroes]);
  const byId = useMemo(() => Object.fromEntries(heroes.map((h) => [h.id, h])), [heroes]);
  const { ensure, reset: resetMatchups, matchups } = useMatchups();

  const [cfg, setCfg] = useState({ side: 'radiant', pos: '2', first: 'random', control: 'me', timer: false });
  const [phase, setPhase] = useState('setup');
  const [myTeam, setMyTeam] = useState(1);
  const [nom, setNom] = useState(null);
  const [bans, setBans] = useState({ rolls: [], banned: [] });
  const [picks, setPicks] = useState({ 1: [], 2: [] });
  const [sel, setSel] = useState(null);
  const [focusPos, setFocusPos] = useState('2');
  const [left, setLeft] = useState(TURN_SECONDS);
  const [q, setQ] = useState('');
  const [savedId, setSavedId] = useState(null);
  const busy = useRef(false);

  const enemy = myTeam === 1 ? 2 : 1;
  const k = picks[1].length + picks[2].length;
  const turnTeam = k < 10 ? PICK_ORDER[k] : null;
  const myPicks = picks[myTeam];
  const enemyPicks = picks[enemy];
  const userPick = myPicks.find((p) => p.who === 'you');
  const used = useMemo(() => new Set([...bans.banned, ...picks[1].map((p) => p.heroId), ...picks[2].map((p) => p.heroId)]), [bans, picks]);
  const openPos = (team) => POSITIONS.filter((p) => !picks[team].some((x) => x.pos === p));
  const mySlotsLeft = PICK_ORDER.slice(k).filter((t) => t === myTeam).length;
  const mustPickNow = cfg.control === 'me' && !userPick && turnTeam === myTeam && mySlotsLeft <= 1;
  const userTurn = phase === 'pick' && turnTeam === myTeam && (cfg.control === 'team' || !userPick);
  const targetPos = cfg.control === 'me' ? cfg.pos : (openPos(myTeam).includes(focusPos) ? focusPos : openPos(myTeam)[0]);

  const start = () => {
    const first = cfg.first === 'random' ? (Math.random() < 0.5 ? 'us' : 'them') : cfg.first;
    setMyTeam(first === 'us' ? 1 : 2);
    setPicks({ 1: [], 2: [] }); setBans({ rolls: [], banned: [] }); setNom(null); setSel(null); setSavedId(null);
    setFocusPos(cfg.pos); resetMatchups();
    setPhase('ban');
  };

  const nominate = (heroId) => {
    const others = aiNominations(byId, 9, [heroId]);
    const noms = [{ heroId, who: 'you', team: 'mine' }, ...others.map((id, i) => ({ heroId: id, who: 'ai', team: i < 4 ? 'mine' : 'enemy' }))];
    setNom(heroId);
    setBans(resolveBans(noms));
    setSel(null);
    setPhase('banResult');
  };

  const addPick = useCallback(async (team, heroId, pos, who, grade) => {
    setPicks((p) => ({ ...p, [team]: [...p[team], { heroId, pos, who, grade }] }));
    setSel(null); setLeft(TURN_SECONDS);
    ensure([heroId]);
  }, [ensure]);

  // Grade + lock the user's pick.
  const lockUser = async (heroId) => {
    if (!heroId || busy.current) return;
    busy.current = true;
    const m = await ensure([...enemyPicks.map((p) => p.heroId), ...myPicks.map((p) => p.heroId)]);
    const pos = targetPos;
    const grade = scoreHero({ heroId, pos, allies: myPicks.map((p) => p.heroId), enemies: enemyPicks.map((p) => p.heroId), byId, matchups: m });
    const options = suggest({ pos, allies: myPicks.map((p) => p.heroId), enemies: enemyPicks.map((p) => p.heroId), byId, matchups: m, used, n: 3 });
    await addPick(myTeam, heroId, pos, 'you', { ...grade, best: options[0] && options[0].id !== heroId ? options[0] : null });
    busy.current = false;
  };

  const aiMove = useCallback(async (team) => {
    if (busy.current) return;
    busy.current = true;
    const allies = picks[team].map((p) => p.heroId);
    const foes = picks[team === 1 ? 2 : 1].map((p) => p.heroId);
    const m = await ensure([...allies, ...foes]);
    await new Promise((r) => setTimeout(r, 650));
    let open = POSITIONS.filter((p) => !picks[team].some((x) => x.pos === p));
    if (team === myTeam && cfg.control === 'me' && !picks[team].some((p) => p.who === 'you')) open = open.filter((p) => p !== cfg.pos);
    const { heroId, pos } = aiPick({ openPositions: open, allies, enemies: foes, byId, matchups: m, used });
    busy.current = false;
    await addPick(team, heroId, pos, 'ai', null);
  }, [picks, ensure, byId, used, addPick, myTeam, cfg]);

  // Drive AI turns.
  useEffect(() => {
    if (phase !== 'pick' || k >= 10) return;
    if (turnTeam === enemy) { aiMove(enemy); return; }
    if (cfg.control === 'me' && userPick) aiMove(myTeam);
  }, [phase, k]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional timer for the user's turn; on timeout a random hero is locked.
  useEffect(() => {
    if (!cfg.timer || !userTurn) return;
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [cfg.timer, userTurn, k]);
  useEffect(() => {
    if (cfg.timer && userTurn && left <= 0) {
      const pool = heroes.filter((h) => !used.has(h.id));
      lockUser(pool[Math.floor(Math.random() * pool.length)].id);
    }
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  // Done.
  useEffect(() => {
    if (phase === 'pick' && k >= 10) setPhase('done');
  }, [phase, k]);

  const passToTeammate = () => aiMove(myTeam);

  // Suggestions.
  const [sugg, setSugg] = useState([]);
  useEffect(() => {
    if (phase !== 'pick' || !userTurn || !heroes.length) { setSugg([]); return; }
    let alive = true;
    (async () => {
      const allies = myPicks.map((p) => p.heroId);
      const foes = enemyPicks.map((p) => p.heroId);
      const m = await ensure([...allies, ...foes]);
      if (alive) setSugg(suggest({ pos: targetPos, allies, enemies: foes, byId, matchups: m, used, n: 6 }));
    })();
    return () => { alive = false; };
  }, [phase, userTurn, k, targetPos, heroes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live score for the selected hero.
  const selScore = sel && phase === 'pick' && userTurn
    ? scoreHero({ heroId: sel, pos: targetPos, allies: myPicks.map((p) => p.heroId), enemies: enemyPicks.map((p) => p.heroId), byId, matchups })
    : null;

  // Results.
  const result = useMemo(() => {
    if (phase !== 'done') return null;
    if (![...myPicks, ...enemyPicks].every((p) => p.heroId in matchups)) return null;
    const myFinal = Object.fromEntries(myPicks.map((p) => [p.heroId, p.pos]));
    const theirFinal = Object.fromEntries(enemyPicks.map((p) => [p.heroId, p.pos]));
    const lanes = laneReport({ myFinal, theirFinal, byId, matchups });
    const graded = myPicks.filter((p) => p.grade);
    const avg = graded.length ? Math.round(graded.reduce((a, p) => a + p.grade.score, 0) / graded.length) : 0;
    const laneAvg = Math.round(lanes.reduce((a, l) => a + l.score, 0) / lanes.length);
    const score = Math.round(0.75 * avg + 0.25 * laneAvg);
    return { lanes, avg, score, tier: tierOf(score) };
  }, [phase, matchups]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result || savedId) return;
    const id = newId();
    const you = myPicks.find((p) => p.who === 'you');
    addHistory({
      id, kind: 'ranked', mode: 'ranked', at: Date.now(), tier: result.tier, score: result.score,
      title: 'Ranked AP · ' + (cfg.control === 'me' && you ? 'Pos ' + you.pos + ' ' + byId[you.heroId].name : 'whole team'),
      meta: cap(cfg.side) + ' · ' + (myTeam === 1 ? 'first' : 'second') + ' pick · lanes ' + result.lanes.map((l) => l.tier).join('/'),
    }).then(() => setSavedId(id)).catch(() => {});
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const right = phase !== 'setup' ? <button type="button" className="btn btn-ghost" onClick={() => setPhase('setup')}>New draft</button> : <span>Ranked All Pick</span>;

  if (error) return <Shell right={right}><div className="center-note">Couldn&rsquo;t load hero data: {error}</div></Shell>;
  if (loading) return <Shell right={right}><div className="center-note">Loading heroes…</div></Shell>;

  // ---------- Setup ----------
  if (phase === 'setup') {
    return (
      <Shell right={right}>
        <div className={styles.setupGrid}>
          <section className={'notch anim-up ' + styles.hero}>
            <span className={styles.heroTop}>Quick draft · Ranked All Pick</span>
            <p className={styles.heroCopy}>Ban nominations, then picks in turns 1-2-2-2-2-1. Get hero suggestions for your role based on Immortal-bracket win rates, counters to what the enemy picked, and synergy with your team.</p>
            <div className={'display anim-word ' + styles.word}>ranked<br />draft</div>
          </section>
          <section className={'panel anim-up ' + styles.setup} style={{ '--d': '80ms' }}>
            <h1 className={styles.h1}>Your game</h1>
            <div className={styles.block}><span className="label">Your position</span>
              <div className={styles.posRow}>
                {POSITIONS.map((p) => (
                  <button key={p} type="button" aria-pressed={cfg.pos === p} className={styles.posBtn + (cfg.pos === p ? ' ' + styles.on : '')} onClick={() => setCfg({ ...cfg, pos: p })}>
                    <b>{p}</b><span>{POS_SHORT[p]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.two}>
              <div className={styles.block}><span className="label">Side</span><Seg label="Side" value={cfg.side} onChange={(v) => setCfg({ ...cfg, side: v })} options={[['radiant', 'Radiant'], ['dire', 'Dire']]} /></div>
              <div className={styles.block}><span className="label">First pick</span><Seg label="First pick" value={cfg.first} onChange={(v) => setCfg({ ...cfg, first: v })} options={[['random', 'Random'], ['us', 'Us'], ['them', 'Them']]} /></div>
            </div>
            <div className={styles.two}>
              <div className={styles.block}><span className="label">You pick for</span><Seg label="You pick for" value={cfg.control} onChange={(v) => setCfg({ ...cfg, control: v })} options={[['me', 'Just me'], ['team', 'Whole team']]} /></div>
              <div className={styles.block}><span className="label">Timer</span><Seg label="Timer" value={cfg.timer ? 'on' : 'off'} onChange={(v) => setCfg({ ...cfg, timer: v === 'on' })} options={[['off', 'Off'], ['on', '30 s']]} /></div>
            </div>
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{cfg.control === 'me' ? 'AI teammates fill the other four roles. Pick on any of your team’s turns, or let a teammate go first.' : 'You draft all five heroes for your team, choosing a role for each pick.'}</span>
            <button type="button" className="btn btn-accent" onClick={start}>Start draft</button>
          </section>
        </div>
      </Shell>
    );
  }

  const pool = (onPick, disabledFn) => {
    const query = q.trim().toLowerCase();
    return (
      <div className={'panel ' + db.pool}>
        <div className={db.poolBar}>
          <label className={db.search}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8f8f8f" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span className="sr-only">Search heroes</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search heroes" />
          </label>
        </div>
        <div className={db.poolScroll} style={{ height: 430 }}>
          {ATTRS.map(([attr, label]) => (
            <section key={attr} className={db.attrBlock}>
              <span className={db.attrHead}><span className={db.dot} style={{ background: 'var(--' + attr + ')' }} />{label}</span>
              <div className={db.grid}>
                {heroes.filter((h) => h.attr === attr).map((h) => {
                  const isUsed = used.has(h.id);
                  const dim = query && !h.name.toLowerCase().includes(query);
                  return (
                    <button key={h.id} type="button" title={h.name} aria-label={h.name} aria-pressed={sel === h.id}
                      className={[db.tile, isUsed ? db.used : '', sel === h.id ? db.sel : '', dim ? db.dim : ''].join(' ')}
                      disabled={isUsed || disabledFn()} onClick={() => setSel(h.id)} onDoubleClick={() => onPick(h.id)}>
                      <HeroImg hero={h} alt="" /><span className={db.tileName}>{h.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  };

  // ---------- Ban nomination ----------
  if (phase === 'ban') {
    const bs = banSuggest({ pos: cfg.pos, byId });
    return (
      <Shell right={right}>
        <div className={styles.phaseHead}><span className="label">Step 1 · Ban nomination</span><h1 className={styles.h1}>Nominate one hero to ban</h1><span className="muted">Every player nominates one. Each nomination has a 50% chance to ban the hero.</span></div>
        <div className={styles.banGrid}>
          <div className={styles.suggestCol}>
            <span className="label">Suggested bans for {POS_SHORT[cfg.pos]}</span>
            {bs.map((b, i) => (
              <button key={b.id} type="button" className={'anim-up ' + styles.sugg} style={{ '--d': i * 50 + 'ms' }} onClick={() => nominate(b.id)}>
                <HeroImg hero={byId[b.id]} className={styles.suggImg} />
                <span className={styles.suggText}><b>{byId[b.id].name}</b>{b.why.map((w, j) => <span key={j}>{w}</span>)}</span>
                <span className={styles.suggAct}>Nominate</span>
              </button>
            ))}
          </div>
          <div className={styles.poolCol}>
            {pool(nominate, () => false)}
            <div className={styles.actionBar}>
              <span>{sel ? byId[sel].name : <span className="muted">Pick any hero, or use a suggestion</span>}</span>
              <button type="button" className="btn btn-accent" disabled={!sel} onClick={() => nominate(sel)}>Nominate</button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- Ban result ----------
  if (phase === 'banResult') {
    return (
      <Shell right={right}>
        <div className={styles.phaseHead}><span className="label">Ban results</span><h1 className={styles.h1}>{bans.banned.length} hero{bans.banned.length === 1 ? '' : 'es'} banned</h1><span className="muted">Each nomination rolled 50%. Your nomination is outlined.</span></div>
        <div className={styles.rolls}>
          {bans.rolls.map((r, i) => (
            <div key={i} className={styles.roll + (r.who === 'you' ? ' ' + styles.rollYou : '') + (r.hit ? ' ' + styles.rollHit : '')} style={{ '--d': (200 + i * 140) + 'ms' }}>
              <HeroImg hero={byId[r.heroId]} />
              <span className={styles.rollName}>{byId[r.heroId].name}</span>
              <span className={styles.rollTag}>{r.hit ? 'BANNED' : 'survived'}</span>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-accent anim-up" style={{ '--d': '1.7s', marginTop: 24 }} onClick={() => { setPhase('pick'); setLeft(TURN_SECONDS); }}>Start picking</button>
      </Shell>
    );
  }

  // ---------- Pick / Done ----------
  const teamCol = (team, mine) => (
    <aside className={'panel ' + styles.team}>
      <div className={styles.teamHead}>
        <span className={styles.teamName}>{cap(mine ? cfg.side : cfg.side === 'radiant' ? 'dire' : 'radiant')}</span>
        <span className={mine ? 'pill-accent' : 'pill-ghost'}>{mine ? 'YOUR TEAM' : 'ENEMY'} · {team === 1 ? '1ST' : '2ND'}</span>
      </div>
      {POSITIONS.map((p) => {
        const pk = picks[team].find((x) => x.pos === p);
        const h = pk && byId[pk.heroId];
        const isYou = mine && cfg.control === 'me' && p === cfg.pos;
        return (
          <div key={p} className={db.slot + (h ? '' : ' ' + db.slotEmpty) + (isYou ? ' ' + styles.youSlot : '')}>
            {h ? <HeroImg hero={h} className={db.slotImg} /> : <span className={db.slotNum}>Pos {p} · {POS_SHORT[p]}{isYou ? ' · YOU' : ''}</span>}
            {h && (
              <div className={db.slotInfo}>
                <span className={db.slotName}>{isYou ? 'You · ' : ''}{h.name}</span>
                <span className={styles.slotPos}>{p}</span>
                {mine && pk.grade && <TierChip tier={pk.grade.tier} size={24} />}
              </div>
            )}
          </div>
        );
      })}
      {mine && bans.banned.length > 0 && (
        <>
          <span className="label" style={{ marginTop: 6 }}>Banned</span>
          <div className={db.bans}>{bans.banned.map((id) => <div key={id} className={db.ban} title={byId[id].name}><HeroImg hero={byId[id]} alt={byId[id].name + ' banned'} /></div>)}</div>
        </>
      )}
    </aside>
  );

  const order = PICK_ORDER.map((t, i) => {
    const before = PICK_ORDER.slice(0, i).filter((x) => x === t).length;
    const pk = picks[t][before];
    return { t, pk, cur: i === k, mine: t === myTeam };
  });

  return (
    <Shell right={right}>
      <div className={styles.pickTop}>
        <div className={styles.phaseHead} style={{ margin: 0 }}>
          <span className="label">{phase === 'done' ? 'Draft complete' : 'Step 2 · Picks (1-2-2-2-2-1)'}</span>
          <h1 className={styles.h1}>
            {phase === 'done' ? 'All 10 heroes picked' : turnTeam === myTeam ? (userTurn ? (cfg.control === 'me' ? 'Your team’s turn — your pick?' : 'Your pick · ' + POS_SHORT[targetPos]) : 'Teammate picking…') : 'Enemy picking…'}
          </h1>
        </div>
        {cfg.timer && userTurn && <span className={'display ' + styles.timer + (left <= 10 ? ' ' + db.timeLow : '')}>0:{String(Math.max(0, left)).padStart(2, '0')}</span>}
      </div>
      <ol className={styles.order} aria-label="Pick order">
        {order.map((o, i) => (
          <li key={i} className={[styles.oCell, o.mine ? styles.oMine : styles.oEnemy, o.cur ? styles.oCur : ''].join(' ')}>
            {o.pk ? <HeroImg key={o.pk.heroId} hero={byId[o.pk.heroId]} className={db.cellImg} /> : <span>{o.mine ? 'Us' : 'Them'}</span>}
          </li>
        ))}
      </ol>

      <div className={styles.board}>
        {teamCol(myTeam, true)}
        <div className={styles.center}>
          {phase === 'done' && !result ? <div className="panel center-note">Scoring lanes…</div> : phase === 'done' ? (
            <div className={styles.summary}>
              <div className={'notch anim-up ' + styles.sumCard}>
                <span className={styles.sumHead}>{cfg.control === 'me' ? 'Your pick' : 'Your draft'}</span>
                <Gauge score={result.score} tier={result.tier} sub={result.score + ' / 100'} size={170} onOrange />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Picks {result.avg} · Lanes {Math.round(result.lanes.reduce((a, l) => a + l.score, 0) / 3)}</span>
              </div>
              <div className={styles.sumSide}>
                {cfg.control === 'me' && userPick && (
                  <div className={'panel anim-up ' + styles.sumBox} style={{ '--d': '80ms' }}>
                    <div className={styles.rowBetween}><span className="label">{byId[userPick.heroId].name} · Pos {userPick.pos}</span><TierChip tier={userPick.grade.tier} /></div>
                    {userPick.grade.pros.map((t, i) => <span key={i} className={styles.pro}>+ {t}</span>)}
                    {userPick.grade.cons.map((t, i) => <span key={i} className={styles.con}>− {t}</span>)}
                    {userPick.grade.best && <span className={styles.best}>Top suggestion at the time: <b>{byId[userPick.grade.best.id].name}</b> ({userPick.grade.best.tier})</span>}
                  </div>
                )}
                {result.lanes.map((l, i) => (
                  <div key={l.key} className={'panel anim-up ' + styles.sumBox} style={{ '--d': (140 + i * 60) + 'ms' }}>
                    <div className={styles.rowBetween}><span className="label">{l.name}</span><TierChip tier={l.tier} /></div>
                    <div className={styles.laneLine}>
                      {l.mineIds.map((id) => <HeroImg key={id} hero={byId[id]} className={styles.laneImg} />)}
                      <span className={styles.vs}>vs</span>
                      {l.theirIds.map((id) => <HeroImg key={id} hero={byId[id]} className={styles.laneImg} />)}
                    </div>
                    {l.notes.map((n, j) => <span key={j} className="muted" style={{ fontSize: 12 }}>{n}</span>)}
                  </div>
                ))}
                <div className={styles.rowBetween}>
                  <span className="muted" style={{ fontSize: 12 }}>{savedId ? 'Saved to history.' : 'Saving…'}</span>
                  <button type="button" className="btn btn-accent" onClick={start}>Draft again</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {userTurn && (
                <div className={styles.suggPanel}>
                  <div className={styles.rowBetween}>
                    <span className="label">Suggested for {POS_SHORT[targetPos]}</span>
                    {cfg.control === 'team' && (
                      <div className={styles.focus}>
                        {openPos(myTeam).map((p) => <button key={p} type="button" aria-pressed={targetPos === p} className={targetPos === p ? styles.on : ''} onClick={() => setFocusPos(p)}>Pos {p}</button>)}
                      </div>
                    )}
                  </div>
                  <div className={styles.suggGrid}>
                    {sugg.map((s, i) => (
                      <button key={s.id} type="button" className={'anim-up ' + styles.card} style={{ '--d': i * 45 + 'ms' }} onClick={() => setSel(s.id)} onDoubleClick={() => lockUser(s.id)} aria-pressed={sel === s.id}>
                        <HeroImg hero={byId[s.id]} />
                        <span className={styles.cardTier}><TierChip tier={s.tier} size={24} /></span>
                        <span className={styles.cardName}>{byId[s.id].name}</span>
                        <span className={styles.cardWhy}>{s.pros[0]}</span>
                      </button>
                    ))}
                    {!sugg.length && <span className="muted">Working out suggestions…</span>}
                  </div>
                </div>
              )}
              {pool(lockUser, () => !userTurn)}
              <div className={styles.actionBar}>
                <span className={styles.selInfo}>
                  {selScore ? (<><TierChip tier={selScore.tier} size={26} /><span><b>{byId[sel].name}</b> · {selScore.pros[0]}{selScore.cons[0] ? ' · ' + selScore.cons[0] : ''}</span></>)
                    : <span className="muted">{userTurn ? 'Choose a hero (double-click to lock in)' : 'Waiting…'}</span>}
                </span>
                <div style={{ display: 'flex', gap: 10 }}>
                  {userTurn && cfg.control === 'me' && !mustPickNow && <button type="button" className="btn btn-ghost" onClick={passToTeammate}>Let a teammate pick</button>}
                  <button type="button" className="btn btn-accent" disabled={!sel || !userTurn} onClick={() => lockUser(sel)}>Lock in</button>
                </div>
              </div>
            </>
          )}
        </div>
        {teamCol(enemy, false)}
      </div>
    </Shell>
  );
}

function Shell({ children, right }) {
  return (<div className="page"><Header right={right} /><main className="wrap" style={{ paddingTop: 20 }}>{children}</main></div>);
}
