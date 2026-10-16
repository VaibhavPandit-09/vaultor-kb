import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  findNodeHandle,
  NativeModules,
  Text,
  View,
} from 'react-native';
import { Action } from './Action';
import { usePalette, useReading } from './ui';

const vocabulary = [
  [
    'H1 Micro confirmation',
    'micro',
    '',
    'Deliberate small toggle; light isolated tick.',
  ],
  [
    'H2 Selection / snap',
    'selection',
    '',
    'Mode or target settles; one crisp snap.',
  ],
  [
    'H3 Action completion',
    'complete',
    '',
    'Meaningful completed action; short firm confirmation.',
  ],
  [
    'H4 Warning / rejection',
    'reject',
    '',
    'Visible blocked or failed action; distinct rejection.',
  ],
  [
    'H5 Destructive confirmation',
    'destructive',
    '',
    'Rare confirmed destruction; deliberate hold signature. Diagnostic only.',
  ],
  [
    'Rich evidence anchor',
    'selection',
    'anchor',
    'Source evidence settles; supported full CLICK.',
  ],
  [
    'Rich local capture',
    'complete',
    'capture',
    'Durable saved geometry settles; separated rising CLICK pair.',
  ],
] as const;
const modes = [
  'auto',
  'system',
  'primitives',
  'predefined',
  'envelope',
  'legacy',
] as const;

/** Compile-gated native permission. Never an ordinary production setting. */
export default function DevelopmentFeedbackPanel() {
  const available =
    NativeModules.VaultorPresentation?.developmentDiagnostics === true;
  const root = useRef<React.ElementRef<typeof View>>(null);
  const alive = useRef(true);
  const palette = usePalette(),
    { preferences, reduced } = useReading();
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState<string>('auto');
  const [reports, setReports] = useState<Record<string, any>>({});
  const [failure, setFailure] = useState('');
  const query = useCallback(
    async (index: number, selected: string) => {
      const tag = findNodeHandle(root.current);
      if (!available || !tag) return;
      const row = vocabulary[index];
      try {
        const report = JSON.parse(
          await NativeModules.VaultorPresentation.hapticDiagnostics(
            row[1],
            row[2],
            selected,
            tag,
          ),
        );
        if (alive.current) {
          setReports(v => ({ ...v, [index]: { ...v[index], ...report } }));
          setFailure('');
        }
      } catch {
        if (alive.current)
          setFailure('Diagnostic inspection failed. No feedback guarantee.');
      }
    },
    [available],
  );
  const refresh = useCallback(() => {
    vocabulary.forEach((_, index) => {
      void query(index, 'inspect');
    });
  }, [query]);
  useEffect(() => {
    alive.current = true;
    if (open) refresh();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && open) refresh();
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, [open, refresh, preferences.haptics, preferences.richHaptics]);
  if (!available) return null;
  const text = { color: palette.secondary, marginVertical: 4 };
  return (
    <View ref={root} collapsable={false}>
      <Text style={{ color: palette.error }}>
        DEVELOPMENT ACCEPTANCE BUILD · A4 BLOCKED
      </Text>
      <Action
        label={
          open ? 'Close haptic diagnostics' : 'Developer haptic diagnostics'
        }
        onPress={() => setOpen(v => !v)}
      />
      {open ? (
        <>
          <Text style={text}>
            Manual isolated probes. Android acceptance is not proof of
            sensation. No setting is bypassed. Reduced motion:{' '}
            {reduced ? 'on' : 'off'}.
          </Text>
          <Text style={text}>
            Route override for comparison (custom routes apply to rich controls
            only). Legacy compares the shipped weak rich profile.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {modes.map(value => (
              <Action
                key={value}
                label={'Probe route: ' + value}
                active={mode === value}
                onPress={() => setMode(value)}
              />
            ))}
          </View>
          <Action label="Refresh device haptic status" onPress={refresh} />
          {vocabulary.map((row, index) => {
            const report = reports[index];
            return (
              <View
                key={row[0]}
                style={{
                  borderTopWidth: 1,
                  borderColor: palette.border,
                  paddingVertical: 8,
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={{ color: palette.text }}
                >
                  {row[0]}
                </Text>
                <Text style={text}>{row[3]}</Text>
                <Text style={text}>
                  System:{' '}
                  {report?.systemSetting === 1
                    ? 'enabled'
                    : report?.systemSetting === 0
                    ? 'disabled'
                    : 'unknown (system API decides)'}{' '}
                  · App: {report?.appEnabled ? 'enabled' : 'disabled'} · Focus:{' '}
                  {report?.windowFocused ? 'yes' : 'no'}
                </Text>
                <Text style={text}>
                  Auto mechanism:{' '}
                  {report?.plannedRoute ?? report?.route ?? 'inspecting'} ·
                  platform constant {report?.platformConstant ?? 'see result'}.
                  CLICK primitive {String(report?.clickPrimitive)}; tick{' '}
                  {String(report?.tickPrimitive)}; envelope supported/usable{' '}
                  {String(report?.envelopeSupported)}/
                  {String(report?.envelopeUsable)}; actuator{' '}
                  {String(report?.actuator)}. Presets tick/click/heavy/double:{' '}
                  {String(report?.tickEffect)}/{String(report?.clickEffect)}/
                  {String(report?.heavyEffect)}/{String(report?.doubleEffect)}.
                </Text>
                <Text style={text}>
                  Fallback: {report?.fallback ?? 'inspecting'}
                </Text>
                <Action
                  label={'Trigger ' + row[0]}
                  onPress={() => {
                    void query(index, row[2] ? mode : 'system');
                  }}
                />
                {report?.status ? (
                  <Text accessibilityLiveRegion="polite" style={text}>
                    Result: {report.status} · {report.mechanism} ·{' '}
                    {report.reason}. Android accepted:{' '}
                    {String(
                      report.androidAccepted ??
                        'custom request has no actuator acknowledgement',
                    )}
                    .
                  </Text>
                ) : null}
              </View>
            );
          })}
          {failure ? (
            <Text accessibilityRole="alert" style={{ color: palette.error }}>
              {failure}
            </Text>
          ) : null}
          <Text style={text}>
            Last product feedback:{' '}
            {JSON.stringify(reports[0]?.lastFeedback ?? {})}
          </Text>
        </>
      ) : null}
    </View>
  );
}
