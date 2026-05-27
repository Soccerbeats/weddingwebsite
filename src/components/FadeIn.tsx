'use client';

import React from 'react';
import { useInView } from '@/hooks/useInView';
import { type ReactNode, type CSSProperties } from 'react';

type AnimationType = 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale';

interface FadeInProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  animation?: AnimationType;
  delay?: number;        // ms
  duration?: number;     // ms
  threshold?: number;
  as?: keyof React.JSX.IntrinsicElements;
}

const transforms: Record<AnimationType, string> = {
  'fade':        'translateY(0)',
  'slide-up':    'translateY(0)',
  'slide-left':  'translateX(0)',
  'slide-right': 'translateX(0)',
  'scale':       'scale(1)',
};

const initialTransforms: Record<AnimationType, string> = {
  'fade':        'translateY(0)',
  'slide-up':    'translateY(28px)',
  'slide-left':  'translateX(28px)',
  'slide-right': 'translateX(-28px)',
  'scale':       'scale(0.96)',
};

export default function FadeIn({
  children,
  className,
  style,
  animation = 'slide-up',
  delay = 0,
  duration = 600,
  threshold = 0.12,
  as: Tag = 'div',
}: FadeInProps) {
  const { ref, inView } = useInView({ threshold, once: true });

  const animStyle: CSSProperties = {
    opacity: inView ? 1 : 0,
    transform: inView ? transforms[animation] : initialTransforms[animation],
    transition: `opacity ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms, transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${delay}ms`,
    willChange: 'opacity, transform',
    ...style,
  };

  return (
    // @ts-expect-error polymorphic ref
    <Tag ref={ref} className={className} style={animStyle}>
      {children}
    </Tag>
  );
}
