'use client';

import { useMemo, useState } from 'react';
import { HeroImg } from './ui';
import { POSITIONS, POS_SHORT, bestAssignment, fitScores, fitReason } from '@/lib/positions';
import styles from './positions.module.css';

/**
 * Shown when a draft ends: the captain confirms Pos 1-5 (or Flex) for each picked hero
 * before opening the review. Pre-filled with the best fit so it's one click when it's right.
 */
export default function PositionsModal({ heroIds, byId, initial = {}, busy, onConfirm, onClose }) {
  const ids = heroIds.filter((id) => byId[id]);
  const [chosen, setChosen] = useState(() => {
    const fixed = {};
    ids.forEach((id) => { if (initial[id] && initial[id] !== 'flex') fixed[id] = initial[id]; });
    const best = bestAssignment(ids, byId, fixed);
    const out = {};
    ids.forEach((id) => { out[id] = initial[id] || best[id] || ''; });
    return out;
  });
  const fits = useMemo(() => Object.fromEntries(ids.map((id) => [id, fitScores(byId[id])])), [ids.join(','), byId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking a position another hero holds swaps the two.
  const choose = (id, value) => {
    const next = { ...chosen };
    if (value !== 'flex') {
      const holder = Object.keys(next).find((k) => Number(k) !== id && next[k] === value);
      if (holder) next[holder] = chosen[id] && chosen[id] !== 'flex' ? chosen[id] : '';
    }
    next[id] = value;
    setChosen(next);
  };
  const reset = () => setChosen(bestAssignment(ids, byId, {}));

  const missing = ids.filter((id) => !chosen[id]).length;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="pos-title">
      <div className={'anim-pop ' + styles.dialog}>
        <div className={styles.head}>
          <div>
            <h2 id="pos-title" className={styles.title}>Set your positions</h2>
            <p className={styles.sub}>Who plays which role? Lanes and the final grade are based on this. Suggested positions are already filled in.</p>
          </div>
          {onClose && <button type="button" className="btn btn-ghost" onClick={onClose}>Later</button>}
        </div>

        <div className={styles.rows}>
          {ids.map((id, i) => {
            const h = byId[id];
            const cur = chosen[id];
            const f = fits[id];
            return (
              <div key={id} className={styles.row} style={{ '--d': i * 50 + 'ms' }}>
                <HeroImg hero={h} className={styles.img} />
                <div className={styles.info}>
                  <span className={styles.name}>{h.name}</span>
                  <span className={styles.why}>{cur && cur !== 'flex' ? fitReason(h, cur) : cur === 'flex' ? 'Flex: placed at its best open position in the review' : 'Pick a position'}</span>
                </div>
                <div className={styles.choices} role="radiogroup" aria-label={'Position for ' + h.name}>
                  {POSITIONS.map((p) => (
                    <button
                      key={p} type="button" role="radio" aria-checked={cur === p}
                      className={styles.choice + (cur === p ? ' ' + styles.on : '') + (f[p] >= 85 ? ' ' + styles.good : '')}
                      title={'Pos ' + p + ' · ' + POS_SHORT[p] + ' · fit ' + f[p]}
                      onClick={() => choose(id, p)}
                    >
                      <b>{p}</b><span>{POS_SHORT[p]}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={cur === 'flex'} className={styles.choice + ' ' + styles.flex + (cur === 'flex' ? ' ' + styles.on : '')} onClick={() => choose(id, 'flex')}>
                    <b>Flex</b><span>decide later</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.foot}>
          <span className={styles.legend}><span className={styles.dot} /> good fit for this hero</span>
          <div className={styles.footBtns}>
            <button type="button" className="btn btn-ghost" onClick={reset}>Use suggested</button>
            <button type="button" className="btn btn-accent" disabled={missing > 0 || busy} onClick={() => onConfirm(chosen)}>
              {busy ? 'Saving…' : missing ? missing + ' hero' + (missing > 1 ? 'es' : '') + ' without a position' : 'Confirm & open review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
