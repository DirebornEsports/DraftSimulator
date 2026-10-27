'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/ui';
import DraftBoard from '@/components/DraftBoard';
import { STEPS, stepTime } from '@/lib/draft';
import { overallGrade } from '@/lib/grade';
import { splitActions, gradeTeam } from '@/lib/replay';
import { useHeroes, useMatchups } from '@/lib/useHeroes';
import { addHistory, newId } from '@/lib/store';
import styles from '../play.module.css';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function readSeat(code) {
  try { return JSON.parse(localStorage.getItem('dl.room.' + code)) || null; } catch { return null; }
}

export default function RoomPage() {
  const code = String(useParams().code || '').toUpperCase();
  const { heroes, byId, loading, error } = useHeroes();
  const { ensure } = useMatchups();
  const [seat, setSeat] = useState(undefined);   // { token, team } | null
  const [room, setRoom] = useState(null);
  const [err, setErr] = useState(null);
  const [name, setName] = useState('');
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [log, setLog] = useState([]);
  const [savedId, setSavedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const offset = useRef(0);
  const lastV = useRef(0);

  useEffect(() => { setSeat(readSeat(code)); try { setName(localStorage.getItem('dl.name') || ''); } catch {} }, [code]);

  const call = useCallback(async (body) => {
    const r = await fetch('/api/rooms/' + code, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(seat && seat.token ? { 'x-room-token': seat.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Request failed');
    return d;
  }, [code, seat]);

  const accept = useCallback((d) => {
    if (d.v < lastV.current) return;
    lastV.current = d.v;
    offset.current = d.serverNow - Date.now();
    setRoom(d);
  }, []);

  // Poll the room every second.
  useEffect(() => {
    if (seat === undefined) return;
    let alive = true;
    const tick = async () => {
      try { const d = await call(); if (alive) { accept(d); setErr(null); } }
      catch (e) { if (alive) setErr(e.message); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(id); };
  }, [seat, call, accept]);

  // Local clock for smooth timers.
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);

  const myTeam = room ? room.you : null;
  const actionsKey = room ? room.actions.join(',') : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const actions = useMemo(() => (room ? room.actions : []), [actionsKey]);
  const { picks, bans } = useMemo(() => splitActions(actions), [actions]);
  const step = actions.length;
  const done = room && room.status === 'done';

  // Grade my actions whenever the draft moves.
  useEffect(() => {
    if (!myTeam || !Object.keys(byId).length) return;
    let alive = true;
    (async () => {
      const m = await ensure(actions.filter((id, i) => id && STEPS[i].type === 'pick'));
      if (alive) setLog(gradeTeam({ actions, team: myTeam, byId, matchups: m }));
    })();
    return () => { alive = false; };
  }, [actions, myTeam, byId, ensure]);

  // Save once the draft is finished.
  useEffect(() => {
    if (!done || savedId || !myTeam || log.length < 12) return;
    const g = overallGrade(log);
    const id = newId();
    const other = myTeam === 1 ? 2 : 1;
    addHistory({
      id, kind: 'draft', at: Date.now(), tier: g.tier, score: g.score,
      title: 'Multiplayer · ' + cap(room.seats[myTeam].side) + ' ' + (myTeam === 1 ? '1st' : '2nd') + ' pick',
      meta: 'vs ' + (room.seats[other].name || 'opponent') + ' · room ' + code,
      settings: { mode: room.mode, side: room.seats[myTeam].side }, userTeam: myTeam, picks, bans, log,
    });
    setSavedId(id);
  }, [done, savedId, myTeam, log, room, code, picks, bans]);

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      try { localStorage.setItem('dl.name', name.trim()); } catch {}
      const r = await fetch('/api/rooms/' + code, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'join', name }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const s = { token: d.token, team: d.team };
      localStorage.setItem('dl.room.' + code, JSON.stringify(s));
      setSeat(s);
      accept(d.room);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  const send = async (body) => {
    setBusy(true);
    try { accept(await call(body)); setErr(null); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const lock = (heroId) => { if (heroId) { setSel(null); send({ type: 'action', heroId }); } };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.origin + '/play/' + code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  // Timers from server state.
  let timer = null;
  if (room && room.status === 'live' && step < STEPS.length) {
    const sNow = now + offset.current;
    const team = STEPS[step].team;
    const elapsed = sNow - room.turnStart;
    const limit = stepTime(step) * 1000;
    const usedReserve = Math.max(0, elapsed - limit);
    timer = {
      countdown: elapsed < 0 ? -elapsed / 1000 : 0,
      left: Math.max(0, Math.min(limit, limit - elapsed)) / 1000,
      reserve: { 1: room.reserve[1] / 1000, 2: room.reserve[2] / 1000, [team]: Math.max(0, room.reserve[team] - usedReserve) / 1000 },
    };
  }

  const shell = (children, right) => (
    <div className="page">
      <Header right={right} />
      <main className="wrap" style={{ paddingTop: 20 }}>{children}</main>
    </div>
  );

  if (error) return shell(<div className="center-note">Couldn&rsquo;t load hero data: {error}</div>);
  if (loading || seat === undefined) return shell(<div className="center-note">Loading…</div>);
  if (!room) return shell(<div className="center-note">{err ? err + ' · ' : ''}Connecting to room {code}…{err && <><br /><Link href="/play">Back to multiplayer</Link></>}</div>);

  const seatsOpen = !room.seats[1].joined || !room.seats[2].joined;
  const needJoin = !myTeam && seatsOpen && room.status === 'lobby';
  const codeBar = (
    <div className={styles.codeWrap}>
      <span className="label">Room</span><span className="code-box">{code}</span>
      <button type="button" className="btn btn-ghost" onClick={copyLink}>{copied ? 'Link copied' : 'Copy invite link'}</button>
    </div>
  );
  const banner = room.persistent === false && (
    <div className={styles.banner}>Multiplayer storage isn&rsquo;t connected yet, so rooms may reset. Add &ldquo;Upstash for Redis&rdquo; to the Vercel project to fix this.</div>
  );

  // Lobby
  if (room.status === 'lobby') {
    return shell(
      <>
        {banner}
        <div className={styles.roomTop}>{codeBar}<span className="muted">{room.mode === 'live' ? 'Live grades' : 'Blind — review after the draft'} · Default Captain&rsquo;s Mode timer</span></div>
        <div className={styles.seats}>
          {[1, 2].map((t) => {
            const s = room.seats[t];
            const mine = myTeam === t;
            return (
              <div key={t} className={'anim-up ' + styles.seat + (mine ? ' ' + styles.seatMine : '')} style={{ '--d': (t * 90) + 'ms' }}>
                <span className={styles.seatMeta}>{cap(s.side)} · {t === 1 ? 'First pick' : 'Second pick'}{mine ? ' · You' : ''}</span>
                <span key={s.joined ? 'j' : 'w'} className={'anim-fade ' + styles.seatName + (s.joined ? '' : ' ' + styles.waiting)}>{s.joined ? s.name : 'Waiting for captain…'}</span>
                {s.joined && <span key={String(s.ready)} className={'anim-pop ' + styles.readyTag + (s.ready ? ' ' + styles.readyOn : '')}>{s.ready ? 'Ready' : 'Not ready'}</span>}
                {mine && (
                  <button type="button" className={'btn ' + (s.ready ? 'btn-ghost' : 'btn-light')} style={{ alignSelf: 'flex-start', color: s.ready ? 'var(--accent-ink)' : undefined, borderColor: 'var(--accent-ink)' }} disabled={busy} onClick={() => send({ type: 'ready', ready: !s.ready })}>
                    {s.ready ? 'Cancel ready' : 'I’m ready'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {needJoin && (
          <form className="panel" onSubmit={join} style={{ marginTop: 20, padding: 24, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: 1, minWidth: 220 }}>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain name" maxLength={24} /></label>
            <button type="submit" className="btn btn-accent" disabled={busy}>Take the open seat</button>
          </form>
        )}
        {!myTeam && !needJoin && <p className="muted" style={{ marginTop: 20 }}>Both seats are taken. You&rsquo;re watching as a spectator.</p>}
        {err && <p role="alert" style={{ color: 'var(--accent-soft)' }}>{err}</p>}
      </>,
      <span>{myTeam ? 'Waiting for both captains to ready up' : 'Spectating'}</span>
    );
  }

  // Draft (live or done)
  const sides = { 1: room.seats[1].side, 2: room.seats[2].side };
  const names = { 1: room.seats[1].name, 2: room.seats[2].name };
  const canAct = !!myTeam && room.status === 'live' && step < STEPS.length && STEPS[step].team === myTeam && !(timer && timer.countdown > 0);
  return shell(
    <>
      {banner}
      <div className={styles.roomTop}>{codeBar}{err && <span role="alert" style={{ color: 'var(--accent-soft)', fontSize: 13 }}>{err}</span>}</div>
      <DraftBoard
        heroes={heroes} byId={byId} picks={picks} bans={bans} step={step}
        myTeam={myTeam} sides={sides} names={names}
        badges={{
          1: <span className={myTeam === 1 ? 'pill-accent' : 'pill-ghost'}>{myTeam === 1 ? 'YOU · ' : ''}{cap(sides[1])} · 1ST</span>,
          2: <span className={myTeam === 2 ? 'pill-accent' : 'pill-ghost'}>{myTeam === 2 ? 'YOU · ' : ''}{cap(sides[2])} · 2ND</span>,
        }}
        sel={sel} onSelect={setSel} onLock={lock} canAct={canAct} busy={busy}
        timer={timer} live={room.mode === 'live'} log={log}
        doneAction={
          <div style={{ display: 'flex', gap: 10 }}>
            {myTeam && <button type="button" className="btn btn-ghost" onClick={() => { setSavedId(null); setLog([]); send({ type: 'rematch' }); }}>Rematch</button>}
            {savedId && <Link href={'/review?id=' + savedId} className="btn btn-accent">Open full review</Link>}
          </div>
        }
      />
    </>,
    <span>{myTeam ? 'Captain · ' + names[myTeam] : 'Spectating'}</span>
  );
}
