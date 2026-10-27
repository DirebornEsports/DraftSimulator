'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header, TierChip } from '@/components/ui';
import { getHistory } from '@/lib/store';

export default function HistoryPage() {
  const [items, setItems] = useState(null);
  useEffect(() => { setItems(getHistory()); }, []);

  return (
    <div className="page">
      <Header right={<span>Saved in this browser</span>} />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <h1 style={{ margin: '0 0 20px', fontSize: 40, fontWeight: 300 }}>History</h1>
        {items && items.length === 0 && <div className="panel center-note">No drafts or quizzes yet. <Link href="/draft">Start a draft</Link>.</div>}
        <div className="panel" style={{ padding: '6px 24px' }}>
          {(items || []).map((h) => {
            const row = (
              <>
                <TierChip tier={h.tier} size={38} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span>{h.title}</span><span className="muted" style={{ fontSize: 12 }}>{h.meta} · score {h.score}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(h.at).toLocaleString()}</span>
              </>
            );
            const style = { display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1d1d1d', color: 'var(--text)', textDecoration: 'none', fontSize: 15 };
            return h.kind === 'draft'
              ? <Link key={h.id} href={'/review?id=' + h.id} style={style}>{row}</Link>
              : <div key={h.id} style={style}>{row}</div>;
          })}
        </div>
      </main>
    </div>
  );
}
