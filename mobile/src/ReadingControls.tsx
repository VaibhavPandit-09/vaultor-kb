import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Action } from './BrowseScreen';
import { useReading, useThemeStyles } from './ui';
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
export default function ReadingControls({ close }: { close: () => void }) {
  const s = useThemeStyles(styles),
    { preferences: p, update, error, retry } = useReading();
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
    <Modal transparent animationType="none" onRequestClose={close}>
      <View style={s.scrim}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.heading}>
            <Text accessibilityRole="header" style={s.title}>
              Reading appearance
            </Text>
            <Action label="Done" onPress={close} />
          </View>
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.muted}>This device · originals stay unchanged</Text>
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
                  onPress={() => update({ theme })}
                />
              ))}
            </View>
            <Text style={s.label}>Accent</Text>
            <View style={s.choices}>
              {(['blue', 'violet', 'mint', 'amber'] as const).map(accent => (
                <Action
                  key={accent}
                  label={accent[0].toUpperCase() + accent.slice(1)}
                  active={p.accent === accent}
                  onPress={() => update({ accent })}
                />
              ))}
            </View>
            {number('Text size', p.size, 14, 28, 1, size => update({ size }))}
            {number('Line spacing', p.spacing, 1.4, 2.2, 0.1, spacing =>
              update({ spacing }),
            )}
            {number('Reading width', p.measure, 320, 800, 40, measure =>
              update({ measure }),
            )}
            <Text style={s.muted}>
              Size also respects the system font scale. Width is a maximum;
              small windows fit automatically.
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
            <Text style={s.muted}>Reduced motion always takes priority.</Text>
            {error ? (
              <View>
                <Text accessibilityRole="alert" style={s.error}>
                  {error}
                </Text>
                <Action label="Retry saving preferences" onPress={retry} />
              </View>
            ) : null}
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
                })
              }
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
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
