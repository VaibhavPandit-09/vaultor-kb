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
import { traceCommand } from './captureTrace';

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
    'Alpha.16 rich evidence anchor',
    'selection',
    'anchor',
    'Source evidence settles; supported full CLICK.',
  ],
  [
    'Alpha.16 rich local capture',
    'complete',
    'capture',
    'Durable saved geometry settles; separated rising CLICK pair.',
  ],
  [
    'REVIEW_CAPTURED',
    'complete',
    'REVIEW_CAPTURED',
    'Only after durable local save and visible receipt settle; short light-to-firm pair. Same clear native composition as alpha.16, now explicitly reserved.',
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
  const [traceReport, setTraceReport] = useState('');
  const [traceNotice, setTraceNotice] = useState('');
  const traceAction = async (action: 'arm' | 'read' | 'copy' | 'clear') => {
    try {
      const report = await traceCommand(action);
      if (!alive.current) return;
      setTraceReport(JSON.stringify(report, null, 2));
      setTraceNotice(
        action === 'arm'
          ? 'Armed for the next new Review capture. Close settings and capture normally. Manual playback is disabled until copy or clear.'
          : action === 'copy'
          ? 'Sanitized trace copied and frozen. Paste it with your tactile observations before arming the next trial.'
          : action === 'clear'
          ? 'Trace cleared from memory.'
          : 'Trace refreshed; no playback requested.',
      );
    } catch {
      if (alive.current)
        setTraceNotice('Trace action failed. No playback requested.');
    }
  };
  const query = useCallback(
    async (index: number, selected: string) => {
      const tag = findNodeHandle(root.current);
      if (!available || !tag) return;
      const row = vocabulary[index];
      const locallyOff =
        selected !== 'inspect' && preferences.haptics === 'off';
      try {
        const report = JSON.parse(
          await NativeModules.VaultorPresentation.hapticDiagnostics(
            row[1],
            row[2],
            locallyOff ? 'inspect' : selected,
            tag,
          ),
        );
        if (locallyOff)
          Object.assign(report, {
            status: 'suppressed',
            mechanism: 'silent',
            reason: 'App Off selected; no playback request sent',
            androidAccepted: false,
          });
        if (alive.current) {
          setReports(v => ({ ...v, [index]: { ...v[index], ...report } }));
          setFailure('');
        }
      } catch {
        if (alive.current)
          setFailure('Diagnostic inspection failed. No feedback guarantee.');
      }
    },
    [available, preferences.haptics],
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
            Real Review capture trace · memory only · no resource or source
            data. Arm once for each new trial. These controls never play
            haptics.
          </Text>
          <Action
            label="Arm next Review capture trace"
            onPress={() => void traceAction('arm')}
          />
          <Action
            label="Read capture trace"
            onPress={() => void traceAction('read')}
          />
          <Action
            label="Copy sanitized capture trace"
            onPress={() => void traceAction('copy')}
          />
          <Action
            label="Clear capture trace"
            onPress={() => void traceAction('clear')}
          />
          {traceNotice ? (
            <Text accessibilityLiveRegion="polite" style={text}>
              {traceNotice}
            </Text>
          ) : null}
          {traceReport ? (
            <Text selectable style={text}>
              {traceReport}
            </Text>
          ) : null}
          <Text style={text}>
            Manual tuning only; most product interactions are silent. Android
            acceptance is not proof of sensation. No setting is bypassed.
            Reduced motion: {reduced ? 'on' : 'off'}.
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
                  · App selection:{' '}
                  {preferences.haptics === 'off' ? 'disabled' : 'enabled'};
                  persisted: {report?.appEnabled ? 'enabled' : 'disabled'} ·
                  Focus: {report?.windowFocused ? 'yes' : 'no'}
                </Text>
                <Text style={text}>
                  Auto mechanism:{' '}
                  {report?.plannedRoute ?? report?.route ?? 'inspecting'} ·
                  platform constant {report?.platformConstant ?? 'see result'}.
                  CLICK primitive {String(report?.clickPrimitive)}; tick{' '}
                  {String(report?.tickPrimitive)}; deliberate THUD{' '}
                  {String(report?.thudPrimitive)}; envelope supported/usable{' '}
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
