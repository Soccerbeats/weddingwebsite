import { type ReactNode } from 'react';

/**
 * Sets hero height to the real viewport height via CSS only.
 * 100svh is the "small viewport" unit — it equals the visible area
 * after the browser chrome (address bar) is accounted for on mobile,
 * which is exactly what we want. No JS, no layout jank.
 */
export default function HeroWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="relative" style={{ height: '100svh' }}>
      {children}
    </div>
  );
}
