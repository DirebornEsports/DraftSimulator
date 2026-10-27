'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header, Seg, TierChip } from '@/components/ui';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/lib/draft';
import { getHistory, getTeams } from '@/lib/store';
import styles from './home.module.css';

const LEVEL_DESC = {
  easy: 'Picks strong meta heroes and ignores your draft.',
  hard: 'Counter-drafts you using matchup data and fills its own roles.',
  team: 'Role-plays a saved team: copies its real pick and ban habits from imported matches, plus its players’ hero pools.',
};

export default function Home() {
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setS(loadSettings());
    getTeams().then(setTeams).catch(() => {});
    getHistory().then(setHistory).catch(() => {});
  }, []);
  const set = (patch) => { const n = { ...s, ...patch }; setS(n); saveSettings(n); };

  return (
    <div className="page">
      <Header right={<span>Live data from OpenDota</span>} />
      <main className={'wrap ' + styles.grid}>
        <section className={styles.left}>
          <div className={'notch anim-up ' + styles.hero}>
            <div className={styles.heroTop}><span>Pro-level draft training</span><span>Captain&rsquo;s Mode · default timer</span></div>
            <p className={styles.heroCopy}>Draft against an AI that counter-picks you. Every pick and ban graded S to F — live, or all at once after the draft.</p>
            <div className={'display anim-word ' + styles.wordmark}>draft<br />lab</div>
          </div>
          <div className={'anim-up ' + styles.modes} style={{ '--d': '120ms' }}>
            <Link href="/draft" className={styles.mode}>
              <span className="label">Mode 01</span>
              <span className={styles.modeTitle}>Draft Simulator</span>
              <span className="muted">Full 24-step Captain&rsquo;s Mode vs an AI opponent.</span>
            </Link>
            <Link href="/ranked" className={styles.mode}>
              <span className="label">Quick</span>
              <span className={styles.modeTitle}>Ranked helper</span>
              <span className="muted">Enter your real ranked game and get pick suggestions for your role.</span>
            </Link>
            <Link href="/play" className={styles.mode}>
              <span className="label">Mode 02</span>
              <span className={styles.modeTitle}>Multiplayer</span>
              <span className="muted">Captain vs captain in a shared room. Spectators welcome.</span>
            </Link>
            <Link href="/quiz" className={styles.mode}>
              <span className="label">Mode 03</span>
              <span className={styles.modeTitle}>Draft Quiz</span>
              <span className="muted">Replay real pro drafts and guess the next pick.</span>
            </Link>
          </div>
        </section>

        <section className={styles.right}>
          <div className={'panel anim-up ' + styles.setup} style={{ '--d': '80ms' }}>
            <div className={styles.row}><h1 className={styles.h1}>Session setup</h1><span className="muted" style={{ fontSize: 12 }}>applies to Simulator &amp; Quiz</span></div>

            <div className={styles.block}>
              <span className="label">Feedback mode</span>
              <div className={styles.modeCards}>
                {[['live', 'Live feedback', 'Tier + pros/cons after every pick and ban.'], ['blind', 'Blind', 'No hints. Full graded review after the draft.']].map(([v, l, d]) => (
                  <button key={v} type="button" aria-pressed={s.mode === v} className={s.mode === v ? styles.cardOn : styles.card} onClick={() => set({ mode: v })}>
                    <span className={styles.cardTitle}>{l}</span><span className={styles.cardDesc}>{d}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.two}>
              <div className={styles.block}><span className="label">Side</span>
                <Seg label="Side" value={s.side} onChange={(v) => set({ side: v })} options={[['radiant', 'Radiant'], ['dire', 'Dire']]} /></div>
              <div className={styles.block}><span className="label">Pick order</span>
                <Seg label="Pick order" value={s.order} onChange={(v) => set({ order: v })} options={[['first', 'First pick'], ['second', 'Second pick']]} /></div>
            </div>

            <div className={styles.block}>
              <span className="label">AI opponent</span>
              <Seg label="AI opponent" value={s.level} onChange={(v) => set({ level: v })} options={[['easy', 'Easy'], ['hard', 'Hard'], ['team', 'Team style']]} />
              <span className="muted" style={{ fontSize: 13 }}>{LEVEL_DESC[s.level]}</span>
              {s.level === 'team' && (
                teams.length ? (
                  <label className="field">Team to imitate
                    <select value={s.teamId || ''} onChange={(e) => set({ teamId: e.target.value || null })}>
                      <option value="">Choose a team</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.matches?.length ? ' · ' + t.matches.filter((m) => m.side).length + ' matches' : ' · no matches yet'}</option>)}
                    </select>
                  </label>
                ) : <span style={{ fontSize: 13 }}>No teams saved yet. <Link href="/teams">Add one</Link>.</span>
              )}
            </div>

            <div className={styles.footer}>
              <div className={styles.block} style={{ gap: 4 }}><span className="label">Timer</span><span style={{ fontSize: 14 }}>Default Captain&rsquo;s Mode (per step + reserve)</span></div>
              <Link href="/draft" className="btn btn-accent">Start draft</Link>
            </div>
          </div>

          <div className={'panel anim-up ' + styles.recent} style={{ '--d': '180ms' }}>
            <div className={styles.row}><span className="label">Recent drafts</span><Link href="/history" style={{ fontSize: 13, textDecoration: 'none' }}>See all</Link></div>
            {history.length === 0 && <span className="muted" style={{ fontSize: 14 }}>Your graded drafts and quizzes will show up here.</span>}
            {history.slice(0, 4).map((h) => (
              <Link key={h.id} href={h.kind === 'quiz' ? '/history' : '/review?id=' + h.id} className={styles.recentRow}>
                <TierChip tier={h.tier} size={38} />
                <span className={styles.recentText}><span>{h.title}</span><span className="muted" style={{ fontSize: 12 }}>{h.meta}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(h.at).toLocaleDateString()}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
