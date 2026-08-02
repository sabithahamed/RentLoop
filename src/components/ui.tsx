/**
 * The small shared vocabulary every screen is built from.
 *
 * Kept deliberately dumb: restyling during design iteration should mean
 * editing this file and src/theme.ts, not eight screens.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { color, radius, shadow, space, type } from '../theme';

// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[styles.card, padded && { padding: space.lg }, style]}>{children}</View>
  );
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.label, styles.sectionLabel, style]}>{children}</Text>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/** A label/value row — the workhorse of the detail screens. */
export function KeyValue({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: React.ReactNode;
  valueStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.kv}>
      <Text style={[type.bodyMuted, styles.kvLabel]}>{label}</Text>
      {typeof value === 'string' ? (
        <Text style={[type.body, styles.kvValue, valueStyle]}>{value}</Text>
      ) : (
        <View style={styles.kvValue}>{value}</View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.textInverse : color.accent} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && { color: color.textInverse },
            variant === 'secondary' && { color: color.accent },
            variant === 'ghost' && { color: color.textMuted },
            variant === 'danger' && { color: color.danger },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  required = false,
  style,
  ...inputProps
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
} & TextInputProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={{ color: color.danger }}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={color.textFaint}
        style={[styles.input, !!error && styles.inputError, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Horizontal segmented picker — used for payment method. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.segmented}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Centered>
      <ActivityIndicator color={color.accent} />
      <Text style={[type.caption, { marginTop: space.md }]}>{label}</Text>
    </Centered>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Centered>
      <Text style={[type.heading, { color: color.danger }]}>Something went wrong</Text>
      <Text style={[type.caption, { marginTop: space.sm, textAlign: 'center' }]}>{message}</Text>
    </Centered>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    ...shadow.card,
  },
  sectionLabel: {
    marginBottom: space.sm,
    marginTop: space.xl,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.border,
  },
  kv: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    gap: space.lg,
  },
  kvLabel: {
    flexShrink: 0,
  },
  kvValue: {
    flex: 1,
    textAlign: 'right',
  },

  button: {
    height: 50,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  buttonPrimary: { backgroundColor: color.accent },
  buttonSecondary: {
    backgroundColor: color.accentSoft,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: color.dangerSoft },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },

  field: { marginBottom: space.lg },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: color.text,
    marginBottom: space.sm,
  },
  input: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
    paddingHorizontal: space.md,
    fontSize: 15,
    color: color.text,
  },
  inputMultiline: {
    height: 88,
    paddingTop: space.md,
    textAlignVertical: 'top',
  },
  inputError: { borderColor: color.danger },
  fieldHint: { ...type.caption, marginTop: space.xs, fontSize: 12 },
  fieldError: { ...type.caption, marginTop: space.xs, fontSize: 12, color: color.danger },

  segmented: {
    flexDirection: 'row',
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm - 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: color.surface,
    ...shadow.card,
  },
  segmentLabel: { fontSize: 13, fontWeight: '500', color: color.textMuted },
  segmentLabelSelected: { color: color.text, fontWeight: '600' },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xxl,
  },
});
