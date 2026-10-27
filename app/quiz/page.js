'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header, HeroImg, Seg, TierChip } from '@/components/ui';
import { evaluate, rankOptions, tierOf } from '@/lib/grade';
import { useHeroes, useMatchups } from '@/lib/useHeroes';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '@/lib/draft';
import { addHistory, newId } from '@/lib/store';
import styles from './quiz.module.css';

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export default function QuizPage() {
  const { byId, loading: heroesLoading, error: heroError } = useHeroes();
  const { ensure, reset } = useMatchups();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [match, setMatch] = useState(null);
  const [err, setErr] = useState(null);
  const [seen, setSeen] = useState([]);
  const [qi, setQi] = useState(0);            // question index (0..9)
  const [question, setQuestion] = useState(null);
  const [answers, setAnswers] = useState([]); // { step, guess, correct, pts }
  const [chosen, setChosen] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setSettings(loadSettings()); }, []);
  const live = settings.mode === 'live';

  const pickSteps = useMemo(() => (match ? match.picksBans.map((x, i) => ({ ...x, i })).filter((x) => x.isPick) : []), [match]);
  const finished = match && qi >= pickSteps.length;

  const loadMatch = useCallback(async () => {
    setErr(null); setMatch(null); setQuestion(null); setAnswers([]); setQi(0); setChosen(null); setSaved(false); reset();
    try {
      const r = await fetch('/api/quiz?exclude=' + seen.join(','));
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setMatch(d);
      setSeen((s) => [...s, d.matchId].slice(-30));
    } catch (e) { setErr(e.message); }
  }, [seen, reset]);

  useEffect(() => { if (!heroesLoading && !heroError) loadMatch(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroesLoading, heroError]);

  // Build the current question.
  useEffect(() => {
    if (!match || finished || !Object.keys(byId).length) return;
    let alive = true;
    (async () => {
      const step = pickSteps[qi];
      const before = match.picksBans.slice(0, step.i);
      const mine = before.filter((x) => x.isPick && x.team === step.team).map((x) => x.heroId);
      const theirs = before.filter((x) => x.isPick && x.team !== step.team).map((x) => x.heroId);
      const used = new Set(before.map((x) => x.heroId));
      const m = await ensure([...mine, ...theirs]);
      const ranked = rankOptions({ type: 'pick', mine, theirs, byId, matchups: m, used, exclude: step.heroId });
      const strong = ranked.slice(0, 5);
      const mid = ranked.slice(8, 35);
      const distract = [shuffle(strong)[0], ...shuffle(mid).slice(0, 2)].filter(Boolean).map((o) => o.id);
      const options = shuffle([step.heroId, ...distract]).map((id) => {
        const ev = evaluate({ heroId: id, type: 'pick', mine, theirs, byId, matchups: m });
        return { id, ev };
      });
      if (alive) { setQuestion({ step, options, mine, theirs }); setChosen(null); }
    })();
    return () => { alive = false; };
  }, [match, qi, pickSteps, finished, byId, ensure]);

  const answer = (opt) => {
    if (chosen || !question || question.step.i !== pickSteps[qi]?.i) return;
    const correct = opt.id === question.step.heroId;
    const pts = correct ? 100 : (opt.ev.tier === 'S' || opt.ev.tier === 'A') ? 60 : 0;
    setChosen(opt.id);
    setAnswers((a) => [...a, { step: question.step.i, guess: opt.id, correct: question.step.heroId, pts, tier: opt.ev.tier, why: correct ? null : opt.ev }]);
    if (!live) setTimeout(() => setQi((i) => i + 1), 450);
  };

  const total = answers.reduce((a, x) => a + x.pts, 0);

  useEffect(() => {
    if (!finished || saved || !match) return;
    const score = Math.round(total / pickSteps.length);
    addHistory({ id: newId(), kind: 'quiz', at: Date.now(), tier: tierOf(score), score, title: 'Quiz · ' + match.radiant + ' vs ' + match.dire, meta: answers.filter((a) => a.pts === 100).length + ' exact, ' + answers.filter((a) => a.pts === 60).length + ' close of ' + pickSteps.length });
    setSaved(true);
  }, [finished, saved, match, total, pickSteps.length, answers]);

  const setMode = (v) => { const n = { ...settings, mode: v }; setSettings(n); saveSettings(n); };
  const right = (<><Seg small label="Quiz mode" value={settings.mode} onChange={setMode} options={[['live', 'Live reveal'], ['blind', 'Blind']]} />
    {match && !finished && <span>Question {Math.min(qi + 1, pickSteps.length)} of {pickSteps.length}</span>}</>);

  if (heroError) return <Page right={right}><div className="center-note">Couldn&rsquo;t load hero data: {heroError}</div></Page>;
  if (err) return <Page right={right}><div className="center-note">{err} <button type="button" className="btn btn-ghost" onClick={loadMatch}>Try again</button></div></Page>;
  if (!match || heroesLoading) return <Page right={right}><div className="center-note">Finding a recent pro draft…</div></Page>;

  const stepIdx = finished ? 24 : question ? question.step.i : pickSteps[qi].i;
  const shown = match.picksBans.slice(0, stepIdx);
  const teamName = (t) => (t === 0 ? match.radiant : match.dire);
  const current = answers[qi];
  const revealed = live && chosen && current;

  return (
    <Page right={right}>
      <div className={styles.grid}>
        <aside className={styles.side}>
          <div className={'panel ' + styles.card}>
            <span className="label">Pro match</span>
            <span className={styles.matchTitle}>{match.radiant} vs {match.dire}</span>
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{match.league}<br />{new Date(match.startTime * 1000).toLocaleDateString()} · Match {match.matchId}<br />{match.radiantWin ? match.radiant : match.dire} won</span>
          </div>
          <div className={styles.score}>
            <span className={styles.scoreHead}>Your score</span>
            <span className={'display ' + styles.scoreNum}>{live || finished ? total : '?'}</span>
            <span style={{ fontSize: 13 }}>of {answers.length * 100} possible so far</span>
            <div className={styles.dots}>
              {pickSteps.map((_, i) => {
                const a = answers[i];
                const cls = !a ? '' : !live && !finished ? styles.dotDone : a.pts === 100 ? styles.dotFull : a.pts === 60 ? styles.dotHalf : styles.dotZero;
                return <span key={i} className={styles.dot + ' ' + cls + (i === qi && !finished ? ' ' + styles.dotCur : '')} />;
              })}
            </div>
          </div>
          <div className={'panel ' + styles.card} style={{ fontSize: 13, lineHeight: 1.6, color: '#a8a8a8' }}>
            <span className="label">Scoring</span>
            <span><b style={{ color: '#ededed', fontWeight: 500 }}>100</b> — exact pro pick</span>
            <span><b style={{ color: '#ededed', fontWeight: 500 }}>60</b> — strong alternative (graded A or S)</span>
            <span><b style={{ color: '#ededed', fontWeight: 500 }}>0</b> — everything else</span>
          </div>
        </aside>

        <section className={styles.mainCol}>
          <div className={'panel ' + styles.sofar}>
            <span className="label">Draft so far · {stepIdx} of 24 actions</span>
            {[0, 1].map((t) => (
              <div key={t} className={styles.teamRow}>
                <span className={styles.teamName}>{teamName(t)}</span>
                <div className={styles.picks}>
                  {shown.filter((x) => x.isPick && x.team === t).map((x) => (
                    <span key={x.order} className={styles.pick}><HeroImg hero={byId[x.heroId]} /><span>{byId[x.heroId]?.name}</span></span>
                  ))}
                </div>
                <div className={styles.bansRow}>
                  {shown.filter((x) => !x.isPick && x.team === t).map((x) => (
                    <span key={x.order} className={styles.banned} title={byId[x.heroId]?.name + ' (banned)'}><HeroImg hero={byId[x.heroId]} alt={byId[x.heroId]?.name + ' banned'} /></span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {!finished && question && (
            <div className={'panel ' + styles.question}>
              <div className={styles.qHead}>
                <span className={styles.qTag}>Step {question.step.i + 1} · {teamName(question.step.team)} pick</span>
                <h1 className={styles.h1}>What did {teamName(question.step.team)} pick here?</h1>
              </div>
              <div className={styles.options}>
                {question.options.map((o) => {
                  const h = byId[o.id];
                  const isCorrect = o.id === question.step.heroId;
                  const cls = [styles.opt,
                    revealed && isCorrect ? styles.optRight : '',
                    revealed && chosen === o.id && !isCorrect ? styles.optWrong : '',
                    !revealed && chosen === o.id ? styles.optChosen : ''].join(' ');
                  return (
                    <button key={o.id} type="button" className={cls} disabled={!!chosen} aria-pressed={chosen === o.id} onClick={() => answer(o)}>
                      <HeroImg hero={h} alt="" />
                      <span className={styles.optName}>{h.name}</span>
                      {revealed && <span className={styles.optTier}><TierChip tier={o.ev.tier} size={24} /></span>}
                    </button>
                  );
                })}
              </div>
              {revealed && (
                <div className={styles.reveal}>
                  <div className={styles.pts}><span className="muted" style={{ fontSize: 12 }}>This answer</span><span className={'display ' + styles.ptsNum}>+{current.pts}</span></div>
                  <span className={styles.explain}>
                    {current.pts === 100
                      ? 'Correct. ' + byId[current.correct].name + ' was the pro pick.'
                      : (current.pts === 60 ? 'Close. ' : 'Not quite. ') + byId[current.correct].name + ' was the pro pick. Your ' + byId[current.guess].name + ' graded ' + current.tier + ': ' + (current.pts === 60 ? current.why.pros[0] : current.why.cons[0]) + '.'}
                  </span>
                  <button type="button" className="btn btn-accent" onClick={() => setQi(qi + 1)}>{qi + 1 >= pickSteps.length ? 'See results' : 'Next step'}</button>
                </div>
              )}
              {!live && chosen && <span className="muted" style={{ fontSize: 14 }}>Answer locked. Results show at the end.</span>}
            </div>
          )}

          {finished && (
            <div className={'panel ' + styles.question}>
              <h1 className={styles.h1}>Quiz complete · {total} / {pickSteps.length * 100}</h1>
              <div className={styles.results}>
                {answers.map((a, i) => (
                  <div key={i} className={styles.resRow}>
                    <span className="muted">Step {a.step + 1}</span>
                    <span className={styles.resHero}><HeroImg hero={byId[a.guess]} /><span>You: {byId[a.guess].name}</span></span>
                    <span className={styles.resHero}><HeroImg hero={byId[a.correct]} /><span>Pro: {byId[a.correct].name}</span></span>
                    <span className={'display ' + styles.resPts}>+{a.pts}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-accent" onClick={loadMatch} style={{ alignSelf: 'flex-start' }}>Next pro match</button>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

function Page({ children, right }) {
  return (<div className="page"><Header right={right} /><main className="wrap">{children}</main></div>);
}
