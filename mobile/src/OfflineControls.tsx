import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Modal,
  NativeModules,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Action } from './BrowseScreen';
import { useThemeStyles, useReading } from './ui';
import type { MobileWorkspace } from './workspace';
import { SafeAreaView } from 'react-native-safe-area-context';
const native = NativeModules.VaultorNative;
const request = async (action: string, value: object = {}) =>
  JSON.parse(await native.companion(action, JSON.stringify(value)));
type Job = {
  id: string;
  scope: string;
  active?: string;
  name: string;
  status: string;
  detail: string;
  at: string;
  done: string;
  total: string;
  bytes: number;
  selection: string;
  locked: string;
  workerActive?: boolean;
};
type Policy = {
  budgetMiB: number;
  metered: boolean;
  lowBattery: boolean;
  autoRefresh: boolean;
};
export default function OfflineControls({
  model,
  close,
  recovery,
  resource,
  reduced = false,
}: {
  model: MobileWorkspace;
  close: () => void;
  recovery: () => void;
  resource?: { id: string; title: string; scope: string };
  reduced?: boolean;
}) {
  const s = useThemeStyles(styles),
    { preferences } = useReading(),
    state = useSyncExternalStore(model.subscribe, model.snapshot);
  const [jobs, setJobs] = useState<Job[]>([]),
    [policy, setPolicy] = useState<Policy>(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [dependencies, setDependencies] = useState('images'),
    [originals, setOriginals] = useState(false),
    [budget, setBudget] = useState('512');
  const [showSetup, setShowSetup] = useState(!!resource),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const j = await request('list');
        if (alive) {
          setJobs(j);
          setLoaded(true);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    void refresh();
    void request('policy')
      .then(p => {
        if (alive) {
          setPolicy(p);
          setBudget(String(p.budgetMiB));
        }
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    const timer = setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (f: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await f();
      setJobs(await request('list'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const running = jobs.some(j => j.workerActive);
  const source = {
    ...state.host,
    scope: state.scope,
    name:
      state.workspaces?.find(w => w.id === state.host?.workspaceId)?.name ??
      'My workspace',
  };
  const prepare = async (selection: object) => {
    if (state.connection !== 'online')
      throw Error(
        'Connect to this workspace first. Existing downloads remain readable.',
      );
    const value = { ...source, selection };
    const estimate = JSON.parse(
      await native.companionEstimate(JSON.stringify(value)),
    );
    Alert.alert(
      'Download for offline',
      `${estimate.resources} resources · approximately ${(
        Number(estimate.bytes) / 1048576
      ).toFixed(1)} MiB. ${estimate.omittedFiles ?? 0} originals omitted; ${
        estimate.unavailable ?? 0
      } unavailable resources. Final size can change.\n\nReading copies are stored in this app’s private storage, not encrypted archives. Android device encryption/screen lock protects the device; this is not protection on an unlocked or compromised phone. Uninstall/clear data removes downloads. Credentials and legacy recovery stay separate.\n\nOnly a completely verified download replaces the current reading copy. This selection replaces your previous selection for this workspace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: () =>
            void run(async () => {
              await request('start', value);
            }),
        },
      ],
    );
  };
  const choose = (scope: string, ids: string[] = []) =>
    void run(() =>
      prepare({
        scope,
        ids,
        dependencies,
        files: originals ? 'originals' : 'readable',
      }),
    );
  const changePolicy = (v: Partial<Policy>) =>
    void run(async () => {
      const p = await request('policyPut', { ...policy, ...v });
      setPolicy(p);
      setBudget(String(p.budgetMiB));
    });
  return (
    <Modal
      animationType={
        reduced || preferences.motion === 'snappy' ? 'none' : 'fade'
      }
      onRequestClose={close}
    >
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.title}>
            Offline downloads
          </Text>
          <Action label="Done" onPress={close} />
        </View>
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.meta}>
            Read anywhere. Refresh from your source workspace when connected.
          </Text>
          {error ? (
            <View accessibilityRole="alert">
              <Text style={s.error}>{error}</Text>
              <Action label="Dismiss message" onPress={() => setError('')} />
            </View>
          ) : null}
          <Text accessibilityRole="header" style={s.heading}>
            On this device
          </Text>
          {!jobs.length ? (
            <Text style={s.meta}>
              No reading downloads yet. Connect and select content above.
            </Text>
          ) : null}
          {jobs.map(j => (
            <View key={j.id} style={s.item}>
              <Text style={s.text}>{j.name}</Text>
              <Text style={s.meta}>
                {j.locked === '1'
                  ? 'Locked · reconnect to verify access'
                  : j.status === 'ready'
                  ? 'Ready · ' + new Date(Number(j.at)).toLocaleString()
                  : j.status}{' '}
                · {(j.bytes / 1048576).toFixed(1)} MiB
              </Text>
              <Text style={s.meta}>{j.detail}</Text>
              <View style={s.row}>
                {j.active === j.id && j.locked !== '1' ? (
                  <Action
                    label="Read downloaded"
                    onPress={() =>
                      void run(async () => {
                        await model.openCompanion(j.scope);
                        close();
                      })
                    }
                  />
                ) : null}
                {j.scope === state.scope ? (
                  <Action
                    label={j.status === 'ready' ? 'Refresh' : 'Resume / retry'}
                    disabled={
                      pending || running || state.connection !== 'online'
                    }
                    onPress={() =>
                      void run(() => prepare(JSON.parse(j.selection)))
                    }
                  />
                ) : null}
                <Action
                  label="Remove download"
                  disabled={pending || running}
                  onPress={() =>
                    Alert.alert(
                      'Remove downloaded reading copy?',
                      'This removes only this download and its incomplete bytes. Legacy drafts, pending work, host originals and credentials remain. Export legacy recovery separately if needed.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () =>
                            void run(async () => {
                              await request('remove', { id: j.id });
                              if (j.active === j.id) {
                                model.removedCompanion(j.scope);
                                close();
                              }
                            }),
                        },
                      ],
                    )
                  }
                />
              </View>
            </View>
          ))}
          <Action
            label="Download content"
            active={showSetup}
            onPress={() => setShowSetup(x => !x)}
          />
          {showSetup || (loaded && !jobs.length) ? (
            <View>
              {' '}
              <Text accessibilityRole="header" style={s.heading}>
                Download from this workspace
              </Text>
              <View style={s.row}>
                {[
                  ['none', 'Selection only'],
                  ['images', 'Include note images'],
                  ['linked', 'Include linked chain'],
                ].map(([v, label]) => (
                  <Action
                    key={v}
                    label={label}
                    active={dependencies === v}
                    onPress={() => setDependencies(v)}
                  />
                ))}
              </View>
              <View style={s.setting}>
                <Text style={s.text}>All original file formats</Text>
                <Switch
                  accessibilityLabel="Include all original file formats"
                  value={originals}
                  onValueChange={setOriginals}
                />
              </View>
              <Text style={s.meta}>
                Off includes supported readable images, PDF and text originals.
                Files remain files; unsupported viewers still offer originals.
              </Text>
              <Action
                label="Download workspace"
                disabled={pending || running || state.connection !== 'online'}
                onPress={() => choose('workspace')}
              />
              {resource?.scope === state.scope ? (
                <Action
                  label={`Download resource: ${resource.title}`}
                  disabled={pending || running || state.connection !== 'online'}
                  onPress={() => choose('resources', [resource.id])}
                />
              ) : null}
              {state.browse.collection ? (
                <Action
                  label={`Download collection: ${state.browse.collection.name}`}
                  disabled={pending || running || state.connection !== 'online'}
                  onPress={() =>
                    choose('collections', [state.browse.collection!.id])
                  }
                />
              ) : null}
              {state.note ? (
                <Action
                  label={`Download note: ${state.note.title}`}
                  disabled={pending || running || state.connection !== 'online'}
                  onPress={() => choose('resources', [state.note!.id])}
                />
              ) : null}
              <Action
                label="Pause current download"
                onPress={() =>
                  void run(async () => {
                    await request('pause');
                  })
                }
              />
            </View>
          ) : null}
          <Text accessibilityRole="header" style={s.heading}>
            Download policy · this device
          </Text>
          <View style={s.setting}>
            <Text style={s.text}>Budget (MiB, 64–2048)</Text>
            <TextInput
              accessibilityLabel="Download budget MiB"
              keyboardType="number-pad"
              style={s.number}
              value={budget}
              onChangeText={setBudget}
              onEndEditing={() => changePolicy({ budgetMiB: Number(budget) })}
            />
          </View>
          {policy
            ? (['metered', 'lowBattery', 'autoRefresh'] as const).map(k => (
                <View key={k} style={s.setting}>
                  <Text style={s.text}>
                    {
                      {
                        metered: 'Allow metered downloads',
                        lowBattery: 'Allow below 15% battery',
                        autoRefresh: 'Refresh on reconnect',
                      }[k]
                    }
                  </Text>
                  <Switch
                    accessibilityLabel={
                      {
                        metered: 'Allow metered downloads',
                        lowBattery: 'Allow low battery downloads',
                        autoRefresh: 'Refresh on reconnect',
                      }[k]
                    }
                    value={policy[k]}
                    onValueChange={v => changePolicy({ [k]: v })}
                  />
                </View>
              ))
            : null}
          <Text style={s.meta}>
            Refresh on reconnect applies to existing selections in the
            foreground. Downloads may pause when Android stops the app; Resume
            continues verified bytes. Removing content never frees or
            acknowledges pending work. Local search covers downloaded titles and
            saved note text, not extracted file text.
          </Text>
          <Action label="Legacy recovery / export" onPress={recovery} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  title: { flex: 1, fontSize: 20, fontWeight: '600', color: '#e8e8e8' },
  body: { padding: 20, gap: 12, paddingBottom: 60 },
  heading: { color: '#e8e8e8', fontSize: 20, fontWeight: '600', marginTop: 20 },
  text: { color: '#e8e8e8', fontSize: 16, flexShrink: 1 },
  meta: { color: '#b3b3b3', fontSize: 14, lineHeight: 21 },
  error: { color: '#ffb4b4', fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  item: {
    borderBottomWidth: 1,
    borderColor: '#333',
    paddingVertical: 16,
    gap: 6,
  },
  number: {
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#333',
    padding: 10,
    minWidth: 80,
  },
});
