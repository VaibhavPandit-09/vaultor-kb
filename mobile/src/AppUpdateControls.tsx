import React, { useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  NativeEventEmitter,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ContextSheet from './ContextSheet';
import { Action } from './Action';
import { useThemeStyles } from './ui';
const native = NativeModules.VaultorNative;
type Candidate = { hostId: string; name: string; address: string };
type Scan = { scanning: boolean; items: Candidate[]; error: string };
type Update = {
  phase: string;
  detail: string;
  busy: boolean;
  currentVersion: string;
  currentCode: number;
  downloadedBytes?:number;totalBytes?:number;
  available?: { versionName: string; size: number };
  candidate?: { versionName: string; sha256: string };
};
export function NearbyHosts({
  permission,
  choose,
}: {
  permission(): Promise<void>;
  choose(address: string): void;
}) {
  const s = useThemeStyles(styles),
    [scan, setScan] = useState<Scan>({ scanning: false, items: [], error: '' });
  async function refresh() {
    try {
      setScan(JSON.parse(await native.nearby('list')));
    } catch {
      setScan(v => ({
        ...v,
        error: 'Discovery unavailable. Use a manual address.',
      }));
    }
  }
  useEffect(() => {
    const sub = new NativeEventEmitter(native).addListener(
      'VaultorDiscoveryChanged',
      () => void refresh(),
    );
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') void native.nearby('stop');
    });
    return () => {
      sub.remove();
      app.remove();
      void native.nearby('stop');
    };
  }, []);
  return (
    <View style={s.group}>
      <Action
        label={scan.scanning ? 'Stop nearby discovery' : 'Find nearby hosts'}
        onPress={() => {
          void (async () => {
            try {
              if (scan.scanning) await native.nearby('stop');
              else {
                await permission();
                await native.nearby('start');
              }
              await refresh();
            } catch {
              setScan(v => ({
                ...v,
                error:
                  'Local network permission or discovery unavailable; manual addresses remain available.',
              }));
            }
          })();
        }}
      />
      <Text style={s.secondary}>
        Nearby results are untrusted candidates. Matching-code pairing and
        pinned identity checks still apply.
      </Text>
      {scan.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {scan.error}
        </Text>
      ) : null}
      {scan.items.map(item => (
        <Action
          key={item.hostId + item.address}
          label={item.name + ' · ' + item.address}
          onPress={() => choose(item.address)}
        />
      ))}
    </View>
  );
}
export function HostAddress({
  current,
  change,
}: {
  current: string;
  change(address: string): Promise<void>;
}) {
  const s = useThemeStyles(styles),
    [open, setOpen] = useState(false),
    [address, setAddress] = useState(current),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <View>
      <Action
        label="Change verified host address"
        onPress={() => setOpen(v => !v)}
      />
      {open ? (
        <View style={s.group}>
          <TextInput
            accessibilityLabel="New address for the same host"
            style={s.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={address}
            onChangeText={setAddress}
          />
          <Text style={s.secondary}>
            The existing host ID and TLS identity must match. Changed trust
            requires separate pairing.
          </Text>
          <Action
            label="Verify and use address"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void change(address)
                .then(() => setOpen(false))
                .catch(() =>
                  setError(
                    'Address could not be verified against this host. Existing approval is retained.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          />
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
export default function AppUpdateControls({ close }: { close(): void }) {
  const s = useThemeStyles(styles),
    [state, setState] = useState<Update>(),
    [error, setError] = useState('');
  async function refresh() {
    try {
      setState(JSON.parse(await native.appUpdates('list')));
    } catch {
      setError(
        'Update storage unavailable. Existing app and queues are retained.',
      );
    }
  }
  async function action(name: string) {
    try {
      await native.appUpdates(name);
      await refresh();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const event = new NativeEventEmitter(native).addListener(
      'VaultorUpdatesChanged',
      () => void refresh(),
    );
    const app = AppState.addEventListener('change', s => {
      if (s === 'active') void refresh();
    });
    return () => {
      event.remove();
      app.remove();
    };
  }, []);
  return (
    <ContextSheet title="App updates" close={close}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.label}>
          Vaultor {state?.currentVersion || '…'} · code {state?.currentCode}
        </Text>
        <Text style={s.secondary}>
          Updates come from official Android prereleases. Workspace hosts never
          supply APKs. Original signer, package, cryptographic integrity and
          increasing versionCode are required.
        </Text>
        <Text accessibilityRole="text" style={s.label}>
          {state?.phase || 'Loading'}
        </Text>
        <Text style={s.secondary}>{state?.detail}</Text>
        {state?.phase==='downloading'&&state.downloadedBytes?<Text style={s.secondary}>{(state.downloadedBytes/1048576).toFixed(1)} MiB downloaded{state.totalBytes?' / '+(state.totalBytes/1048576).toFixed(1)+' MiB':''}</Text>:null}
        {state?.available ? (
          <Text style={s.secondary}>
            Available: {state.available.versionName} ·{' '}
            {(state.available.size / 1048576).toFixed(1)} MiB
          </Text>
        ) : null}
        {state?.candidate ? (
          <>
            <Text style={s.label}>Verified: {state.candidate.versionName}</Text>
            <Text selectable style={s.meta}>
              SHA-256 {state.candidate.sha256}
            </Text>
          </>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        <View style={s.actions}>
          <Action
            label="Check for updates"
            disabled={state?.busy}
            onPress={() => void action('check')}
          />
          {state?.available ? (
            <Action
              label="Download & verify"
              disabled={state.busy}
              onPress={() => void action('download')}
            />
          ) : null}
          {state?.candidate ? (
            <Action
              label="Install verified update"
              disabled={state.busy}
              onPress={() =>
                Alert.alert(
                  'Install verified Vaultor update?',
                  'Android will request any required installation permission and consent. Protected Reviews, imports, downloads and settings remain in app data.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Continue', onPress: () => void action('install') },
                  ],
                )
              }
            />
          ) : null}
          {state?.busy ? (
            <Action label="Pause update" onPress={() => void action('pause')} />
          ) : null}
        </View>
        <Text style={s.label}>Advanced</Text>
        <Action
          label="Verify a downloaded APK"
          disabled={state?.busy}
          onPress={() => void action('picker')}
        />
        <Action
          label="Open official releases"
          onPress={() =>
            Alert.alert(
              'Open official releases?',
              'Android will open the public Vaultor GitHub releases page.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open', onPress: () => void action('releases') },
              ],
            )
          }
        />
        <Text style={s.secondary}>
          No silent installation. Returning from a permission or installer
          screen does not prove success; the installed version shown here is
          authoritative. Reopen Vaultor for foreground queue catch-up if Android
          suspends it.
        </Text>
      </ScrollView>
    </ContextSheet>
  );
}
const styles = StyleSheet.create({
  body: { padding: 12, gap: 10 },
  group: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: '#e8e8e8', fontSize: 16, fontWeight: '600' },
  secondary: { color: '#b3b3b3', fontSize: 14, lineHeight: 20 },
  meta: { color: '#858585', fontSize: 12 },
  input: {
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#333',
    padding: 10,
    minHeight: 48,
    borderRadius: 8,
  },
  error: { color: '#ffb4b4' },
});
