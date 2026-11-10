/** Small reusable pieces: icons, score chip, pills. */
import React from 'react';
import { C, RATING_TONE, TONE } from '../theme';
import { Num } from './Chrome';

/** Check mark that draws on (p: 0→1). */
export const Check: React.FC<{ size: number; p?: number; color?: string; stroke?: number }> = ({ size, p = 1, color = C.ink, stroke = 2.6 }) => {
  const len = 22;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path
        d="M5 12.5l4.6 4.5L19 7.5"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />
    </svg>
  );
};

/** Neutral person glyph for the reviewer (no photo, no likeness). */
export const Person: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink2 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }}>
    <circle cx="24" cy="18" r="8" fill="none" stroke={color} strokeWidth={2} />
    <path d="M9 41c1.6-8 7.6-12.5 15-12.5S37.4 33 39 41" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

/** Score chip: number + rating word, colour never alone. */
export const ScoreChip: React.FC<{ score: number | string; rating: string; label: string; size?: number; dashed?: boolean }> = ({ score, rating, label, size = 26, dashed }) => {
  const tone = TONE[RATING_TONE[rating]];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 10,
        padding: `${size * 0.3}px ${size * 0.6}px`,
        borderRadius: 12,
        border: `1px ${dashed ? 'dashed' : 'solid'} ${tone}`,
        background: `${tone}1f`,
        whiteSpace: 'nowrap',
      }}
    >
      <Num size={size} weight={600}>
        {score}
      </Num>
      <span style={{ fontSize: size * 0.68, fontWeight: 600, color: C.ink2 }}>{label}</span>
    </span>
  );
};

/** Arrow that respects reading direction. */
export const DirArrow: React.FC<{ rtl: boolean; size?: number; color?: string }> = ({ rtl, size = 28, color = C.ink3 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', transform: rtl ? 'scaleX(-1)' : undefined }}>
    <path d="M4 12h15M14 6.5l5.5 5.5-5.5 5.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const Pill: React.FC<{ children: React.ReactNode; color?: string; fill?: boolean; size?: number; style?: React.CSSProperties }> = ({
  children,
  color = C.primary,
  fill = true,
  size = 20,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: `${size * 0.3}px ${size * 0.7}px`,
      borderRadius: 999,
      border: `1px solid ${color}99`,
      background: fill ? `${color}26` : 'transparent',
      color: C.ink,
      fontSize: size,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);
