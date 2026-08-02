import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, space, statusColor, statusLabel } from '../theme';
import type { LedgerStatus } from '../data/types';

/**
 * The status of a rent period, as a quiet chip.
 *
 * Colour alone never carries the meaning — the word is always present — so the
 * ledger stays readable for colour-blind users and in a screenshot.
 */
export function StatusChip({ status, size = 'md' }: { status: LedgerStatus; size?: 'sm' | 'md' }) {
  const { fg, bg } = statusColor[status];

  return (
    <View style={[styles.chip, size === 'sm' && styles.chipSm, { backgroundColor: bg }]}>
      <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: fg }]}>
        {statusLabel[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  chipSm: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: 11,
  },
});
