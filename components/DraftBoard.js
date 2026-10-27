'use client';

import { useState } from 'react';
import { Gauge, TierChip, HeroImg } from './ui';
import { STEPS, phaseOf } from '@/lib/draft';
import styles from './draftboard.module.css';

const ATTRS = [['str', 'Strength'], ['agi', 'Agility'], ['int', 'Intelligence'], ['uni', 'Universal']];
const fmt = (s) => { const v = Math.max(0, Math.ceil(s)); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Shared Captain's Mode board used by the simulator and multiplayer rooms.
 * picks/bans: { 1: [heroId|null], 2: [...] }   step: 0..24
 * myTeam: 1 | 2 | null (spectator)              sides: { 1: 'radiant', 2: 'dire' }
 * timer: { left, reserve: { 1, 2 }, countdown }  (seconds)
 * log: graded actions of myTeam (for live feedback)
 */
export default function DraftBoard({
  heroes, byId, picks, bans, step, myTeam, sides, names = {}, badges = {},
  sel, onSelect, onLock, canAct, busy, timer, live, log = [], waitingText, doneAction,
}) {
  const [q, setQ] = useState('');
  const done = step >= STEPS.length;
  const cur = done ? null : STEPS[step];
  const leftTeam = myTeam || 1;
  const rightTeam = leftTeam === 1 ? 2 : 1;
  const used = new Set([...picks[1], ...picks[2], ...bans[1], ...bans[2]].filter(Boolean));
  const query = q.trim().toLowerCase();
  const tierOf = {}; log.forEach((l) => { if (l.heroId) tierOf[l.heroId] = l.tier; });
  const last = log[log.length - 1];
  const teamLabel = (t) => names[t] || cap(sides[t]);

  let headline;
  if (done) headline = 'All 24 actions locked';
  else if (timer && timer.countdown > 0) headline = 'Draft starts in ' + Math.ceil(timer.countdown) + '…';
  else if (myTeam && cur.team === myTeam) headline = 'Step ' + (step + 1) + ' of 24 · You ' + cur.type;
  else headline = 'Step ' + (step + 1) + ' of 24 · ' + teamLabel(cur.team) + ' ' + cur.type + 's…';

  const counts = { pick: { 1: 0, 2: 0 }, ban: { 1: 0, 2: 0 } };
  const strip = STEPS.map((s) => {
    const n = counts[s.type][s.team]++;
    const arr = s.type === 'pick' ? picks[s.team] : bans[s.team];
    return { ...s, n: n + 1, hid: s.i < step ? arr[n] : undefined, mine: s.team === leftTeam, isCur: s.i === step };
  });

  const teamCol = (team, isMine) => (
    <aside className={'panel ' + styles.team}>
      <div className={styles.teamHead}><span className={styles.teamName}>{teamLabel(team)}</span>{badges[team]}</div>
      {[0, 1, 2, 3, 4].map((i) => {
        const hid = picks[team][i];
        const h = byId[hid];
        const isCurSlot = cur && cur.type === 'pick' && cur.team === team && picks[team].length === i;
        return (
          <div key={i} className={styles.slot + (h ? '' : ' ' + styles.slotEmpty)} style={isCurSlot ? { borderColor: 'var(--accent)', borderStyle: 'solid' } : undefined}>
            {h ? <HeroImg hero={h} className={styles.slotImg} /> : <span className={styles.slotNum}>Pick {i + 1}</span>}
            {h && (
              <div className={styles.slotInfo}>
                <span className={styles.slotName}>{h.name}</span>
                {isMine && live && tierOf[hid] && <TierChip tier={tierOf[hid]} size={26} />}
              </div>
            )}
          </div>
        );
      })}
      <span className="label" style={{ marginTop: 6 }}>Bans</span>
      <div className={styles.bans}>
        {Array.from({ length: 7 }, (_, i) => {
          const done_ = i < bans[team].length;
          const h = byId[bans[team][i]];
          return (
            <div key={i} className={styles.ban + (done_ ? '' : ' ' + styles.banEmpty)} title={h ? h.name + ' (banned)' : done_ ? 'Missed ban' : 'Ban ' + (i + 1)}>
              {h && <HeroImg hero={h} alt={h.name + ' banned'} />}
              {done_ && !h && <span className={styles.missed}>missed</span>}
            </div>
          );
        })}
      </div>
    </aside>
  );

  return (
    <div className={styles.boardWrap}>
      <div className={styles.top}>
        <div className={styles.stepInfo}>
          <span className="label">{cur ? phaseOf(step).name : 'Draft complete'}</span>
          <span className={styles.stepLabel}>{headline}</span>
        </div>
        {timer && !done && (
          <div className={styles.timers}>
            <div className={styles.timeBox}><span className="label">Step time</span><span className={'display ' + styles.time}>{fmt(timer.left)}</span></div>
            <div className={styles.reserve}><span className="muted">{teamLabel(leftTeam)} reserve</span><span>{fmt(timer.reserve[leftTeam])}</span></div>
            <div className={styles.reserve}><span className="muted">{teamLabel(rightTeam)} reserve</span><span>{fmt(timer.reserve[rightTeam])}</span></div>
          </div>
        )}
      </div>

      <ol className={styles.strip} aria-label="Draft order">
        {strip.map((c) => {
          const h = byId[c.hid];
          const cls = [styles.cell, c.mine ? styles.cellMine : styles.cellAi, c.isCur ? styles.cellCur : '', c.type === 'ban' ? styles.cellBan : ''].join(' ');
          return (
            <li key={c.i} className={cls} title={teamLabel(c.team) + ' · ' + c.type + ' ' + c.n + (h ? ' · ' + h.name : '')}>
              {h ? <HeroImg hero={h} className={styles.cellImg} /> : <span className={styles.cellTag}>{c.type === 'pick' ? 'P' : 'B'}{c.n}</span>}
            </li>
          );
        })}
      </ol>

      <div className={styles.board}>
        {teamCol(leftTeam, !!myTeam)}
        <div className={'panel ' + styles.pool}>
          <div className={styles.poolBar}>
            <label className={styles.search}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8f8f8f" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <span className="sr-only">Search heroes</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search heroes" />
            </label>
          </div>
          <div className={styles.poolScroll}>
            {ATTRS.map(([attr, label]) => (
              <section key={attr} className={styles.attrBlock}>
                <span className={styles.attrHead}><span className={styles.dot} style={{ background: 'var(--' + attr + ')' }} />{label}</span>
                <div className={styles.grid}>
                  {heroes.filter((h) => h.attr === attr).map((h) => {
                    const isUsed = used.has(h.id);
                    const isSel = sel === h.id;
                    const dim = query && !h.name.toLowerCase().includes(query);
                    return (
                      <button
                        key={h.id} type="button" title={h.name}
                        className={[styles.tile, isUsed ? styles.used : '', isSel ? styles.sel : '', dim ? styles.dim : ''].join(' ')}
                        disabled={isUsed || !canAct || busy}
                        aria-pressed={isSel} aria-label={h.name + (isUsed ? ' (taken)' : '')}
                        onClick={() => onSelect && onSelect(h.id)}
                        onDoubleClick={() => onLock && onLock(h.id)}
                      >
                        <HeroImg hero={h} alt="" />
                        <span className={styles.tileName}>{h.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className={styles.action}>
            <div className={styles.selected}>
              {sel && byId[sel] ? (<><HeroImg hero={byId[sel]} className={styles.selImg} /><span>{byId[sel].name}</span></>) :
                <span className="muted">{done ? 'Draft complete.' : canAct ? 'Choose a hero to ' + cur.type + ' (double-click to lock in).' : (waitingText || 'Waiting for ' + teamLabel(cur.team) + '…')}</span>}
            </div>
            {!done ? (
              myTeam ? (
                <button type="button" className="btn btn-accent" disabled={!sel || !canAct || busy} onClick={() => onLock && onLock(sel)}>
                  {cur && cur.type === 'pick' ? 'Lock in pick' : 'Lock in ban'}
                </button>
              ) : <span className="muted" style={{ fontSize: 13 }}>Spectating</span>
            ) : doneAction}
          </div>
        </div>
        {teamCol(rightTeam, false)}
      </div>

      {myTeam && (live ? (
        <div className={styles.feedback}>
          <div className={'panel ' + styles.fbGauge}>
            <span className={'label ' + styles.fbHead}>{last ? (last.type === 'pick' ? 'Your last pick' : 'Your last ban') : 'Waiting for your first action'}</span>
            <Gauge score={last ? last.score : 0} tier={last ? last.tier : '–'} sub={last ? last.score + ' / 100' : 'no action yet'} size={180} />
            {last && byId[last.heroId] ? (
              <div className={styles.fbHero}><HeroImg hero={byId[last.heroId]} className={styles.fbHeroImg} /><span>{byId[last.heroId].name}</span></div>
            ) : <span className="muted" style={{ fontSize: 14 }}>{last ? 'Ban lost to the timer' : 'Pick or ban to get graded'}</span>}
          </div>
          <div className={'panel ' + styles.fbList}>
            <span className="label">Why it works</span>
            {(last ? last.pros : ['Strengths of your action appear here.']).map((t, i) => <div key={i} className={styles.fbItem}><span className={styles.plus}>+</span><span>{t}</span></div>)}
          </div>
          <div className={'panel ' + styles.fbList}>
            <span className="label">Risks</span>
            {(last ? last.cons : ['Risks and counters appear here.']).map((t, i) => <div key={i} className={styles.fbItem}><span className={styles.minus}>−</span><span>{t}</span></div>)}
          </div>
          <div className={styles.alts}>
            <span className={styles.altsHead}>Better options</span>
            {last && last.alts.map((a) => byId[a.heroId] && (
              <div key={a.heroId} className={styles.alt}>
                <HeroImg hero={byId[a.heroId]} className={styles.altImg} />
                <span className={styles.altText}><b>{byId[a.heroId].name}</b><span>{a.why}</span></span>
                <span className={'display ' + styles.altTier}>{a.tier}</span>
              </div>
            ))}
            <span className={styles.altNote}>{last ? (last.alts.length ? 'Higher-graded options that were open at this step.' : 'Nothing open graded higher. Good call.') : 'Stronger options show up here after each action.'}</span>
          </div>
        </div>
      ) : (
        <div className={styles.blind}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff6a3d" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <span>Blind mode: no grades until the draft ends. {log.length} of 12 actions locked.</span>
        </div>
      ))}
    </div>
  );
}
