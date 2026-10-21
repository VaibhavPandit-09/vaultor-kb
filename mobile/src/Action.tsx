import React, { useState } from 'react';
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import { useThemeStyles } from './ui';
export function Action({
  label,
  onPress,
  active = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useThemeStyles(sheetStyles);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        active && styles.active,
        focused && styles.focused,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View pointerEvents="none" collapsable={false}>
        <Text style={[styles.actionText, active && styles.accent]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const sheetStyles = StyleSheet.create({
  action: {
    minHeight: 48,
    minWidth: 48,
    padding: 10,
    borderRadius: 10,
    justifyContent: 'center',
  },
  actionText: { color: '#b3b3b3', fontSize: 14 },
  accent: { color: '#8db7ff' },
  active: { backgroundColor: '#141c2a' },
  focused: { borderWidth: 2, borderColor: '#8db7ff' },
  pressed: { backgroundColor: '#1e1e1e' },
  disabled: { opacity: 0.4 },
});
