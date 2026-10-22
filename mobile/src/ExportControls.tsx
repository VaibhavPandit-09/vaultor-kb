import React, { useEffect, useState } from 'react';
import {
  Alert,
  NativeEventEmitter,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ContextSheet from './ContextSheet';
import { Action } from './Action';
import { useThemeStyles } from './ui';
import type { MobileWorkspace } from './workspace';
const native = NativeModules.VaultorNative;
const call = async <T,>(action: string, input: object = {}): Promise<T> =>
  JSON.parse(await native.companionExports(action, JSON.stringify(input)));
type Job = {
  id: string;
  label: string;
  state: string;
  detail: string;
  filename?: string;
  bytes?: number;
  sha256?: string;
  offline: boolean;
  coverage?: {
    capturedAt: string;
    reviewCoverage: string;
    provenanceCoverage: string;
    omissions: { id: string; reason: string }[];
    inventory?: { id: string; title: string; type: string }[];
  };
};
export default function ExportControls({
  model,
  label,
  close,
}: {
  model: MobileWorkspace;
  label: string;
  close(): void;
}) {
  const s = useThemeStyles(styles),
    state = model.snapshot();
  const [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(''),
    [working, setWorking] = useState(false),
    [scope, setScope] = useState('resources'),
    [format, setFormat] = useState('partial'),
    [depth, setDepth] = useState(0),
    [selection, setSelection] = useState<string[]>([]),
    [choices, setChoices] = useState<{ id: string; title: string }[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [details, setDetails] = useState<string>();
  const offline = state.connection !== 'online' || !!state.downloaded;
  async function refresh() {
    try {
      setJobs(await call<Job[]>('list'));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const sub = new NativeEventEmitter(native).addListener(
      'VaultorExportsChanged',
      () => void refresh(),
    );
    return () => sub.remove();
  }, []);
  async function run(task: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await task();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function choosePage(next: number) {
    const captured = state.scope;
    const value = await model.browseApi(
      '/resources?page=' + next + '&size=25&sort=title',
    );
    if (model.snapshot().scope !== captured)
      throw Error('Source changed; choose content again');
    setChoices(value.items);
    setPage(next);
    setMore(next + 1 < value.totalPages);
    setScope('selection');
  }
  useEffect(() => {
    setSelection([]);
    setChoices([]);
    setScope('resources');
    setDepth(0);
  }, [state.scope]);
  const note = state.note,
    collection = state.browse.collection;
  const actualFormat =
    scope === 'workspace'
      ? 'zip'
      : scope === 'note'
      ? offline
        ? 'markdown'
        : format === 'partial'
        ? 'md'
        : format
      : offline && format === 'markdown'
      ? 'markdown'
      : 'partial';
  async function start() {
    if (!state.host || !state.scope) throw Error('Choose a source first');
    const ids =
      scope === 'selection'
        ? selection
        : scope === 'workspace' || scope === 'downloaded'
        ? []
        : scope === 'collection'
        ? [collection!.id]
        : [note!.id];
    await call('start', {
      hostId: state.host.hostId,
      epoch: state.host.epoch,
      scope: state.scope,
      label,
      offline,
      request: {
        scope:
          scope === 'selection' || (scope === 'note' && offline)
            ? 'resources'
            : scope,
        ids,
        depth,
        format: actualFormat,
      },
    });
  }
  return (
    <ContextSheet title="Export" close={close}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.secondary}>
          {offline
            ? 'Offline: only verified downloaded content can be included. Full workspace ZIP, PDF and Word need a connected host.'
            : 'The host prepares the selected saved content. Full ZIP is authoritative; selected packages are explicitly partial.'}
        </Text>
        <View style={s.actions}>
          <Action
            label="Select resources"
            active={scope === 'selection'}
            onPress={() => void run(() => choosePage(0))}
          />
          {note ? (
            <Action
              label="Current resource"
              active={scope === 'resources'}
              onPress={() => setScope('resources')}
            />
          ) : null}
          {collection ? (
            <Action
              label="Current collection"
              active={scope === 'collection'}
              onPress={() => setScope('collection')}
            />
          ) : null}
          {note?.type !== 'file' && note ? (
            <Action
              label="Note format"
              active={scope === 'note'}
              onPress={() => setScope('note')}
            />
          ) : null}
          {offline ? (
            <Action
              label="Downloaded resources"
              active={scope === 'downloaded'}
              onPress={() => setScope('downloaded')}
            />
          ) : null}
            <Action
              disabled={offline}
              label="Full workspace ZIP"
              active={scope === 'workspace'}
              onPress={() => setScope('workspace')}
            />
        </View>
        {scope === 'selection' ? (
          <View style={s.group}>
            <Text style={s.label}>
              {selection.length} selected (up to100 seeds)
            </Text>
            {choices.map(choice => (
              <Action
                key={choice.id}
                label={choice.title}
                active={selection.includes(choice.id)}
                onPress={() =>
                  setSelection(old =>
                    old.includes(choice.id)
                      ? old.filter(id => id !== choice.id)
                      : old.length < 100
                      ? [...old, choice.id]
                      : old,
                  )
                }
              />
            ))}
            <View style={s.actions}>
              <Action
                label="Previous resources"
                disabled={page === 0}
                onPress={() => void run(() => choosePage(page - 1))}
              />
              <Action
                label="More resources"
                disabled={!more}
                onPress={() => void run(() => choosePage(page + 1))}
              />
            </View>
          </View>
        ) : null}
        {scope !== 'workspace' && (scope !== 'note' || offline) ? (
          <>
            <Text style={s.label}>Linked resources: depth {depth}</Text>
            <View style={s.actions}>
              {[0, 1, 2, 3].map(n => (
                <Action
                  key={n}
                  label={String(n)}
                  active={depth === n}
                  onPress={() => setDepth(n)}
                />
              ))}
            </View>
            <Text style={s.secondary}>
              Up to500 resources /256MiB. Missing originals and links remain
              listed; no complete-workspace claim. Offline Reviews include only
              acknowledged captures on this device; hidden import provenance is
              unavailable in reading checkpoints.
            </Text>
          </>
        ) : null}
        {scope === 'note' && !offline ? (
          <View style={s.actions}>
            {['md', 'md-assets', 'pdf', 'docx'].map(f => (
              <Action
                key={f}
                label={f}
                active={actualFormat === f}
                onPress={() => setFormat(f)}
              />
            ))}
          </View>
        ) : offline ? (
          <View style={s.actions}>
            {['partial', 'markdown'].map(f => (
              <Action
                key={f}
                label={
                  f === 'partial'
                    ? 'Portable partial'
                    : 'Markdown + available assets'
                }
                active={format === f}
                onPress={() => setFormat(f)}
              />
            ))}
          </View>
        ) : null}
        <Action
          label={working ? 'Preparing…' : 'Prepare selected export'}
          disabled={
            working ||
            !state.host ||
            (scope === 'selection' && !selection.length) ||
            (!note && scope === 'resources') ||
            (!collection && scope === 'collection')
          }
          onPress={() => void run(start)}
        />
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {jobs.map(job => (
          <View key={job.id} style={s.row}>
            <Text style={s.label}>
              {job.filename || 'Export'} · {job.state}
            </Text>
            <Text style={s.secondary}>{job.label}</Text>
            <Text style={s.secondary}>{job.detail}</Text>
            {job.coverage ? (
              <>
                <Action
                  label="Inventory & omissions"
                  onPress={() =>
                    setDetails(old => (old === job.id ? undefined : job.id))
                  }
                />
                {details === job.id ? (
                  <View style={s.group}>
                    {job.coverage.inventory?.slice(0, 25).map(item => (
                      <Text key={item.id} style={s.secondary}>
                        {item.title} · {item.type}
                      </Text>
                    ))}
                    {job.coverage.omissions.slice(0, 25).map((item, index) => (
                      <Text key={index} style={s.secondary}>
                        Missing {item.id}: {item.reason}
                      </Text>
                    ))}
                    <Text style={s.secondary}>
                      First25 shown; the complete inventory and omissions are in
                      partial.json.
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}
            {job.coverage ? (
              <Text style={s.secondary}>
                Partial · captured {job.coverage.capturedAt} ·{' '}
                {job.coverage.omissions.length} omissions.{' '}
                {job.coverage.reviewCoverage}. {job.coverage.provenanceCoverage}
                .
              </Text>
            ) : null}
            {job.sha256 ? (
              <Text selectable style={s.meta}>
                SHA-256 {job.sha256} · {((job.bytes || 0) / 1048576).toFixed(1)}{' '}
                MiB
              </Text>
            ) : null}
            <View style={s.actions}>
              {job.state === 'ready' ? (
                <>
                  <Action
                    label="Save"
                    onPress={() => void run(() => call('save', { id: job.id }))}
                  />
                  <Action
                    label="Share"
                    onPress={() =>
                      void run(() => call('share', { id: job.id }))
                    }
                  />
                </>
              ) : (
                <>
                  <Action
                    label="Resume same export"
                    onPress={() =>
                      void run(() => call('resume', { id: job.id }))
                    }
                  />
                  <Action
                    label="Pause"
                    onPress={() =>
                      void run(() => call('pause', { id: job.id }))
                    }
                  />
                </>
              )}
              <Action
                label="Remove export"
                onPress={() =>
                  Alert.alert(
                    'Remove prepared export?',
                    'Only this derived export is removed. Source resources and protected queues remain.',
                    [
                      { text: 'Keep', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          void run(() => call('remove', { id: job.id })),
                      },
                    ],
                  )
                }
              />
            </View>
          </View>
        ))}
        <Text style={s.secondary}>
          Save and Share hand off to Android. A chooser opening does not prove
          the recipient saved the file. Retained exports can be tried again.
        </Text>
      </ScrollView>
    </ContextSheet>
  );
}
const styles = StyleSheet.create({
  body: { padding: 12, gap: 10 },
  group: { gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#333',
    gap: 6,
  },
  label: { color: '#e8e8e8', fontSize: 16, fontWeight: '600' },
  secondary: { color: '#b3b3b3', fontSize: 14, lineHeight: 20 },
  meta: { color: '#858585', fontSize: 12 },
  error: { color: '#ffb4b4' },
});
