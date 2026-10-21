import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  NativeModules,
  findNodeHandle,
  Keyboard,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Action } from './BrowseScreen';
import { useAppearance, useReading, useThemeStyles } from './ui';
import MotionSheet from './MotionSheet';
import FeedbackPreview from './FeedbackPreview';
import DevelopmentFeedbackPanel from './DevelopmentFeedbackPanel';
function ReadingNumber({
  label,
  value,
  min,
  max,
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  change: (value: number) => void;
}) {
  const s = useThemeStyles(styles),
    [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <TextInput
      accessibilityLabel={label}
      style={s.number}
      keyboardType="decimal-pad"
      value={draft}
      onChangeText={setDraft}
      selectTextOnFocus
      onEndEditing={() => {
        const n = Number(draft),
          next = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : value;
        setDraft(String(next));
        change(next);
      }}
    />
  );
}
export default function ReadingControls({
  close,
  compact = false,
  settings,
}: {
  close: () => void;
  compact?: boolean;
  settings?: () => void;
}) {
  const s = useThemeStyles(styles),
    { preferences: p, update, error, retry, chooseTheme } = useReading();
  const root = useRef<React.ElementRef<typeof View>>(null),
    insets = useSafeAreaInsets(),
    light = useAppearance() === 'light';
  const [shown, setShown] = useState(false),
    [advanced, setAdvanced] = useState(!compact);
  const ime = useRef(false),
    hiddenAt = useRef(-Infinity);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      ime.current = true;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      ime.current = false;
      hiddenAt.current = Date.now();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    NativeModules.VaultorPresentation?.systemBars(
      light,
      findNodeHandle(root.current) ?? 0,
    );
  }, [light]);
  useEffect(() => () => NativeModules.VaultorPresentation?.cancelTheme(), []);
  const number = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (n: number) => void,
  ) => (
    <View style={s.row} key={label}>
      <Text style={s.label}>{label}</Text>
      <View style={s.choices}>
        <Action
          label="−"
          accessibilityLabel={'Decrease ' + label}
          disabled={value <= min}
          onPress={() =>
            change(Math.max(min, Math.round((value - step) * 100) / 100))
          }
        />
        <ReadingNumber
          label={label}
          value={value}
          min={min}
          max={max}
          change={change}
        />
        <Action
          label="+"
          accessibilityLabel={'Increase ' + label}
          disabled={value >= max}
          onPress={() =>
            change(Math.min(max, Math.round((value + step) * 100) / 100))
          }
        />
      </View>
    </View>
  );
  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => {
        if (ime.current || Keyboard.isVisible()) {
          Keyboard.dismiss();
          return;
        }
        close();
      }}
      onShow={() => setShown(true)}
    >
      <KeyboardAvoidingView behavior="height" style={s.full}>
        <SafeAreaView edges={['top', 'left', 'right']} style={s.scrim}>
          <MotionSheet style={s.sheet} presented={shown}>
            <View
              ref={root}
              collapsable={false}
              style={s.sheetContent}
              accessibilityViewIsModal
            >
              <View style={s.heading}>
                <Text accessibilityRole="header" style={s.title}>
                  Reading appearance
                </Text>
                <Action label="Done" onPress={close} />
              </View>
              <ScrollView
                contentContainerStyle={[
                  s.body,
                  { paddingBottom: Math.max(20, insets.bottom + 12) },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.muted}>
                  This device · originals stay unchanged
                </Text>
                <Text style={s.label}>Theme</Text>
                <View style={s.choices}>
                  {(['os', 'light', 'dark', 'oled'] as const).map(theme => (
                    <Action
                      key={theme}
                      label={
                        theme === 'os'
                          ? 'OS'
                          : theme === 'oled'
                          ? 'OLED'
                          : theme[0].toUpperCase() + theme.slice(1)
                      }
                      active={p.theme === theme}
                      onPress={event => {
                        void chooseTheme(
                          theme,
                          Number(event.nativeEvent.target),
                        );
                      }}
                    />
                  ))}
                </View>
                {number('Text size', p.size, 14, 28, 1, size =>
                  update({ size }),
                )}
                {number('Line spacing', p.spacing, 1.4, 2.2, 0.1, spacing =>
                  update({ spacing }),
                )}
                {error ? (
                  <View>
                    <Text accessibilityRole="alert" style={s.error}>
                      {error}
                    </Text>
                    <Action label="Retry saving preferences" onPress={retry} />
                  </View>
                ) : null}
                {!advanced ? (
                  <Action
                    label="More reading settings"
                    onPress={() => setAdvanced(true)}
                  />
                ) : null}
                {settings ? (
                  <Action label="Settings" onPress={settings} />
                ) : null}
                {advanced ? (
                  <>
                    <Text style={s.label}>Accent</Text>
                    <View style={s.choices}>
                      {(['blue', 'violet', 'mint', 'amber'] as const).map(
                        accent => (
                          <Action
                            key={accent}
                            label={accent[0].toUpperCase() + accent.slice(1)}
                            active={p.accent === accent}
                            onPress={() => {
                              if (accent !== p.accent) update({ accent });
                            }}
                          />
                        ),
                      )}
                    </View>
                    {number('Reading width', p.measure, 320, 800, 40, measure =>
                      update({ measure }),
                    )}
                    <Text style={s.muted}>
                      Size also respects the system font scale. Width is a
                      maximum; small windows fit automatically.
                    </Text>
                    <Text style={s.label}>Transitions</Text>
                    <View style={s.choices}>
                      {(['snappy', 'smooth'] as const).map(motion => (
                        <Action
                          key={motion}
                          label={motion === 'smooth' ? 'Smooth' : 'Snappy'}
                          active={p.motion === motion}
                          onPress={() => update({ motion })}
                        />
                      ))}
                    </View>
                    <Text style={s.muted}>
                      Reduced motion always takes priority.
                    </Text>
                    <Text style={s.label}>Touch feedback</Text>
                    <View style={s.choices}>
                      <Action
                        label="System"
                        active={p.haptics === 'system'}
                        onPress={() => update({ haptics: 'system' })}
                      />
                      <Action
                        label="Off"
                        active={p.haptics === 'off'}
                        onPress={() => update({ haptics: 'off' })}
                      />
                    </View>
                    <Text style={s.muted}>
                      Follows Android touch-feedback settings. Ordinary reading
                      and background changes stay silent.
                    </Text>
                    <FeedbackPreview />
                    <Text style={s.label}>Capture tactile profile</Text>
                    <View style={s.choices}>
                      {(['clear', 'platform', 'expressive'] as const).map(
                        richHaptics => (
                          <Action
                            key={richHaptics}
                            label={
                              richHaptics === 'clear'
                                ? 'Clear clicks'
                                : richHaptics === 'platform'
                                ? 'Platform fallback'
                                : 'Expressive if supported'
                            }
                            active={p.richHaptics === richHaptics}
                            onPress={() => update({ richHaptics })}
                          />
                        ),
                      )}
                    </View>
                    <Text style={s.muted}>
                      Use Platform fallback if custom capture feedback is weak
                      on this device. System and app touch settings always
                      apply.
                    </Text>
                    <DevelopmentFeedbackPanel />
                    <Action
                      label="Reset reading appearance"
                      onPress={() =>
                        update({
                          theme: 'os',
                          accent: 'blue',
                          size: 18,
                          spacing: 1.75,
                          measure: 660,
                          motion: 'smooth',
                          haptics: 'system',
                        })
                      }
                    />
                  </>
                ) : null}
              </ScrollView>
            </View>
          </MotionSheet>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  full: { flex: 1 },
  sheetContent: { flexShrink: 1 },
  scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  heading: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  title: { flex: 1, color: '#e8e8e8', fontSize: 20, fontWeight: '600' },
  body: { padding: 20, gap: 14, paddingBottom: 32 },
  muted: { color: '#b3b3b3', lineHeight: 22 },
  label: { color: '#e8e8e8', fontSize: 16 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
    gap: 8,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  number: {
    minWidth: 76,
    minHeight: 48,
    textAlign: 'center',
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
  },
  error: { color: '#ffb4b4' },
});
