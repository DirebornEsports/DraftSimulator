'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Header, Seg } from '@/components/ui';
import DraftBoard from '@/components/DraftBoard';
import { STEPS, stepTime, TIMER, loadSettings, saveSettings, userTeamNumber, DEFAULT_SETTINGS } from '@/lib/draft';
import { aiChoose, overallGrade } from '@/lib/grade';
import { buildProfile, tendency } from '@/lib/profile';
import { splitActions, gradeStep } from '@/lib/replay';
import { useHeroes, useMatchups } from '@/lib/useHeroes';
import { addHistory, getTeams, newId, updateEntry } from '@/lib/store';

const fresh = () => ({ actions: [], log: [], sel: null, left: stepTime(0), reserve: { 1: TIMER.reserve, 2: TIMER.reserve }, savedId: null });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export default function DraftPage() {
  const { heroes, byId, loading, error } = useHeroes();
  const { ensure, reset: resetMatchups } = useMatchups();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [st, setSt] = useState(fresh);
  const [timerOn, setTimerOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [positions, setPositions] = useState({});
  const posRef = useRef(positions); posRef.current = positions;
  const stRef = useRef(st); stRef.current = st;
  const busyRef = useRef(false);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const userTeam = userTeamNumber(settings.order);
  const aiTeam = userTeam === 1 ? 2 : 1;
  const sides = { [userTeam]: settings.side, [aiTeam]: settings.side === 'radiant' ? 'dire' : 'radiant' };
  const live = settings.mode === 'live';
  const step = st.actions.length;
  const done = step >= STEPS.length;
  const cur = done ? null : STEPS[step];
  const { picks, bans } = useMemo(() => splitActions(st.actions), [st.actions]);

  const [teams, setTeams] = useState([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  useEffect(() => { getTeams().then(setTeams).catch(() => {}).finally(() => setTeamsLoaded(true)); }, []);
  const team = useMemo(() => {
    if (settings.level !== 'team' || !settings.teamId) return null;
    return teams.find((x) => x.id === settings.teamId) || null;
  }, [settings]);
  const preferred = team ? team.players.flatMap((p) => p.heroes || []) : [];
  const profile = useMemo(() => (team ? buildProfile(team) : null), [team]);
  const profileRef = useRef(null); profileRef.current = { profile, preferred };
  const [saveErr, setSaveErr] = useState(null);

  const pushAction = (s, heroId, entry) => {
    const actions = [...s.actions, heroId];
    return { ...s, actions, log: entry ? [...s.log, entry] : s.log, sel: null, left: actions.length < STEPS.length ? stepTime(actions.length) : 0 };
  };

  const lockIn = useCallback(async (heroId, auto = false) => {
    const s = stRef.current;
    const i = s.actions.length;
    if (busyRef.current || i >= STEPS.length || STEPS[i].team !== userTeam) return;
    busyRef.current = true; setBusy(true);
    try {
      const sp = splitActions(s.actions);
      const m = await ensure([...sp.picks[1], ...sp.picks[2]].filter(Boolean));
      const actions = [...s.actions, heroId];
      const entry = { ...gradeStep({ actions, stepIdx: i, byId, matchups: m }), auto };
      setSt(pushAction(stRef.current, heroId, entry));
      if (heroId && STEPS[i].type === 'pick') ensure([heroId]);
    } finally { busyRef.current = false; setBusy(false); }
  }, [userTeam, byId, ensure]);

  // AI turn.
  useEffect(() => {
    if (loading || error || done || !cur || cur.team !== aiTeam) return;
    if (settings.level === 'team' && settings.teamId && !teamsLoaded) return;
    let cancelled = false;
    (async () => {
      const s = stRef.current;
      const sp = splitActions(s.actions);
      const m = await ensure([...sp.picks[1], ...sp.picks[2]].filter(Boolean));
      await new Promise((r) => setTimeout(r, 650));
      if (cancelled || stRef.current.actions.length !== s.actions.length) return;
      const used = new Set(s.actions.filter(Boolean));
      const nth = (cur.type === 'pick' ? sp.picks[aiTeam] : sp.bans[aiTeam]).length + 1;
      const choice = aiChoose({
        level: settings.level, type: cur.type, aiPicks: sp.picks[aiTeam].filter(Boolean), userPicks: sp.picks[userTeam].filter(Boolean),
        byId, matchups: m, used, preferred: profileRef.current.preferred,
        profile: profileRef.current.profile, order: aiTeam === 1 ? 'F' : 'S', nth, tendencyFn: tendency,
      });
      setSt(pushAction(stRef.current, choice, null));
      if (cur.type === 'pick' && choice) ensure([choice]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading, error, aiTeam, teamsLoaded]);

  // Timer: per-step time, then reserve; a ban that runs out is lost, a pick is randomed.
  useEffect(() => {
    if (!timerOn || done || loading || error) return;
    const id = setInterval(() => {
      const s = stRef.current;
      const i = s.actions.length;
      if (i >= STEPS.length) return;
      const t = STEPS[i].team;
      if (s.left > 0) { setSt({ ...s, left: s.left - 1 }); return; }
      if (s.reserve[t] > 0) { setSt({ ...s, reserve: { ...s.reserve, [t]: s.reserve[t] - 1 } }); return; }
      if (t === userTeam && !busyRef.current) {
        if (STEPS[i].type === 'ban') lockIn(null, true);
        else {
          const used = new Set(s.actions.filter(Boolean));
          const pool = heroes.filter((h) => !used.has(h.id));
          lockIn(pool[Math.floor(Math.random() * pool.length)].id, true);
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timerOn, done, loading, error, userTeam, heroes, lockIn]);

  // Save to history when the draft ends.
  useEffect(() => {
    if (!done || st.savedId || !heroes.length) return;
    const g = overallGrade(st.log);
    const id = newId();
    const sp = splitActions(st.actions);
    addHistory({
      id, kind: 'draft', at: Date.now(), tier: g.tier, score: g.score, mode: 'simulator', opponentTeam: team ? team.name : null,
      title: 'Simulator · ' + (live ? 'Live' : 'Blind') + ' · ' + cap(settings.side) + ' ' + (userTeam === 1 ? '1st' : '2nd') + ' pick',
      meta: 'vs ' + (team ? team.name + ' (team style)' : cap(settings.level) + ' AI'),
      settings, userTeam, picks: sp.picks, bans: sp.bans, log: st.log, positions: posRef.current,
    }).then(() => setSt((s) => ({ ...s, savedId: id }))).catch((e) => setSaveErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const restart = () => { resetMatchups(); setSt(fresh()); setPositions({}); };
  const setPosition = (heroId, value) => {
    const next = { ...posRef.current, [heroId]: value };
    if (!value) delete next[heroId];
    setPositions(next);
    if (st.savedId) updateEntry(st.savedId, { positions: next }).catch(() => {});
  };
  const setMode = (v) => { const n = { ...settings, mode: v }; setSettings(n); saveSettings(n); };

  const right = (
    <>
      <Seg small label="Feedback mode" value={settings.mode} onChange={setMode} options={[['live', 'Live feedback'], ['blind', 'Blind']]} />
      <button type="button" className="btn btn-ghost" onClick={() => setTimerOn(!timerOn)}>{timerOn ? 'Pause timer' : 'Resume timer'}</button>
      <button type="button" className="btn btn-ghost" onClick={restart}>Restart</button>
    </>
  );

  return (
    <div className="page">
      <Header right={right} />
      <main className="wrap" style={{ paddingTop: 20 }}>
        {error ? <div className="center-note">Couldn&rsquo;t load hero data from OpenDota: {error}. Try again in a minute.</div>
          : loading ? <div className="center-note">Loading heroes and pro stats…</div>
          : (
            <DraftBoard
              heroes={heroes} byId={byId} picks={picks} bans={bans} step={step}
              myTeam={userTeam} sides={sides}
              names={{ [aiTeam]: team ? team.name : undefined }}
              badges={{
                [userTeam]: <span className="pill-accent">YOU · {userTeam === 1 ? '1ST' : '2ND'}</span>,
                [aiTeam]: <span className="pill-ghost">{team ? (profile && profile.n ? 'AI · ' + profile.n + ' MATCHES' : 'TEAM STYLE') : 'AI · ' + settings.level.toUpperCase()}</span>,
              }}
              sel={st.sel} onSelect={(id) => setSt({ ...stRef.current, sel: id })} onLock={(id) => lockIn(id)}
              canAct={!!cur && cur.team === userTeam} busy={busy}
              timer={{ left: st.left, reserve: st.reserve }}
              live={live} log={st.log}
              positions={positions} onPosition={setPosition}
              waitingText="The AI is thinking…"
              doneAction={st.savedId ? <Link href={'/review?id=' + st.savedId} className="btn btn-accent">Open full review</Link> : <span className="muted" style={{ fontSize: 13 }}>{saveErr ? 'Could not save: ' + saveErr : 'Saving…'}</span>}
            />
          )}
      </main>
    </div>
  );
}
