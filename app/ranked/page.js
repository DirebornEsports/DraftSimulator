'use client';

import { useEffect, useMemo, useState } from 'react';
import { Header, HeroImg, Seg, TierChip } from '@/components/ui';
import { useHeroes, useMatchups } from '@/lib/useHeroes';
import { addRankedMeta, suggest, scoreHero, POSITIONS, POS_SHORT } from '@/lib/ranked';
import { bestAssignment, laneReport } from '@/lib/positions';
import { tierOf } from '@/lib/grade';
import { addHistory, newId } from '@/lib/store';
import db from '@/components/draftboard.module.css';
import styles from './ranked.module.css';

const ATTRS = [['str', 'Strength'], ['agi', 'Agility'], ['int', 'Intelligence'], ['uni', 'Universal']];
const MAX_BANS = 16;
const empty = () => ({ allies: {}, enemies: [], enemyPos: {}, bans: [] });

// Manual ranked helper: you enter bans and picks as they happen in your game,
// and it suggests heroes for your position (or any open slot on your team).
export default function RankedPage() {
  const { heroes: rawHeroes, loading, error } = useHeroes();
  const heroes = useMemo(() => addRankedMeta(rawHeroes), [rawHeroes]);
  const byId = useMemo(() => Object.fromEntries(heroes.map((h) => [h.id, h])), [heroes]);
  const { ensure, matchups } = useMatchups();

  const [myPos, setMyPos] = useState('2');
  const [side, setSide] = useState('radiant');
  const [board, setBoard] = useState(empty);
  const [target, setTarget] = useState({ type: 'enemy' });
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null);

  const allyIds = POSITIONS.map((p) => board.allies[p]).filter(Boolean);
  const used = useMemo(() => new Set([...Object.values(board.allies), ...board.enemies, ...board.bans]), [board]);
  const suggestPos = target.type === 'ally' && !board.allies[target.pos] ? target.pos : myPos;

  // Load matchup data for every picked hero.
  useEffect(() => { ensure([...allyIds, ...board.enemies]); }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = (heroId) => {
    if (!heroId || used.has(heroId)) return;
    setSaved(null);
    setBoard((b) => {
      if (target.type === 'ally') return { ...b, allies: { ...b.allies, [target.pos]: heroId } };
      if (target.type === 'enemy') return b.enemies.length >= 5 ? b : { ...b, enemies: [...b.enemies, heroId] };
      return b.bans.length >= MAX_BANS ? b : { ...b, bans: [...b.bans, heroId] };
    });
    if (target.type === 'ally') {
      const next = POSITIONS.find((p) => p !== target.pos && !board.allies[p]);
      setTarget(next ? { type: 'ally', pos: next } : { type: 'enemy' });
    }
    setQ('');
  };
  const pickForPos = (pos, heroId) => {
    if (used.has(heroId)) return;
    setSaved(null);
    setBoard((b) => ({ ...b, allies: { ...b.allies, [pos]: heroId } }));
  };
  const removeAlly = (pos) => { setSaved(null); setBoard((b) => { const a = { ...b.allies }; delete a[pos]; return { ...b, allies: a }; }); };
  const removeEnemy = (id) => { setSaved(null); setBoard((b) => { const ep = { ...b.enemyPos }; delete ep[id]; return { ...b, enemies: b.enemies.filter((x) => x !== id), enemyPos: ep }; }); };
  const removeBan = (id) => setBoard((b) => ({ ...b, bans: b.bans.filter((x) => x !== id) }));
  const setEnemyPos = (id, pos) => setBoard((b) => ({ ...b, enemyPos: { ...b.enemyPos, [id]: pos } }));

  const suggestions = useMemo(() => {
    if (!heroes.length || board.allies[suggestPos]) return [];
    const allies = POSITIONS.filter((p) => p !== suggestPos).map((p) => board.allies[p]).filter(Boolean);
    return suggest({ pos: suggestPos, allies, enemies: board.enemies, byId, matchups, used, n: 8 });
  }, [heroes.length, board, suggestPos, matchups, byId, used]);

  // Your pick graded against the board as it stands.
  const mine = board.allies[myPos];
  const myGrade = mine ? scoreHero({ heroId: mine, pos: myPos, allies: POSITIONS.filter((p) => p !== myPos).map((p) => board.allies[p]).filter(Boolean), enemies: board.enemies, byId, matchups }) : null;
  const myBest = mine ? suggest({ pos: myPos, allies: POSITIONS.filter((p) => p !== myPos).map((p) => board.allies[p]).filter(Boolean), enemies: board.enemies, byId, matchups, used: new Set([...used].filter((x) => x !== mine)), n: 1 })[0] : null;

  // Lanes once both teams are complete.
  const lanes = useMemo(() => {
    if (allyIds.length < 5 || board.enemies.length < 5) return null;
    if (![...allyIds, ...board.enemies].every((id) => id in matchups)) return null;
    const myFinal = Object.fromEntries(POSITIONS.map((p) => [board.allies[p], p]));
    const fixed = Object.fromEntries(Object.entries(board.enemyPos).filter(([, p]) => p));
    const theirFinal = bestAssignment(board.enemies, byId, fixed);
    return laneReport({ myFinal, theirFinal, byId, matchups });
  }, [board, matchups, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const laneAvg = lanes ? Math.round(lanes.reduce((a, l) => a + l.score, 0) / 3) : null;
    const score = myGrade ? (laneAvg != null ? Math.round(0.75 * myGrade.score + 0.25 * laneAvg) : myGrade.score) : laneAvg || 0;
    try {
      const e = await addHistory({
        id: newId(), kind: 'ranked', mode: 'ranked', at: Date.now(), tier: tierOf(score), score,
        title: 'Ranked helper · Pos ' + myPos + (mine ? ' ' + byId[mine].name : ''),
        meta: (side === 'radiant' ? 'Radiant' : 'Dire') + (lanes ? ' · lanes ' + lanes.map((l) => l.tier).join('/') : ''),
        ranked: { myPos, side, board },
      });
      setSaved(e.id);
    } catch {}
  };

  const right = <button type="button" className="btn btn-ghost" onClick={() => { setBoard(empty()); setTarget({ type: 'enemy' }); setSaved(null); }}>Clear board</button>;

  if (error) return <Shell right={right}><div className="center-note">Couldn&rsquo;t load hero data: {error}</div></Shell>;
  if (loading) return <Shell right={right}><div className="center-note">Loading heroes…</div></Shell>;

  const query = q.trim().toLowerCase();
  const targetLabel = target.type === 'ally' ? 'Your team · Pos ' + target.pos + ' ' + POS_SHORT[target.pos] : target.type === 'enemy' ? 'Enemy team (' + board.enemies.length + '/5)' : 'Bans (' + board.bans.length + ')';

  return (
    <Shell right={right}>
      <div className={styles.helperTop}>
        <div className={styles.phaseHead} style={{ margin: 0 }}>
          <span className="label">Ranked helper · All Pick</span>
          <h1 className={styles.h1}>Enter your game, get pick suggestions</h1>
          <span className="muted" style={{ fontSize: 13 }}>Choose where a hero goes, then click the hero. Nothing is picked for you.</span>
        </div>
        <div className={styles.helperCfg}>
          <div className={styles.block}><span className="label">Your position</span>
            <div className={styles.posRowSm}>
              {POSITIONS.map((p) => (
                <button key={p} type="button" aria-pressed={myPos === p} className={styles.posBtnSm + (myPos === p ? ' ' + styles.on : '')} onClick={() => setMyPos(p)}><b>{p}</b><span>{POS_SHORT[p]}</span></button>
              ))}
            </div>
          </div>
          <div className={styles.block}><span className="label">Side</span><Seg small label="Side" value={side} onChange={setSide} options={[['radiant', 'Radiant'], ['dire', 'Dire']]} /></div>
        </div>
      </div>

      <div className={styles.board}>
        <aside className={'panel ' + styles.team}>
          <div className={styles.teamHead}><span className={styles.teamName}>Your team</span><span className="pill-accent">{side.toUpperCase()}</span></div>
          {POSITIONS.map((p) => {
            const h = byId[board.allies[p]];
            const isTarget = target.type === 'ally' && target.pos === p;
            const isYou = p === myPos;
            return (
              <div key={p} className={styles.slotWrap}>
                <button type="button" aria-pressed={isTarget} onClick={() => setTarget({ type: 'ally', pos: p })}
                  className={db.slot + (h ? '' : ' ' + db.slotEmpty) + ' ' + styles.slotBtn + (isTarget ? ' ' + styles.slotTarget : '') + (isYou ? ' ' + styles.youSlot : '')}>
                  {h ? <HeroImg hero={h} className={db.slotImg} /> : <span className={db.slotNum}>Pos {p} · {POS_SHORT[p]}{isYou ? ' · YOU' : ''}</span>}
                  {h && <div className={db.slotInfo}><span className={db.slotName}>{isYou ? 'You · ' : ''}{h.name}</span><span className={styles.slotPos}>{p}</span></div>}
                </button>
                {h && <button type="button" className={styles.remove} aria-label={'Remove ' + h.name} onClick={() => removeAlly(p)}>×</button>}
              </div>
            );
          })}
        </aside>

        <div className={styles.center}>
          <div className={styles.targetBar}>
            <span className="label">Adding to</span>
            <div className={styles.targetBtns}>
              <button type="button" aria-pressed={target.type === 'ally'} className={target.type === 'ally' ? styles.on : ''} onClick={() => setTarget({ type: 'ally', pos: POSITIONS.find((p) => !board.allies[p]) || myPos })}>Your team</button>
              <button type="button" aria-pressed={target.type === 'enemy'} className={target.type === 'enemy' ? styles.on : ''} onClick={() => setTarget({ type: 'enemy' })}>Enemy</button>
              <button type="button" aria-pressed={target.type === 'ban'} className={target.type === 'ban' ? styles.on : ''} onClick={() => setTarget({ type: 'ban' })}>Bans</button>
            </div>
            <span className={styles.targetNow}>{targetLabel}</span>
          </div>

          {suggestions.length > 0 && (
            <div className={styles.suggPanel}>
              <div className={styles.rowBetween}>
                <span className="label">Suggested for Pos {suggestPos} · {POS_SHORT[suggestPos]}{suggestPos === myPos ? ' (you)' : ''}</span>
                <span className="muted" style={{ fontSize: 12 }}>Click to put it in that slot</span>
              </div>
              <div className={styles.suggGrid}>
                {suggestions.map((s, i) => (
                  <button key={s.id} type="button" className={'anim-up ' + styles.card} style={{ '--d': i * 35 + 'ms' }} onClick={() => pickForPos(suggestPos, s.id)} title={[...s.pros, ...s.cons].join(' · ')}>
                    <HeroImg hero={byId[s.id]} />
                    <span className={styles.cardTier}><TierChip tier={s.tier} size={24} /></span>
                    <span className={styles.cardName}>{byId[s.id].name}</span>
                    <span className={styles.cardWhy}>{s.pros[0]}</span>
                    {s.cons[0] && <span className={styles.cardCon}>{s.cons[0]}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={'panel ' + db.pool}>
            <div className={db.poolBar}>
              <label className={db.search}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8f8f8f" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                <span className="sr-only">Search heroes</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const m = heroes.filter((h) => !used.has(h.id) && h.name.toLowerCase().includes(q.trim().toLowerCase()));
                  if (m.length === 1) place(m[0].id);
                }} placeholder="Search heroes (Enter adds the only match)" />
              </label>
            </div>
            <div className={db.poolScroll} style={{ height: 420 }}>
              {ATTRS.map(([attr, label]) => (
                <section key={attr} className={db.attrBlock}>
                  <span className={db.attrHead}><span className={db.dot} style={{ background: 'var(--' + attr + ')' }} />{label}</span>
                  <div className={db.grid}>
                    {heroes.filter((h) => h.attr === attr).map((h) => {
                      const isUsed = used.has(h.id);
                      const dim = query && !h.name.toLowerCase().includes(query);
                      return (
                        <button key={h.id} type="button" title={h.name} aria-label={h.name + (isUsed ? ' (already on the board)' : '')}
                          className={[db.tile, isUsed ? db.used : '', dim ? db.dim : ''].join(' ')}
                          disabled={isUsed} onClick={() => place(h.id)}>
                          <HeroImg hero={h} alt="" /><span className={db.tileName}>{h.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          {(myGrade || lanes) && (
            <div className={styles.summary}>
              {myGrade && (
                <div className={'panel anim-up ' + styles.sumBox}>
                  <div className={styles.rowBetween}><span className="label">Your pick · {byId[mine].name} · Pos {myPos}</span><TierChip tier={myGrade.tier} /></div>
                  {myGrade.pros.map((t, i) => <span key={i} className={styles.pro}>+ {t}</span>)}
                  {myGrade.cons.map((t, i) => <span key={i} className={styles.con}>− {t}</span>)}
                  {myBest && myBest.id !== mine && myBest.score > myGrade.score && <span className={styles.best}>Top option for this lineup: <b>{byId[myBest.id].name}</b> ({myBest.tier})</span>}
                </div>
              )}
              {lanes && lanes.map((l) => (
                <div key={l.key} className={'panel anim-up ' + styles.sumBox}>
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
                <span className="muted" style={{ fontSize: 12 }}>{lanes ? 'Enemy positions use your choices, the rest are estimated.' : 'Fill both teams to see lane matchups.'}</span>
                <button type="button" className="btn btn-accent" disabled={!!saved} onClick={save}>{saved ? 'Saved to history' : 'Save to history'}</button>
              </div>
            </div>
          )}
        </div>

        <aside className={'panel ' + styles.team}>
          <button type="button" aria-pressed={target.type === 'enemy'} className={styles.teamHeadBtn + (target.type === 'enemy' ? ' ' + styles.headTarget : '')} onClick={() => setTarget({ type: 'enemy' })}>
            <span className={styles.teamName}>Enemy</span><span className="pill-ghost">{board.enemies.length}/5</span>
          </button>
          {[0, 1, 2, 3, 4].map((i) => {
            const id = board.enemies[i];
            const h = byId[id];
            return (
              <div key={i} className={styles.slotWrap}>
                <div className={db.slot + (h ? '' : ' ' + db.slotEmpty)} onClick={() => !h && setTarget({ type: 'enemy' })}>
                  {h ? <HeroImg hero={h} className={db.slotImg} /> : <span className={db.slotNum}>Enemy pick {i + 1}</span>}
                  {h && (
                    <div className={db.slotInfo}>
                      <span className={db.slotName}>{h.name}</span>
                      <label className={styles.enemyPos}><span className="sr-only">Position of {h.name}</span>
                        <select value={board.enemyPos[id] || ''} onChange={(e) => setEnemyPos(id, e.target.value)}>
                          <option value="">Pos ?</option>
                          {POSITIONS.map((p) => <option key={p} value={p}>Pos {p}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </div>
                {h && <button type="button" className={styles.remove} aria-label={'Remove ' + h.name} onClick={() => removeEnemy(id)}>×</button>}
              </div>
            );
          })}
          <button type="button" aria-pressed={target.type === 'ban'} className={styles.teamHeadBtn + (target.type === 'ban' ? ' ' + styles.headTarget : '')} onClick={() => setTarget({ type: 'ban' })} style={{ marginTop: 6 }}>
            <span className="label">Bans</span><span className="muted" style={{ fontSize: 12 }}>{board.bans.length ? board.bans.length : 'click to add'}</span>
          </button>
          <div className={db.bans}>
            {board.bans.map((id) => (
              <button key={id} type="button" className={db.ban + ' ' + styles.banBtn} title={'Remove ' + byId[id].name + ' from bans'} onClick={() => removeBan(id)}>
                <HeroImg hero={byId[id]} alt={byId[id].name + ' banned'} />
              </button>
            ))}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children, right }) {
  return (<div className="page"><Header right={right} /><main className="wrap" style={{ paddingTop: 20 }}>{children}</main></div>);
}
