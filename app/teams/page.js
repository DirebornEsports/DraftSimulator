'use client';

import { useEffect, useState } from 'react';
import { Header, HeroImg } from '@/components/ui';
import { useHeroes } from '@/lib/useHeroes';
import { getTeams, saveTeams, newId } from '@/lib/store';
import styles from './teams.module.css';

const blankPlayers = () => [1, 2, 3, 4, 5].map((i) => ({ ign: '', pos: String(i), heroes: [] }));
const DIREBORN = { name: 'Direborn', tag: 'DB', region: 'SEA', players: ['Dreamocel', 'woMy', 'PotaT2', 'db-', 'dalul'].map((ign) => ({ ign, pos: '', heroes: [] })) };

export default function TeamsPage() {
  const { heroes, byId, loading } = useHeroes();
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: '', tag: '', region: 'SEA', players: blankPlayers() });
  const [picker, setPicker] = useState(null); // { teamId, idx }
  const [q, setQ] = useState('');

  useEffect(() => { setTeams(getTeams()); }, []);
  const commit = (t) => { setTeams(t); saveTeams(t); };

  const addTeam = (data) => {
    if (!data.name.trim()) return;
    commit([...teams, { id: newId(), ...data, name: data.name.trim(), players: data.players.filter((p) => p.ign.trim()).map((p) => ({ ...p, ign: p.ign.trim() })) }]);
    setForm({ name: '', tag: '', region: 'SEA', players: blankPlayers() });
  };
  const updatePlayer = (teamId, idx, patch) => commit(teams.map((t) => t.id !== teamId ? t : { ...t, players: t.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));
  const toggleHero = (teamId, idx, heroId) => {
    const p = teams.find((t) => t.id === teamId).players[idx];
    const has = p.heroes.includes(heroId);
    updatePlayer(teamId, idx, { heroes: has ? p.heroes.filter((h) => h !== heroId) : [...p.heroes, heroId].slice(0, 8) });
  };
  const removeTeam = (id) => { if (window.confirm('Delete this team?')) commit(teams.filter((t) => t.id !== id)); };

  const pickerPlayer = picker && teams.find((t) => t.id === picker.teamId)?.players[picker.idx];

  return (
    <div className="page">
      <Header right={<span>Teams power the &ldquo;Team style&rdquo; AI opponent</span>} />
      <main className={'wrap ' + styles.grid}>
        <section className={styles.list}>
          <div className={styles.titleRow}>
            <h1 className={styles.h1}>Team database</h1>
            <span className="muted" style={{ fontSize: 13 }}>{teams.length} team{teams.length === 1 ? '' : 's'} · saved in this browser</span>
          </div>
          {teams.length === 0 && (
            <div className={'panel ' + styles.empty}>
              <span>No teams yet. Add one with the form, or start from the Direborn roster.</span>
              <button type="button" className="btn btn-light" onClick={() => addTeam(DIREBORN)}>Add Direborn roster</button>
            </div>
          )}
          <div className={styles.cards}>
            {teams.map((t, ti) => (
              <article key={t.id} className={styles.card}>
                <div className={'notch-sm ' + styles.top + (ti === 0 ? ' ' + styles.topOrange : '')}>
                  <span className={styles.region}>{t.region}</span>
                  <span className={'display ' + styles.teamName}>{t.name}</span>
                  <span className={styles.tag}>{t.tag}</span>
                </div>
                <div className={styles.body}>
                  {t.players.map((p, i) => (
                    <div key={i} className={styles.player}>
                      <span className={styles.ign}>{p.ign}</span>
                      <label className={styles.pos}><span className="sr-only">Position for {p.ign}</span>
                        <select value={p.pos} onChange={(e) => updatePlayer(t.id, i, { pos: e.target.value })}>
                          <option value="">Pos —</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>Pos {n}</option>)}
                        </select>
                      </label>
                      <div className={styles.heroes}>
                        {p.heroes.map((hid) => byId[hid] && (
                          <button key={hid} type="button" className={styles.heroChip} title={'Remove ' + byId[hid].name} onClick={() => toggleHero(t.id, i, hid)}>
                            <HeroImg hero={byId[hid]} />
                          </button>
                        ))}
                        <button type="button" className={styles.addHero} onClick={() => { setPicker({ teamId: t.id, idx: i }); setQ(''); }}>+ hero</button>
                      </div>
                    </div>
                  ))}
                  <div className={styles.cardFoot}>
                    <button type="button" className="btn btn-ghost" onClick={() => removeTeam(t.id)}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className={'panel ' + styles.form}>
          <h2 className={styles.h2}>Add a team</h2>
          <div className={styles.formTwo}>
            <label className="field">Team name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Team name" /></label>
            <label className="field">Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="TAG" /></label>
          </div>
          <label className="field">Region
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              {['SEA', 'China', 'Europe', 'CIS', 'North America', 'South America', 'MENA'].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <span className="label" style={{ marginTop: 4 }}>Players</span>
          {form.players.map((p, i) => (
            <div key={i} className={styles.formRow}>
              <label className="field">Player {i + 1}<input value={p.ign} placeholder="In-game name" onChange={(e) => setForm({ ...form, players: form.players.map((x, j) => (j === i ? { ...x, ign: e.target.value } : x)) })} /></label>
              <label className="field">Pos
                <select value={p.pos} onChange={(e) => setForm({ ...form, players: form.players.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)) })}>
                  <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                </select>
              </label>
            </div>
          ))}
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Add each player&rsquo;s preferred heroes on the team card after saving.</span>
          <button type="button" className="btn btn-accent" disabled={!form.name.trim()} onClick={() => addTeam(form)}>Save team</button>
        </aside>
      </main>

      {picker && pickerPlayer && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={'Preferred heroes for ' + pickerPlayer.ign} onClick={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div className={styles.dialog}>
            <div className={styles.dialogHead}>
              <span className={styles.h2}>Preferred heroes · {pickerPlayer.ign}</span>
              <button type="button" className="btn btn-accent" onClick={() => setPicker(null)}>Done</button>
            </div>
            <label className="field"><span className="sr-only">Search heroes</span><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search heroes" /></label>
            {loading ? <span className="muted">Loading heroes…</span> : (
              <div className={styles.pickGrid}>
                {heroes.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase())).map((h) => {
                  const on = pickerPlayer.heroes.includes(h.id);
                  return (
                    <button key={h.id} type="button" aria-pressed={on} title={h.name} className={styles.pickTile + (on ? ' ' + styles.pickOn : '')} onClick={() => toggleHero(picker.teamId, picker.idx, h.id)}>
                      <HeroImg hero={h} alt="" /><span>{h.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
