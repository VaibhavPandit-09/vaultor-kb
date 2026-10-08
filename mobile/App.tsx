import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { bridgeMessage, scopeFor, type Doc, type Note } from './src/bridge';
const native = NativeModules.VaultorNative;
const parse = async (p: Promise<string>) => JSON.parse(await p);
async function localNetworkPermission() {
  if (Number(Platform.Version) < 37) return;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_LOCAL_NETWORK,
  );
  if (result !== 'granted')
    throw Error(
      'Allow local-network access to connect. You can retry this permission.',
    );
}
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  revision?: string,
) {
  const deadline = Date.now() + 30000;
  while (true) {
    const r = await parse(
      native.api(
        path,
        method,
        body === undefined ? null : JSON.stringify(body),
        revision ?? null,
      ),
    );
    if (method === 'GET' && r.status === 409 && Date.now() < deadline) {
      let problem;
      try {
        problem = JSON.parse(r.body);
      } catch {}
      if (problem?.code === 'WORKSPACE_BUSY') {
        await new Promise<void>(resolve => setTimeout(resolve, 200));
        continue;
      }
    }
    if (r.status < 200 || r.status >= 300)
      throw Error(
        r.status === 412
          ? 'Saved note changed on another device. Your local draft is retained.'
          : `Host request failed (${r.status}). Retry; your draft is retained.`,
      );
    return r.body ? JSON.parse(r.body) : null;
  }
}
const Button = ({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      s.button,
      pressed && s.pressed,
      disabled && s.disabled,
    ]}
  >
    <Text style={s.buttonText}>{label}</Text>
  </Pressable>
);
function Workspace() {
  const [address, setAddress] = useState('https://'),
    [connected, setConnected] = useState(false),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]),
    [note, setNote] = useState<Note | null>(null),
    [scope, setScope] = useState(''),
    [status, setStatus] = useState(''),
    [supported, setSupported] = useState(false);
  const web = useRef<WebView<{}>>(null),
    active = useRef<Note | null>(null),
    draft = useRef<{ content: Doc; version: string } | null>(null),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    loadId = useRef(''),
    ready = useRef(false),
    working = useRef(false);
  const perform = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed; retry without discarding drafts.',
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  const inject = (message: object) =>
    web.current?.injectJavaScript(
      `window.vaultorReceive(${JSON.stringify(
        JSON.stringify({ protocol: 1, ...message }),
      )});true;`,
    );
  const loadEditor = () => {
    if (active.current && ready.current)
      inject({
        type: 'load',
        loadId: loadId.current,
        content:
          draft.current?.content ??
          (typeof active.current.content === 'string'
            ? JSON.parse(active.current.content)
            : active.current.content),
      });
  };
  const connect = async () => {
    await localNetworkPermission();
    const caps = await api('/capabilities');
    if (caps.apiProtocolVersion < 3 || caps.minimumClientProtocolVersion > 3)
      throw Error('Host is incompatible; update the required client or host.');
    const identity = await api('/workspace/identity'),
      profile = await parse(native.profile());
    const key = scopeFor(
      profile.hostId,
      identity.id ?? identity.workspaceId,
      String(identity.generation),
    );
    const retained = await parse(native.draft());
    setRecoveryId(retained?.scope === key ? retained.noteId : null);
    setScope(key);
    setAddress(profile.address);
    const list = await api('/resources?page=0&size=30&type=note');
    setNotes(list.items);
    setConnected(true);
  };
  useEffect(() => {
    void perform(async () => {
      const profile = await parse(native.profile());
      if (profile) {
        setAddress(profile.address);
        await connect();
      }
    }); /* A2 adds reconnect epochs. */
  }, []);
  const open = async (id: string) => {
    const stored = await parse(native.draft());
    if (stored && (stored.scope !== scope || stored.noteId !== id))
      throw Error(
        'A draft for another note is retained. Reopen its source before editing another note in this prototype.',
      );
    const value = (await api('/resources/' + id)) as Note;
    if (value.type !== 'note') throw Error('Only notes are editable in A1.');
    if (stored && stored.revision !== value.revision)
      throw Error(
        'Recovery conflicts with the saved note. Draft retained; conflict choices arrive in A2.',
      );
    active.current = value;
    draft.current = stored
      ? { content: stored.content, version: stored.version }
      : null;
    loadId.current = id + ':' + Date.now();
    setNote(value);
    setStatus(stored ? 'Recovered local draft' : 'Saved');
    setSupported(false);
    ready.current = false;
  };
  const save = async () => {
    if (!supported || !active.current || !draft.current) return;
    inject({ type: 'editable', value: false });
    setSupported(false);
    try {
      await queue.current.catch(() => {});
      const n = active.current,
        d = draft.current;
      // Retry protection first; a previous storage failure must not make Save
      // permanently unretryable, and the server is never written before this succeeds.
      await native.journal(JSON.stringify({...d,scope,noteId:n.id,revision:n.revision}));
      const result = await api(
        '/resources/' + n.id + '/note',
        'PUT',
        { title: n.title, content: d.content },
        `"${n.revision}"`,
      );
      active.current = { ...n, ...result };
      setNote(active.current);
      await native.acknowledge(d.version);
      if (draft.current?.version === d.version) {
        draft.current = null;
        setRecoveryId(null);
        setStatus('Saved');
      } else {
        const latest = draft.current;
        await native.journal(
          JSON.stringify({
            ...latest,
            scope,
            noteId: n.id,
            revision: result.revision,
          }),
        );
        setStatus('Unsaved · draft protected');
      }
    } finally {
      inject({ type: 'editable', value: true });
      setSupported(true);
    }
  };
  const onMessage = (raw: string) => {
    const m = bridgeMessage(raw, loadId.current);
    if (!m) return;
    if (m.type === 'ready') {
      ready.current = true;
      loadEditor();
    }
    if (m.type === 'loaded') setSupported(true);
    if (m.type === 'unsupported') {
      setSupported(false);
      setError(
        'Unsupported content. Original JSON is retained; editing and saving are disabled.',
      );
    }
    if (m.type === 'changed' && m.content && active.current) {
      const d = {
        content: m.content,
        version: Date.now() + ':' + Math.random(),
      };
      draft.current = d;
      setRecoveryId(active.current.id);
      setStatus('Protecting draft…');
      const snapshot = {
        ...d,
        scope,
        noteId: active.current.id,
        revision: active.current.revision,
      };
      queue.current = queue.current
        .catch(() => {})
        .then(() => native.journal(JSON.stringify(snapshot)))
        .then(() => {
          if(draft.current?.version===d.version) setStatus('Unsaved · draft protected');
        })
        .catch(e => {
          setStatus('Recovery write failed');
          setError(e.message);
          throw e;
        });
      void queue.current.catch(() => {});
    }
  };
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Vaultor</Text>
        <Text style={s.muted}>Android · A1 prototype</Text>
      </View>
      {error ? (
        <View accessibilityRole="alert" style={s.error}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : null}
      {busy ? <ActivityIndicator color="#70a5ff" /> : null}
      {!connected ? (
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.heading}>Connect to your workspace</Text>
          <Text style={s.muted}>
            Enable sharing on your Windows or Mac host. Enter its private HTTPS
            address.
          </Text>
          <TextInput
            accessibilityLabel="Host HTTPS address"
            style={s.input}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Pair with host"
            disabled={busy}
            onPress={() =>
              void perform(async () => {
                await localNetworkPermission();
                const result = await parse(native.beginPairing(address));
                setCode(result.code);
              })
            }
          />
          {code ? (
            <>
              <Text style={s.heading}>Compare code: {code}</Text>
              <Text style={s.muted}>
                Approve only when the host shows the same code. Approval is
                remembered.
              </Text>
              <Button
                label="I approved the matching code"
                disabled={busy}
                onPress={() =>
                  void perform(async () => {
                    const result = await parse(native.completePairing());
                    if (result.state !== 'APPROVED')
                      throw Error(
                        'Waiting for host approval. Compare and approve the code there, then retry.',
                      );
                    await connect();
                  })
                }
              />
            </>
          ) : null}
          <Button
            label="Reconnect remembered host"
            disabled={busy}
            onPress={() => void perform(connect)}
          />
          <Text style={s.muted}>
            Full browsing, recovery choices and images follow in later sprints.
          </Text>
        </ScrollView>
      ) : note ? (
        <View style={s.workspace}>
          <View style={s.noteHeader}>
            <Text numberOfLines={1} style={s.heading}>
              {note.title}
            </Text>
            <Text style={s.muted}>{status}</Text>
          </View>
          <View style={s.toolbar}>
            {['bold', 'italic', 'undo', 'redo'].map(name => (
              <Button
                key={name}
                label={name}
                disabled={!supported}
                onPress={() => inject({ type: 'command', name })}
              />
            ))}
            <Button
              label="Save"
              disabled={busy || !supported}
              onPress={() => void perform(save)}
            />
          </View>
          <WebView<{}>
            ref={web}
            key={loadId.current}
            source={{ uri: 'file:///android_asset/editor.html' }}
            originWhitelist={['file://']}
            javaScriptEnabled
            domStorageEnabled={false}
            allowFileAccess
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={r =>
              r.url === 'file:///android_asset/editor.html' ||
              r.url === 'about:blank'
            }
            onMessage={e => onMessage(e.nativeEvent.data)}
            onRenderProcessGone={() => {
              setSupported(false);
              setError(
                'Editor stopped. Reopen this note; any protected draft is retained.',
              );
            }}
            style={s.web}
          />
          <Button
            label="Back to notes"
            disabled={busy}
            onPress={() => {
              const leave = () => {
                setNote(null);
                active.current = null;
                ready.current = false;
              };
              if (draft.current)
                Alert.alert(
                  'Keep your draft?',
                  'It remains on this device. Reopen this note to continue.',
                  [
                    { text: 'Stay', style: 'cancel' },
                    { text: 'Keep draft and return', onPress: leave },
                  ],
                );
              else leave();
            }}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.heading}>Notes</Text>
          <Text style={s.muted}>
            First 30 notes · full browsing arrives in A3
          </Text>
          {recoveryId ? (
            <Button
              label="Reopen protected draft"
              disabled={busy}
              onPress={() => void perform(() => open(recoveryId))}
            />
          ) : null}
          {notes.map(n => (
            <Button
              key={n.id}
              label={n.title}
              disabled={busy}
              onPress={() => void perform(() => open(n.id))}
            />
          ))}
          <Button
            label="Refresh"
            disabled={busy}
            onPress={() => void perform(connect)}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Workspace />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#252525',
  },
  title: { color: '#e8e8e8', fontSize: 24, fontWeight: '700' },
  muted: { color: '#b3b3b3', fontSize: 13, lineHeight: 20 },
  content: { padding: 18, gap: 14 },
  heading: { color: '#e8e8e8', fontSize: 19, fontWeight: '600' },
  input: {
    color: '#e8e8e8',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#555',
    borderRadius: 10,
    padding: 14,
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonText: { color: '#90b8ff', fontSize: 15 },
  pressed: { backgroundColor: '#1e1e1e' },
  disabled: { opacity: 0.45 },
  error: { padding: 12, borderBottomWidth: 1, borderColor: '#753f3f' },
  errorText: { color: '#ffb4b4', fontSize: 14 },
  workspace: { flex: 1 },
  noteHeader: { padding: 14 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingHorizontal: 8,
  },
  web: { flex: 1, backgroundColor: '#000' },
});
