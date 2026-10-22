import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import ContextSheet from './ContextSheet';
import { Action } from './Action';
import { importCall } from './useImportQueue';
import { importState, type ImportItem } from './imports';
import { useThemeStyles } from './ui';
import type { MobileWorkspace } from './workspace';
type Policy = { budgetMiB: number; metered: boolean };
export default function PendingImports({
  items,
  error,
  busy,
  model,
  label,
  close,
  chooseSource,
  refresh,
  sync,
}: {
  items: ImportItem[];
  error: string;
  busy: boolean;
  model: MobileWorkspace;
  label: string;
  close(): void;
  chooseSource(): void;
  refresh(): Promise<void>;
  sync(force?: boolean): Promise<void>;
}) {
  const s = useThemeStyles(styles),
    [selected, setSelected] = useState<string>(),
    [failure, setFailure] = useState(''),
    [mode, setMode] = useState('original'),
    [collection, setCollection] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [rootChosen, setRootChosen] = useState(false),
    [workspaceName, setWorkspaceName] = useState('Imported workspace'),
    [metered, setMetered] = useState(false),
    [policy, setPolicy] = useState<Policy>(),
    [budget, setBudget] = useState('256'),
    [policyOpen, setPolicyOpen] = useState(false),
    [working, setWorking] = useState(false);
  const row = items.find(r => r.id === selected),
    state = model.snapshot();
  const list = useRef<FlatList<ImportItem>>(null);
  useEffect(() => {
    setCollection(null);
    setRootChosen(false);
  }, [state.scope]);
  useEffect(() => {
    void importCall<Policy>('policy')
      .then(p => {
        setPolicy(p);
        setBudget(String(p.budgetMiB));
      })
      .catch(e => setFailure(String(e)));
  }, []);
  async function run(task: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setFailure('');
    try {
      await task();
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  function inspect(item: ImportItem) {
    setSelected(item.id);
    setMode(item.mode ?? 'original');
    setCollection(model.snapshot().browse.collection ?? null);
    setRootChosen(false);
    setMetered(false);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }
  async function confirm() {
    const st = model.snapshot();
    if (!st.host || !st.scope) throw Error('Choose an approved source first');
    if (mode !== 'workspaceZip' && !collection && !rootChosen)
      throw Error(
        'Choose the current collection or explicitly confirm workspace root',
      );
    await importCall('confirm', {
      id: row!.id,
      hostId: st.host.hostId,
      epoch: st.host.epoch,
      scope: st.scope,
      label,
      mode,
      collectionId: collection?.id,
      workspaceName,
      metered,
    });
    await sync();
  }
  const header = (
    <View style={s.body}>
      <Text accessibilityRole="text" style={s.secondary}>
        {items.filter(item => item.state === 'acknowledged').length} host
        acknowledgments ·{' '}
        {
          items.filter(
            item => !['acknowledged', 'cancelled'].includes(item.state),
          ).length
        }{' '}
        pending ·{' '}
        {(
          items.reduce((total, item) => total + item.bytes, 0) / 1048576
        ).toFixed(1)}{' '}
        MiB retained
      </Text>
      <Text style={s.secondary}>
        Private on this phone · all sources. Originals stay local until the
        confirmed host accepts them.
      </Text>
      <View style={s.actions}>
        <Action
          label="Files"
          disabled={working}
          onPress={() => void run(() => importCall('pickFiles'))}
        />
        <Action
          label="Photos"
          disabled={working}
          onPress={() => void run(() => importCall('pickPhotos'))}
        />
        <Action
          label={busy ? 'Delivering…' : 'Retry due imports'}
          disabled={busy || working}
          onPress={() => void run(() => sync(true))}
        />
      </View>
      {error || failure ? (
        <Text accessibilityRole="alert" style={s.error}>
          {failure || error}
        </Text>
      ) : null}
      <Action
        label="Import storage & network"
        onPress={() => setPolicyOpen(v => !v)}
      />
      {policyOpen && policy ? (
        <View style={s.body}>
          <Text style={s.secondary}>
            64 MiB per input · 8 per acquisition · 128 retained items. Lowering
            storage never evicts pending originals.
          </Text>
          <Text style={s.label}>Private staging budget (MiB)</Text>
          <TextInput
            accessibilityLabel="Import storage budget MiB"
            style={s.input}
            keyboardType="number-pad"
            value={budget}
            onChangeText={setBudget}
          />
          <View style={s.actions}>
            <Text style={s.secondary}>Allow automatic metered uploads</Text>
            <Switch
              accessibilityLabel="Allow automatic metered imports"
              value={policy.metered}
              onValueChange={value => setPolicy({ ...policy, metered: value })}
            />
          </View>
          <Action
            label="Save import policy"
            onPress={() =>
              void run(async () => {
                await importCall('policyPut', {
                  budgetMiB: Number(budget),
                  metered: policy.metered,
                });
                await sync();
              })
            }
          />
        </View>
      ) : null}
      {row ? (
        <View style={s.body}>
          <Text accessibilityRole="header" style={s.label}>
            {row.filename}
          </Text>
          <Text style={s.secondary}>
            {importState(row.state)} · {(row.bytes / 1048576).toFixed(2)} MiB
          </Text>
          <Text style={s.secondary}>{row.detail}</Text>
          {row.source ? (
            <Text style={s.secondary}>
              Confirmed destination:{' '}
              {row.source.label || row.source.workspaceId}
            </Text>
          ) : null}
          {row.sha256 ? (
            <Text selectable style={s.meta}>
              SHA-256 {row.sha256}
            </Text>
          ) : null}
          {row.state === 'collected' ? (
            <>
              <Text style={s.label}>
                Destination: {state.scope ? label : 'Not selected'}
              </Text>
              <Action
                label="Choose reading source for destination"
                onPress={chooseSource}
              />
              <View style={s.actions}>
                {(
                  ['original', 'text', 'markdown', 'workspaceZip'] as const
                ).map(value => (
                  <Action
                    key={value}
                    active={mode === value}
                    label={
                      {
                        original: 'Original file',
                        text: 'Text note',
                        markdown: 'Markdown note',
                        workspaceZip: 'Workspace ZIP',
                      }[value]
                    }
                    onPress={() => setMode(value)}
                  />
                ))}
              </View>
              {mode === 'workspaceZip' ? (
                <>
                  <Text style={s.secondary}>
                    The host owner must inspect and authorize this exact
                    archive. Existing workspaces are never replaced.
                  </Text>
                  <TextInput
                    accessibilityLabel="New workspace name"
                    style={s.input}
                    value={workspaceName}
                    maxLength={100}
                    onChangeText={setWorkspaceName}
                  />
                </>
              ) : (
                <>
                  <Text style={s.label}>
                    Collection:{' '}
                    {collection?.name ??
                      (rootChosen ? 'Workspace root' : 'Choose explicitly')}
                  </Text>
                  {state.browse.collection ? (
                    <Action
                      label={'Use ' + state.browse.collection.name}
                      onPress={() => {
                        setCollection(state.browse.collection!);
                        setRootChosen(false);
                      }}
                    />
                  ) : null}
                  <Action
                    label="Use workspace root"
                    active={rootChosen && !collection}
                    onPress={() => {
                      setCollection(null);
                      setRootChosen(true);
                    }}
                  />
                  <Text style={s.meta}>
                    For another collection, return to Library, open it, then
                    inspect this pending input.
                  </Text>
                </>
              )}
              <Text style={s.secondary}>
                {mode === 'text' || mode === 'markdown'
                  ? 'The host creates one note and preserves the imported original as provenance. Formatting limits and host refusals remain visible.'
                  : 'Original bytes are preserved.'}
              </Text>
              <View style={s.actions}>
                <Text style={s.secondary}>
                  Allow this input on metered network
                </Text>
                <Switch
                  accessibilityLabel="Allow this import on metered network"
                  value={metered}
                  onValueChange={setMetered}
                />
              </View>
              <Action
                label="Confirm destination & queue"
                disabled={
                  working || !state.scope || state.connection === 'revoked'
                }
                onPress={() => void run(confirm)}
              />
            </>
          ) : null}
          {row.receipt?.warnings?.map((warning, i) => (
            <Text key={i} style={s.secondary}>
              {warning}
            </Text>
          ))}
          {row.sha256 && row.state !== 'acquiring' ? (
            <Action
              label="Recover original bytes"
              onPress={() =>
                void run(() => importCall('recover', { id: row.id }))
              }
            />
          ) : null}
          {row.attempted && !row.receipt && row.state !== 'sending' ? (
            <>
              <Action
                label="Reconcile exact operation"
                disabled={working}
                onPress={() =>
                  void run(async () => {
                    await importCall('retry', { id: row.id, metered });
                    await sync(true);
                  })
                }
              />
              <View style={s.actions}>
                <Text style={s.secondary}>Allow metered retry</Text>
                <Switch
                  accessibilityLabel="Allow metered retry"
                  value={metered}
                  onValueChange={setMetered}
                />
              </View>
            </>
          ) : null}
          {row.state === 'queued' ||
          row.state === 'unknown' ||
          row.state === 'sending' ? (
            <Action
              label="Stop further attempts"
              onPress={() => void run(() => importCall('stop', { id: row.id }))}
            />
          ) : null}
          {row.rejectionCode ? (
            <Action
              label="Choose a new import after host rejection"
              disabled={working}
              onPress={() =>
                void run(async () => {
                  const next = await importCall<ImportItem>(
                    'newAfterRejection',
                    { id: row.id },
                  );
                  inspect(next);
                })
              }
            />
          ) : null}
          {!row.attempted || row.receipt || row.rejectionCode ? (
            <Action
              label="Remove local input"
              disabled={working || row.state === 'acquiring'}
              onPress={() =>
                Alert.alert(
                  'Remove local input?',
                  'This removes this device’s original bytes. Host resources and protected Reviews stay unchanged.',
                  [
                    { text: 'Keep', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () =>
                        void run(async () => {
                          await importCall('remove', { id: row.id });
                          setSelected(undefined);
                        }),
                    },
                  ],
                )
              }
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
  return (
    <ContextSheet title="Pending imports" close={close}>
      <FlatList
        ref={list}
        keyboardShouldPersistTaps="handled"
        data={items}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={s.secondary}>
            Collect files or photos, or share to Vaultor from another app.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <Action
              label={item.filename + ' · ' + importState(item.state)}
              onPress={() => inspect(item)}
            />
            <Text style={s.meta}>
              {item.source?.label || 'Destination not assigned'} ·{' '}
              {(item.bytes / 1048576).toFixed(2)} MiB
            </Text>
          </View>
        )}
      />
    </ContextSheet>
  );
}
const styles = StyleSheet.create({
  body: { gap: 10, padding: 12 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  label: { color: '#e8e8e8', fontWeight: '600', fontSize: 16 },
  secondary: { color: '#b3b3b3', fontSize: 14, lineHeight: 20 },
  meta: { color: '#858585', fontSize: 12 },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#252525',
  },
  input: {
    color: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 10,
    minHeight: 48,
  },
  error: { color: '#ffb4b4' },
});
