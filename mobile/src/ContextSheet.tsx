import React, { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Action } from './Action';
import MotionSheet from './MotionSheet';
import { useAppearance, useThemeStyles } from './ui';

/** One window and one caller-owned scroll context. No delayed close ownership. */
export default function ContextSheet({
  title,
  close,
  children,
  onSettled,
}: {
  title: string;
  close(): void;
  children: React.ReactNode;
  onSettled?: (tag: number) => void;
}) {
  const s = useThemeStyles(styles),
    insets = useSafeAreaInsets();
  const root = useRef<React.ElementRef<typeof View>>(null),
    heading = useRef<React.ElementRef<typeof Text>>(null);
  const light = useAppearance() === 'light';
  const bars = useCallback(
    () =>
      NativeModules.VaultorPresentation?.systemBars(
        light,
        findNodeHandle(root.current) ?? 0,
      ),
    [light],
  );
  useEffect(() => {
    bars();
  }, [bars]);
  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={close}
      onShow={() => {
        bars();
        const tag = findNodeHandle(heading.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      }}
    >
      <KeyboardAvoidingView behavior="height" style={s.full}>
        <SafeAreaView edges={['top', 'left', 'right']} style={s.scrim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={'Dismiss ' + title}
            onPress={close}
          />
          <MotionSheet
            style={s.sheet}
            onSettled={() => {
              const tag = findNodeHandle(root.current);
              if (tag) onSettled?.(tag);
            }}
          >
            <View
              ref={root}
              collapsable={false}
              accessibilityViewIsModal
              style={[s.body, { paddingBottom: Math.max(12, insets.bottom) }]}
            >
              <View style={s.heading}>
                <Text
                  ref={heading}
                  accessible
                  accessibilityRole="header"
                  style={s.title}
                >
                  {title}
                </Text>
                <Action label="Done" onPress={close} />
              </View>
              {children}
            </View>
          </MotionSheet>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  full: { flex: 1 },
  scrim: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0a0a0a',
    borderColor: '#333',
    borderWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flexShrink: 1,
  },
  body: { paddingHorizontal: 16, flexShrink: 1, gap: 8 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { color: '#e8e8e8', fontSize: 20, fontWeight: '600', flexShrink: 1 },
});
