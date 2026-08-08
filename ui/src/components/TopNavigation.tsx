import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { View } from '../App';

type Item = { label: string; view?: View };
const items: Item[] = [
  { label: 'Home', view: 'home' }, { label: 'Job', view: 'job' }, { label: 'Private Match', view: 'private-match' },
  { label: 'Match Pass', view: 'match-pass' }, { label: 'Recruiter', view: 'recruiter' }, { label: 'Ledger', view: 'ledger' }, { label: 'V2', view: 'v2' },
];

export function TopNavigation({ activeView, onNavigate, onPlaceholder }: { activeView: View; onNavigate: (view: View) => void; onPlaceholder: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hidden, setHidden] = useState(false);

  useLayoutEffect(() => {
    const active = items.find((item) => item.view === activeView || activeView === 'proof-progress' && item.view === 'private-match');
    const node = active && refs.current[active.label];
    const parent = track.current;
    if (!node || !parent) return;
    setPill({ left: node.offsetLeft - parent.scrollLeft, width: node.offsetWidth });
    node.scrollIntoView({ block: 'nearest', inline: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activeView]);

  useEffect(() => {
    let previous = window.scrollY;
    const onScroll = () => {
      const current = window.scrollY;
      const delta = current - previous;
      if (current < 56) setHidden(false);
      else if (Math.abs(delta) >= 8) setHidden(delta > 0);
      previous = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return <nav className={`top-navigation${hidden ? ' top-navigation--hidden' : ''}`} aria-label="Product navigation" onFocusCapture={() => setHidden(false)}><div className="top-navigation__track" ref={track}><span className="top-navigation__pill" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }} aria-hidden="true" />{items.map((item) => { const active = item.view === activeView || activeView === 'proof-progress' && item.view === 'private-match'; return <button ref={(node) => { refs.current[item.label] = node; }} key={item.label} type="button" className={`top-navigation__item${active ? ' top-navigation__item--active' : ''}`} aria-current={active ? 'page' : undefined} aria-disabled={!item.view || undefined} onClick={() => item.view ? onNavigate(item.view) : onPlaceholder()}>{item.label}</button>; })}</div></nav>;
}
