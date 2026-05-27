'use client';

import { useEffect, useCallback } from 'react';

/**
 * HeartBurst — on double-click/double-tap anywhere on the page,
 * burst a handful of floating hearts from that point.
 * Single-click is ignored so normal navigation isn't affected.
 */
export default function HeartBurst() {
  const spawnHearts = useCallback((x: number, y: number) => {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.textContent = '♥';
      const size = 14 + Math.random() * 14;
      const angle = -60 + Math.random() * 120; // spread upward
      const dist  = 60 + Math.random() * 80;
      const dx    = Math.sin((angle * Math.PI) / 180) * dist;
      const dy    = -Math.abs(Math.cos((angle * Math.PI) / 180)) * dist;
      const delay = i * 40;
      const hue   = Math.random() > 0.5 ? 'var(--accent)' : '#e879a0';

      heart.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        font-size: ${size}px;
        color: ${hue};
        pointer-events: none;
        z-index: 9999;
        transform: translate(-50%, -50%);
        animation: heart-float 800ms ease-out ${delay}ms forwards;
        --dx: ${dx}px;
        --dy: ${dy}px;
      `;

      document.body.appendChild(heart);
      setTimeout(() => heart.remove(), 900 + delay);
    }
  }, []);

  useEffect(() => {
    const onDblClick = (e: MouseEvent) => spawnHearts(e.clientX, e.clientY);
    const onDblTouch = (e: TouchEvent) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (t) spawnHearts(t.clientX, t.clientY);
    };

    window.addEventListener('dblclick', onDblClick);
    window.addEventListener('touchend', onDblTouch, { passive: true });
    return () => {
      window.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('touchend', onDblTouch);
    };
  }, [spawnHearts]);

  return null; // no DOM output — side-effects only
}
