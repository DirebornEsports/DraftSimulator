'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, Seg } from '@/components/ui';
import styles from './play.module.css';

export default function PlayLobby() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [side, setSide] = useState('radiant');
  const [order, setOrder] = useState('first');
  const [mode, setMode] = useState('live');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { try { setName(localStorage.getItem('dl.name') || ''); } catch {} }, []);
  const remember = () => { try { localStorage.setItem('dl.name', name.trim()); } catch {} };

  const create = async () => {
    setBusy(true); setErr(null); remember();
    try {
      const r = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, side, order, mode }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      localStorage.setItem('dl.room.' + d.room.code, JSON.stringify({ token: d.token, team: d.team }));
      router.push('/play/' + d.room.code);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  const join = (e) => {
    e.preventDefault();
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length !== 6) { setErr('Room codes have 6 characters.'); return; }
    remember();
    router.push('/play/' + c);
  };

  return (
    <div className="page">
      <Header right={<span>Captain vs captain, in real time</span>} />
      <main className={'wrap ' + styles.grid}>
        <section className={'notch anim-up ' + styles.hero}>
          <span className={styles.heroTop}>Multiplayer draft</span>
          <p className={styles.heroCopy}>Two captains, one Captain&rsquo;s Mode draft. Share the room code — teammates and coaches can watch as spectators. Each captain gets their own S–F grades.</p>
          <div className={'display anim-word ' + styles.word}>1v1<br />draft</div>
        </section>

        <section className={styles.col}>
          <div className={'panel anim-up ' + styles.card} style={{ '--d': '80ms' }}>
            <h1 className={styles.h1}>Create a room</h1>
            <label className="field">Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Captain name" maxLength={24} /></label>
            <div className={styles.two}>
              <div className={styles.block}><span className="label">Your side</span><Seg label="Side" value={side} onChange={setSide} options={[['radiant', 'Radiant'], ['dire', 'Dire']]} /></div>
              <div className={styles.block}><span className="label">Your pick order</span><Seg label="Pick order" value={order} onChange={setOrder} options={[['first', 'First pick'], ['second', 'Second pick']]} /></div>
            </div>
            <div className={styles.block}><span className="label">Feedback</span><Seg label="Feedback" value={mode} onChange={setMode} options={[['live', 'Live grades'], ['blind', 'Blind — review after']]} /></div>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create room'}</button>
          </div>

          <form className={'panel anim-up ' + styles.card} style={{ '--d': '160ms' }} onSubmit={join}>
            <h2 className={styles.h2}>Join with a code</h2>
            <div className={styles.joinRow}>
              <label className="field" style={{ flex: 1 }}><span className="sr-only">Room code</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} className={styles.codeInput} />
              </label>
              <button type="submit" className="btn btn-light">Join</button>
            </div>
          </form>
          {err && <span role="alert" style={{ color: 'var(--accent-soft)' }}>{err}</span>}
        </section>
      </main>
    </div>
  );
}
