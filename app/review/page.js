'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header, Gauge, TierChip, HeroImg } from '@/components/ui';
import { PHASES } from '@/lib/draft';
import { overallGrade, tierOf } from '@/lib/grade';
import { useHeroes } from '@/lib/useHeroes';
import { getEntry, getHistory } from '@/lib/store';
import styles from './review.module.css';

export default function ReviewPage() {
  return (
    <Suspense fallback={<Frame><div className="center-note">Loading review…</div></Frame>}>
      <Review />
    </Suspense>
  );
}

function Frame({ children }) {
  return (
    <div className="page">
      <Header right={<><Link href="/draft" className="btn btn-ghost">Draft again</Link></>} />
      <main className="wrap">{children}</main>
    </div>
  );
}

function Review() {
  const params = useSearchParams();
  const { byId, loading } = useHeroes();
  const [entry, setEntry] = useState(undefined);

  useEffect(() => {
    const id = params.get('id');
    const e = id ? getEntry(id) : getHistory().find((x) => x.kind === 'draft');
    setEntry(e || null);
  }, [params]);

  if (entry === undefined || loading) return <Frame><div className="center-note">Loading review…</div></Frame>;
  if (!entry) return <Frame><div className="center-note">No finished draft found. <Link href="/draft">Start one</Link>.</div></Frame>;

  const log = entry.log;
  const g = overallGrade(log);
  const goodCount = log.filter((l) => l.tier === 'S' || l.tier === 'A').length;
  const lowCount = log.filter((l) => 'CDF'.includes(l.tier)).length;
  const phases = PHASES.map((p) => {
    const items = log.filter((l) => l.step >= p.from && l.step <= p.to);
    if (!items.length) return { name: p.name, tier: null };
    const s = Math.round(items.reduce((a, l) => a + l.score, 0) / items.length);
    return { name: p.name, tier: tierOf(s), score: s };
  });

  const W = 560, H = 170;
  const pts = log.map((l, i) => {
    const x = log.length > 1 ? (i / (log.length - 1)) * W : W / 2;
    const y = H - ((l.score - 20) / 80) * (H - 20);
    return { x: Math.round(x), y: Math.round(Math.max(8, Math.min(H, y))), l };
  });
  const yB = Math.round(H - ((65 - 20) / 80) * (H - 20));
  const sorted = [...log].sort((a, b) => a.score - b.score);
  const worst = sorted.slice(0, 2);
  const best = sorted[sorted.length - 1];
  const name = (id) => (byId[id] ? byId[id].name : 'No hero');
  const label = (l) => (l.type === 'pick' ? 'Pick ' : 'Ban ') + name(l.heroId);
  const enemyTeam = entry.userTeam === 1 ? 2 : 1;
  const mySide = entry.settings.side;

  return (
    <Frame>
      <div className={styles.titleRow}>
        <div className={styles.title}>
          <h1 className={styles.h1}>Draft review</h1>
          <div className={styles.tags}>
            <span>{entry.settings.mode === 'live' ? 'Live feedback' : 'Blind mode'}</span>
            <span>{cap(mySide)} · {entry.userTeam === 1 ? '1st' : '2nd'} pick</span>
            <span>{entry.meta}</span>
          </div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{new Date(entry.at).toLocaleString()}</span>
      </div>

      <div className={styles.topGrid}>
        <div className={'notch ' + styles.overall}>
          <span className={styles.overallHead}>Overall draft</span>
          <Gauge score={g.score} tier={g.tier} sub={g.score + ' / 100'} size={180} onOrange />
          <div className={styles.stats}>
            <span>Actions<b>{log.length}</b></span>
            <span>S / A<b>{goodCount}</b></span>
            <span>C or lower<b>{lowCount}</b></span>
          </div>
        </div>

        <div className={'panel ' + styles.phases}>
          <span className="label">By phase</span>
          {phases.map((p) => (
            <div key={p.name} className={styles.phaseRow}><span>{p.name}</span>{p.tier ? <TierChip tier={p.tier} size={28} /> : <span className="muted">—</span>}</div>
          ))}
        </div>

        <div className={'panel ' + styles.chart}>
          <div className={styles.row}><span className="label">Score per action</span><span className="muted" style={{ fontSize: 12 }}>dashed line = B grade</span></div>
          <svg viewBox={'-12 -4 ' + (W + 24) + ' ' + (H + 34)} className={styles.svg} role="img" aria-label={'Score for each of your ' + log.length + ' actions'}>
            <line x1="0" y1={yB} x2={W} y2={yB} stroke="#3a3a3a" strokeDasharray="4 6" />
            <polyline points={pts.map((p) => p.x + ',' + p.y).join(' ')} fill="none" stroke="#ff3d00" strokeWidth="3" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px rgba(255,61,0,.7))' }} />
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="4.5" fill="#0b0b0b" stroke={worst.includes(p.l) ? '#ededed' : '#ff3d00'} strokeWidth="2" />
                <text x={p.x} y={H + 26} fill="#8f8f8f" fontSize="11" textAnchor="middle">{p.l.type === 'pick' ? 'P' : 'B'}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div className={styles.bottom}>
        <div className={'panel ' + styles.tableWrap}>
          <table className={styles.table}>
            <caption className="label">Step by step</caption>
            <thead><tr><th>Step</th><th>Your action</th><th>Grade</th><th>Best alternative</th><th>Main reason</th></tr></thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.step}>
                  <td className="muted">{l.step + 1}</td>
                  <td>
                    <span className={styles.heroCell}>
                      {byId[l.heroId] ? <HeroImg hero={byId[l.heroId]} className={styles.tImg + (l.type === 'ban' ? ' ' + styles.banned : '')} /> : <span className={styles.tImg} />}
                      <span>{l.type === 'pick' ? 'Pick' : 'Ban'} {name(l.heroId)}</span>
                    </span>
                  </td>
                  <td><TierChip tier={l.tier} size={28} /></td>
                  <td>
                    {l.alts && l.alts[0] ? (
                      <span className={styles.heroCell}><HeroImg hero={byId[l.alts[0].heroId]} className={styles.tImg} /><span>{name(l.alts[0].heroId)} · {l.alts[0].tier}</span></span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{l.cons[0] && 'CDF'.includes(l.tier) ? l.cons[0] : l.pros[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.side}>
          <span className="label">Key moments</span>
          {worst.map((l) => (
            <div key={'w' + l.step} className={'panel ' + styles.moment}>
              <span className={styles.momentTag}>Step {l.step + 1} · {l.tier}</span>
              <span className={styles.momentTitle}>{label(l)}</span>
              <span className={styles.momentBody}>{l.cons.join('. ')}.{l.alts && l.alts[0] ? ' ' + name(l.alts[0].heroId) + ' was open and graded ' + l.alts[0].tier + '.' : ''}</span>
            </div>
          ))}
          {best && (
            <div className={'panel ' + styles.moment}>
              <span className={styles.momentTag}>Best action · {best.tier}</span>
              <span className={styles.momentTitle}>{label(best)}</span>
              <span className={styles.momentBody}>{best.pros.join('. ')}.</span>
            </div>
          )}
          <div className={'panel ' + styles.lineups}>
            <span className={styles.lineHead} style={{ color: 'var(--accent-soft)' }}>{cap(mySide)} · You</span>
            <span className={styles.lineHead}>{cap(mySide === 'radiant' ? 'dire' : 'radiant')} · Opponent</span>
            {[0, 1, 2, 3, 4].map((i) => [entry.picks[entry.userTeam][i], entry.picks[enemyTeam][i]].map((hid, j) => (
              <span key={i + '-' + j} className={styles.lineHero}><HeroImg hero={byId[hid]} className={styles.lineImg} /><span>{name(hid)}</span></span>
            )))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
