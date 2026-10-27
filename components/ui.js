'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header({ right }) {
  const path = usePathname();
  const nav = [
    ['/', 'Home'], ['/draft', 'Simulator'], ['/play', 'Multiplayer'], ['/quiz', 'Quiz'], ['/teams', 'Teams'], ['/history', 'History'],
  ];
  return (
    <header className="hdr">
      <Link href="/" className="brand">
        <span className="brand-mark">DB</span>
        <span className="brand-word">draft lab</span>
      </Link>
      <nav className="nav" aria-label="Main">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className={path === href || (href !== '/' && path.startsWith(href)) ? 'on' : ''}>{label}</Link>
        ))}
      </nav>
      <div className="hdr-right">{right}</div>
    </header>
  );
}

export function TierChip({ tier, size = 30 }) {
  if (!tier) return null;
  return <span className={'tier tier-' + tier} style={{ minWidth: size, height: size }}>{tier}</span>;
}

const TICKS = Array(45).fill('1.2 4.8').join(' ') + ' 0 90';

export function Gauge({ score = 0, tier = '–', sub, size = 190, onOrange = false }) {
  const arc = Math.round(270 * Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="88" fill="none" stroke={onOrange ? 'rgba(11,11,11,.35)' : '#3a3a3a'} strokeWidth="8" pathLength="360" strokeDasharray={TICKS} transform="rotate(135 100 100)" />
        <circle cx="100" cy="100" r="72" fill="none" stroke={onOrange ? 'rgba(11,11,11,.18)' : '#242424'} strokeWidth="6" pathLength="360" strokeDasharray="270 360" strokeLinecap="round" transform="rotate(135 100 100)" />
        <circle className={onOrange ? '' : 'glow'} cx="100" cy="100" r="72" fill="none" stroke={onOrange ? '#0b0b0b' : 'var(--accent)'} strokeWidth="6" pathLength="360" strokeDasharray={arc + ' 360'} strokeLinecap="round" transform="rotate(135 100 100)" />
      </svg>
      <div className="gauge-c">
        <span className="gauge-t">{tier}</span>
        {sub && <span className="gauge-s">{sub}</span>}
      </div>
    </div>
  );
}

export function HeroImg({ hero, className = '', alt }) {
  if (!hero) return <span className={'heroimg empty ' + className} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={'heroimg ' + className} src={hero.img} alt={alt ?? hero.name} loading="lazy" draggable="false" />
  );
}

export function Seg({ value, options, onChange, label, small }) {
  return (
    <div className={'seg' + (small ? ' seg-sm' : '')} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
