import { useEffect, useState } from 'react';

export function AnimatedTextCycle({ phrases, interval = 3200 }: { phrases: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion || phrases.length < 2) return;
    const cycle = window.setInterval(() => {
      setLeaving(true);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % phrases.length);
        setLeaving(false);
      }, 340);
    }, interval);
    return () => window.clearInterval(cycle);
  }, [interval, phrases.length, reducedMotion]);

  return <span className="animated-text-cycle"><span className="sr-only">Know if the job fits before you disclose.</span><span className={`animated-text-cycle__visual${leaving ? ' animated-text-cycle__visual--leaving' : ''}`} aria-hidden="true" key={index}>{phrases[index] ?? ''}</span></span>;
}
