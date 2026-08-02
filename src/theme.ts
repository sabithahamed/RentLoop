/**
 * RentLoop design tokens — calm utility.
 *
 * The ledger is meant to hold up as evidence, so the visual language is a
 * well-set bank statement rather than a consumer finance app: near-white
 * surfaces, one deep accent, desaturated status chips, and tabular figures so
 * columns of money line up.
 *
 * Restyling the prototype should mean editing this file and src/components/,
 * not the screens.
 */

import type { TextStyle } from 'react-native';
import type { LedgerStatus } from './data/types';

export const color = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  surfaceSunken: '#F1F3F6',

  border: '#E4E7EC',
  borderStrong: '#D3D8E0',

  text: '#151A21',
  textMuted: '#5D6672',
  textFaint: '#98A0AC',
  textInverse: '#FFFFFF',

  accent: '#25408F',
  accentPressed: '#1B3070',
  accentSoft: '#E9EDF7',

  danger: '#9B1C1C',
  dangerSoft: '#FBEAEA',
} as const;

/** Chip colours per derived ledger status. Quiet on purpose — a label, not an alarm. */
export const statusColor: Record<LedgerStatus, { fg: string; bg: string }> = {
  paid: { fg: '#1B5E3F', bg: '#E6F2EB' },
  overpaid: { fg: '#0F5A6E', bg: '#E2F0F4' },
  partial: { fg: '#8A5A00', bg: '#FCF1DC' },
  overdue: { fg: '#9B1C1C', bg: '#FBEAEA' },
  due: { fg: '#25408F', bg: '#E9EDF7' },
  upcoming: { fg: '#5D6672', bg: '#EFF1F4' },
};

export const statusLabel: Record<LedgerStatus, string> = {
  paid: 'Paid',
  overpaid: 'Overpaid',
  partial: 'Partial',
  overdue: 'Overdue',
  due: 'Due',
  upcoming: 'Upcoming',
};

/** 4pt scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Money always uses tabular figures so digits align down a column. */
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  display: { fontSize: 30, fontWeight: '700', color: color.text, ...tabular } as TextStyle,
  title: { fontSize: 21, fontWeight: '700', color: color.text } as TextStyle,
  heading: { fontSize: 16, fontWeight: '600', color: color.text } as TextStyle,
  body: { fontSize: 15, fontWeight: '400', color: color.text } as TextStyle,
  bodyMuted: { fontSize: 15, fontWeight: '400', color: color.textMuted } as TextStyle,
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: color.textFaint,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  } as TextStyle,
  caption: { fontSize: 13, fontWeight: '400', color: color.textMuted } as TextStyle,
  money: { fontSize: 16, fontWeight: '600', color: color.text, ...tabular } as TextStyle,
  moneyLarge: { fontSize: 26, fontWeight: '700', color: color.text, ...tabular } as TextStyle,
  moneySmall: { fontSize: 14, fontWeight: '500', color: color.textMuted, ...tabular } as TextStyle,
} as const;

export const shadow = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
