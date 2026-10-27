'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, HeroImg } from '@/components/ui';
import { useHeroes } from '@/lib/useHeroes';
import { getTeams, saveTeam, deleteTeam, importMatches, setMatchSide, removeMatch } from '@/lib/store';
import { buildProfile, top } from '@/lib/profile';
import { loadSettings, saveSettings } from '@/lib/draft';
import styles from './teams.module.css';

const blankPlayers = () => [1, 2, 3, 4, 5].map((i) => ({ ign: '', pos: String(i), heroes: [] }));
const blankForm = () => ({ name: '', tag: '', region: 'SEA', odTeamId: '', players: blankPlayers() });
const DIREBORN = { name: 'Direborn', tag: 'DB', region: 'SEA', players: ['Dreamocel', 'woMy', 'PotaT2', 'db-', 'dalul'].map((ign) => ({ ign, pos: '', heroes: [] })) };

export default function TeamsPage() {
  const router = useRouter();
  const { heroes, byId, loading } = useHeroes();
  const [teams, setTeams] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [picker, setPicker] = useState(null);     // { teamId, idx }
  const [importFor, setImportFor] = useState(null); // team id
  const [open, setOpen] = useState({});           // team id -> show matches
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => getTeams().then(setTeams).catch((e) => { setErr(e.message); setTeams([]); });
  useEffect(() => { reload(); }, []);

  const replaceTeam = (t) => setTeams((all) => all.map((x) => (x.id === t.id ? t : x)));
  const persist = async (t) => { replaceTeam(t); try { replaceTeam(await saveTeam(t)); } catch (e) { setErr(e.message); } };

  const addTeam = async (data) => {
    if (!data.name.trim()) return;
    setBusy(true); setErr(null);
    try {
      const t = await saveTeam({ ...data, odTeamId: data.odTeamId || null, players: data.players.filter((p) => p.ign.trim()) });
      setTeams((all) => [...all, t]);
      setForm(blankForm());
      if (t.odTeamId) setImportFor(t.id);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const updatePlayer = (team, idx, patch) => persist({ ...team, players: team.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)) });
  const toggleHero = (team, idx, heroId) => {
    const p = team.players[idx];
    const has = p.heroes.includes(heroId);
    updatePlayer(team, idx, { heroes: has ? p.heroes.filter((h) => h !== heroId) : [...p.heroes, heroId].slice(0, 10) });
  };
  const removeTeam = async (id) => {
    if (!window.confirm('Delete this team and its imported matches?')) return;
    try { await deleteTeam(id); setTeams((all) => all.filter((t) => t.id !== id)); } catch (e) { setErr(e.message); }
  };
  const draftVs = (team) => {
    saveSettings({ ...loadSettings(), level: 'team', teamId: team.id });
    router.push('/draft');
  };

  const pickerTeam = picker && teams?.find((t) => t.id === picker.teamId);
  const pickerPlayer = pickerTeam?.players[picker.idx];
  const importTeam = importFor && teams?.find((t) => t.id === importFor);

  return (
    <div className="page">
      <Header right={<span>Shared with everyone on this site</span>} />
      <main className={'wrap ' + styles.grid}>
        <section className={styles.list}>
          <div className={styles.titleRow}>
            <h1 className={styles.h1}>Teams</h1>
            <span className="muted" style={{ fontSize: 13 }}>Import a team&rsquo;s pro matches and the AI will draft like them</span>
          </div>
          {err && <div role="alert" className={styles.err}>{err}</div>}
          {teams === null && <div className="panel center-note">Loading teams…</div>}
          {teams && teams.length === 0 && (
            <div className={'panel ' + styles.empty}>
              <span>No teams yet. Add one with the form, or start from the Direborn roster.</span>
              <button type="button" className="btn btn-light" onClick={() => addTeam({ ...DIREBORN, odTeamId: null })}>Add Direborn roster</button>
            </div>
          )}
          <div className={styles.cards}>
            {(teams || []).map((t, ti) => (
              <TeamCard
                key={t.id} team={t} index={ti} byId={byId}
                open={!!open[t.id]} onToggle={() => setOpen({ ...open, [t.id]: !open[t.id] })}
                onPos={(i, pos) => updatePlayer(t, i, { pos })}
                onAddHero={(i) => { setPicker({ teamId: t.id, idx: i }); setQ(''); }}
                onRemoveHero={(i, hid) => toggleHero(t, i, hid)}
                onImport={() => setImportFor(t.id)}
                onSide={async (mid, side) => { try { replaceTeam(await setMatchSide(t.id, mid, side)); } catch (e) { setErr(e.message); } }}
                onRemoveMatch={async (mid) => { try { replaceTeam(await removeMatch(t.id, mid)); } catch (e) { setErr(e.message); } }}
                onDraft={() => draftVs(t)}
                onDelete={() => removeTeam(t.id)}
              />
            ))}
          </div>
        </section>

        <aside className={'panel anim-up ' + styles.form} style={{ '--d': '120ms' }}>
          <h2 className={styles.h2}>Add a team</h2>
          <div className={styles.formTwo}>
            <label className="field">Team name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Team name" /></label>
            <label className="field">Tag<input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="TAG" /></label>
          </div>
          <div className={styles.formTwo}>
            <label className="field">Region
              <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
                {['SEA', 'China', 'Europe', 'CIS', 'North America', 'South America', 'MENA'].map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="field">OpenDota team ID<input value={form.odTeamId} inputMode="numeric" onChange={(e) => setForm({ ...form, odTeamId: e.target.value.replace(/\D/g, '') })} placeholder="optional" /></label>
          </div>
          <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>The team ID is the number in the team&rsquo;s OpenDota or Dotabuff link. With it, recent pro matches import automatically.</span>
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
          <button type="button" className="btn btn-accent" disabled={!form.name.trim() || busy} onClick={() => addTeam(form)}>{busy ? 'Saving…' : 'Save team'}</button>
        </aside>
      </main>

      {pickerPlayer && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={'Preferred heroes for ' + pickerPlayer.ign} onClick={(e) => e.target === e.currentTarget && setPicker(null)}>
          <div className={'anim-pop ' + styles.dialog}>
            <div className={styles.dialogHead}>
              <span className={styles.h2}>Hero pool · {pickerPlayer.ign}</span>
              <button type="button" className="btn btn-accent" onClick={() => setPicker(null)}>Done</button>
            </div>
            <label className="field"><span className="sr-only">Search heroes</span><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search heroes" /></label>
            {loading ? <span className="muted">Loading heroes…</span> : (
              <div className={styles.pickGrid}>
                {heroes.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase())).map((h) => {
                  const on = pickerPlayer.heroes.includes(h.id);
                  return (
                    <button key={h.id} type="button" aria-pressed={on} title={h.name} className={styles.pickTile + (on ? ' ' + styles.pickOn : '')} onClick={() => toggleHero(pickerTeam, picker.idx, h.id)}>
                      <HeroImg hero={h} alt="" /><span>{h.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {importTeam && (
        <ImportDialog team={importTeam} onClose={() => setImportFor(null)} onTeam={(t) => { replaceTeam(t); setOpen((o) => ({ ...o, [t.id]: true })); }} />
      )}
    </div>
  );
}

function TeamCard({ team, index, byId, open, onToggle, onPos, onAddHero, onRemoveHero, onImport, onSide, onRemoveMatch, onDraft, onDelete }) {
  const profile = useMemo(() => buildProfile(team), [team]);
  const unknownSide = team.matches.filter((m) => !m.side).length;
  const heroRow = (list, label) => (
    <div className={styles.scoutRow}>
      <span className="label">{label}</span>
      <div className={styles.scoutHeroes}>
        {list.length === 0 && <span className="muted" style={{ fontSize: 12 }}>—</span>}
        {list.map((x) => byId[x.id] && (
          <span key={x.id} className={styles.scoutHero} title={byId[x.id].name + ' · ' + x.c + 'x'}>
            <HeroImg hero={byId[x.id]} /><b>{x.c}</b>
          </span>
        ))}
      </div>
    </div>
  );
  const firstPhase = {};
  ['F', 'S'].forEach((o) => ['pick1', 'pick2'].forEach((k) => Object.entries(profile.slot[o][k] || {}).forEach(([id, c]) => { firstPhase[id] = (firstPhase[id] || 0) + c; })));

  return (
    <article className={'anim-up ' + styles.card} style={{ '--d': (index * 80) + 'ms' }}>
      <div className={'notch-sm ' + styles.top + (index === 0 ? ' ' + styles.topOrange : '')}>
        <span className={styles.region}>{team.region}{team.odTeamId ? ' · OpenDota #' + team.odTeamId : ''}</span>
        <span className={'display ' + styles.teamName}>{team.name}</span>
        <span className={styles.tag}>{team.tag}</span>
      </div>
      <div className={styles.body}>
        {team.players.map((p, i) => (
          <div key={i} className={styles.player}>
            <span className={styles.ign}>{p.ign}</span>
            <label className={styles.pos}><span className="sr-only">Position for {p.ign}</span>
              <select value={p.pos} onChange={(e) => onPos(i, e.target.value)}>
                <option value="">Pos —</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>Pos {n}</option>)}
              </select>
            </label>
            <div className={styles.heroes}>
              {p.heroes.map((hid) => byId[hid] && (
                <button key={hid} type="button" className={'anim-pop ' + styles.heroChip} title={'Remove ' + byId[hid].name} onClick={() => onRemoveHero(i, hid)}>
                  <HeroImg hero={byId[hid]} />
                </button>
              ))}
              <button type="button" className={styles.addHero} onClick={() => onAddHero(i)}>+ hero</button>
            </div>
          </div>
        ))}

        <div className={styles.training}>
          <div className={styles.trainHead}>
            <div>
              <span className="label">AI training data</span>
              <div className={styles.trainStat}>
                {profile.n ? <><b>{profile.n}</b> matches · {profile.wins}W–{profile.n - profile.wins}L · first pick in {profile.firstPickGames}</> : 'No matches yet'}
              </div>
              {unknownSide > 0 && <span className={styles.warn}>{unknownSide} match{unknownSide > 1 ? 'es need' : ' needs'} a side picked before it counts</span>}
            </div>
            <button type="button" className="btn btn-light" onClick={onImport}>Add matches</button>
          </div>
          {profile.n > 0 && (
            <div className={styles.scout}>
              {heroRow(top(profile.picks, 8), 'Most picked')}
              {heroRow(top(profile.bans, 8), 'Most banned')}
              {heroRow(top(firstPhase, 6), 'First-phase picks')}
              {heroRow(top(profile.bannedAgainst, 6), 'Banned against them')}
            </div>
          )}
          {team.matches.length > 0 && (
            <button type="button" className={styles.linkBtn} onClick={onToggle}>{open ? 'Hide matches' : 'Show ' + team.matches.length + ' matches'}</button>
          )}
          {open && (
            <div className={styles.matchList}>
              {team.matches.map((m) => {
                const mine = m.side === 'radiant' ? m.radiant : m.side === 'dire' ? m.dire : null;
                const opp = m.side === 'radiant' ? m.dire : m.side === 'dire' ? m.radiant : null;
                const won = m.side ? m.radiantWin === (m.side === 'radiant') : null;
                return (
                  <div key={m.id} className={styles.matchRow + (m.side ? '' : ' ' + styles.matchWarn)}>
                    <div className={styles.matchText}>
                      <span>{opp ? 'vs ' + opp.name : m.radiant.name + ' vs ' + m.dire.name}</span>
                      <span className="muted" style={{ fontSize: 11 }}>#{m.id}{m.league ? ' · ' + m.league : ''}{m.start ? ' · ' + new Date(m.start * 1000).toLocaleDateString() : ''}</span>
                    </div>
                    <label><span className="sr-only">Which side was {team.name}</span>
                      <select value={m.side || ''} onChange={(e) => onSide(m.id, e.target.value || null)} className={styles.sideSelect}>
                        <option value="">Side?</option>
                        <option value="radiant">{team.name} = Radiant ({m.radiant.name})</option>
                        <option value="dire">{team.name} = Dire ({m.dire.name})</option>
                      </select>
                    </label>
                    <span className={won == null ? 'muted' : won ? styles.win : styles.loss}>{won == null ? '—' : won ? 'W' : 'L'}</span>
                    <button type="button" className={styles.x} aria-label={'Remove match ' + m.id} onClick={() => onRemoveMatch(m.id)}>×</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.cardFoot}>
          <button type="button" className="btn btn-ghost" onClick={onDelete}>Delete</button>
          <button type="button" className="btn btn-accent" onClick={onDraft}>Draft vs {team.name}</button>
        </div>
      </div>
    </article>
  );
}

function ImportDialog({ team, onClose, onTeam }) {
  const [ids, setIds] = useState('');
  const [odId, setOdId] = useState(team.odTeamId ? String(team.odTeamId) : '');
  const [limit, setLimit] = useState('20');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);

  const run = async (byTeam) => {
    setBusy(true); setErr(null); setRes(null);
    try {
      const body = byTeam
        ? { odTeamId: Number(odId), limit: Number(limit) }
        : { matchIds: ids.split(/[^0-9]+/).filter(Boolean) };
      const r = await importMatches(team.id, body);
      if (r.team) onTeam(r.team);
      setRes(r);
      if (!byTeam) setIds('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={'Add matches for ' + team.name} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className={'anim-pop ' + styles.dialog} style={{ maxWidth: 640 }}>
        <div className={styles.dialogHead}>
          <span className={styles.h2}>Add matches · {team.name}</span>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Close</button>
        </div>
        <label className="field">Match IDs (one per line, or separated by commas)
          <textarea value={ids} onChange={(e) => setIds(e.target.value)} rows={4} placeholder={'8123456789\n8123456790'} className={styles.textarea} />
        </label>
        <button type="button" className="btn btn-accent" disabled={busy || !ids.trim()} onClick={() => run(false)}>{busy ? 'Importing from OpenDota…' : 'Import these matches'}</button>
        <div className={styles.or}><span>or import recent pro matches</span></div>
        <div className={styles.formTwo}>
          <label className="field">OpenDota team ID<input value={odId} inputMode="numeric" onChange={(e) => setOdId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 8255888" /></label>
          <label className="field">How many
            <select value={limit} onChange={(e) => setLimit(e.target.value)}>{['10', '20', '30', '50'].map((n) => <option key={n} value={n}>Last {n}</option>)}</select>
          </label>
        </div>
        <button type="button" className="btn btn-light" disabled={busy || !odId} onClick={() => run(true)}>Import recent matches</button>
        {err && <span role="alert" className={styles.err}>{err}</span>}
        {res && (
          <div className={styles.result}>
            <b>{res.added} match{res.added === 1 ? '' : 'es'} added.</b>
            {res.needSide?.length > 0 && <span className={styles.warn}>{res.needSide.length} need you to pick which side {team.name} played (see the match list on the card).</span>}
            {res.skipped?.length > 0 && <span className="muted" style={{ fontSize: 12 }}>Skipped: {res.skipped.slice(0, 8).map((s) => '#' + s.id + ' (' + s.reason + ')').join(', ')}{res.skipped.length > 8 ? '…' : ''}</span>}
          </div>
        )}
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Only matches with a full Captain&rsquo;s Mode draft count. Up to 50 per import, 120 per team. Big imports can take up to a minute.</span>
      </div>
    </div>
  );
}
