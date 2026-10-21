import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  findNodeHandle,
  NativeModules,
  NativeEventEmitter,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import ContextSheet from './ContextSheet';
import { Action } from './Action';
import { usePalette, useReading, useThemeStyles } from './ui';
import { deliveryLabel, deliveryExplanation } from './reviewDelivery';
import { VaultorHaptics } from './haptics';
import {
  claimCaptureTrace,
  recordTrace,
  type CaptureTrace,
} from './captureTrace';
import { motionDuration, settleEasing } from './motion';
import { locatorLabel, type CaptureSeed, type CaptureItem } from './reviews';
const call = async (action: string, value: object = {}): Promise<any> =>
  JSON.parse(
    await NativeModules.VaultorNative.reviewCapture(
      action,
      JSON.stringify(value),
    ),
  );

export default function ReviewCapture({
  seed,
  initialId,
  close,
}: {
  seed?: CaptureSeed;
  initialId?: string;
  close(): void;
}) {
  const s = useThemeStyles(styles),
    { height } = useWindowDimensions(),
    palette = usePalette(),
    { preferences, reduced } = useReading();
  const [item, setItem] = useState<CaptureItem>(),
    [items, setItems] = useState<CaptureItem[]>([]),
    [comment, setComment] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [prepared, setPrepared] = useState(false),
    [protecting, setProtecting] = useState(false);
  const [details, setDetails] = useState(false);
  const [settled, setSettled] = useState<{ id?: string; tag: number }>({
    tag: 0,
  });
  const current = useRef<CaptureItem | undefined>(undefined),
    initial = useRef<Promise<any> | undefined>(undefined),
    chain = useRef<Promise<void>>(Promise.resolve()),
    alive = useRef(true),
    locked = useRef(false),
    anchored = useRef(false),
    pendingCompletion = useRef(false),
    pendingReject = useRef(false),
    root = useRef<React.ElementRef<typeof View>>(null);
  const receiptRoot = useRef<React.ElementRef<typeof View>>(null);
  const commentHeight = useRef(new Animated.Value(140)).current;
  const anchorProgress = useRef(new Animated.Value(seed ? 0 : 1)).current;
  const receiptProgress = useRef(new Animated.Value(0)).current;
  const [receiptHeight, setReceiptHeight] = useState(76);
  const [evidenceLocked, setEvidenceLocked] = useState(!seed);
  const trace = useRef<CaptureTrace | undefined>(undefined);
  const traceClaimed = useRef(false);
  useLayoutEffect(() => {
    if (!error || !prepared || !settled.tag || !pendingReject.current) return;
    pendingReject.current = false;
    const frame = requestAnimationFrame(() => {
      const tag = findNodeHandle(root.current);
      if (alive.current && tag)
        VaultorHaptics.reject(
          tag,
          preferences.haptics !== 'off',
          trace.current,
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [error, prepared, settled.tag, preferences.haptics]);
  useLayoutEffect(() => {
    if (!seed || !item?.id || settled.id !== item.id || !settled.tag) return;
    if (anchored.current) {
      anchorProgress.setValue(1);
      setEvidenceLocked(true);
      return;
    }
    anchored.current = true;
    recordTrace(trace.current, 'anchor_started', { reduced });
    const animation = Animated.timing(anchorProgress, {
      toValue: 1,
      duration: motionDuration('anchor', preferences.motion, reduced),
      easing: settleEasing,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      recordTrace(
        trace.current,
        finished ? 'anchor_finished' : 'anchor_cancelled',
        {
          finished,
          alive: alive.current,
        },
      );
      if (!finished || !alive.current || current.current?.state !== 'draft')
        return;
      setEvidenceLocked(true);
      VaultorHaptics.selectionSnap(
        settled.tag,
        preferences.haptics !== 'off',
        trace.current,
      );
    });
    return () => {
      animation.stop();
      anchorProgress.setValue(1);
    };
  }, [
    seed,
    item?.id,
    settled,
    preferences.haptics,
    preferences.motion,
    reduced,
    anchorProgress,
  ]);
  useLayoutEffect(() => {
    if (item?.state !== 'queued' || !pendingCompletion.current) return;
    pendingCompletion.current = false;
    const duration = motionDuration('structure', preferences.motion, reduced);
    let geometryDone = false,
      delivered = false;
    let feedbackFrame: number | undefined;
    const complete = () => {
      recordTrace(trace.current, 'completion_check', {
        geometryDone,
        keyboardVisible: Keyboard.isVisible(),
        alive: alive.current,
      });
      if (!geometryDone || delivered || Keyboard.isVisible() || !alive.current)
        return;
      delivered = true;
      feedbackFrame = requestAnimationFrame(() => {
        const tag = findNodeHandle(receiptRoot.current);
        recordTrace(trace.current, 'completion_check', {
          geometryDone,
          keyboardVisible: Keyboard.isVisible(),
          alive: alive.current,
          viewPresent: !!tag,
        });
        if (alive.current && tag)
          VaultorHaptics.playAuthoredPattern(
            'REVIEW_CAPTURED',
            tag,
            preferences.haptics !== 'off',
            trace.current,
          );
      });
    };
    const keyboard = Keyboard.addListener('keyboardDidHide', () => {
      recordTrace(trace.current, 'keyboard_hidden', {
        keyboardVisible: Keyboard.isVisible(),
      });
      complete();
    });
    recordTrace(trace.current, 'receipt_started', {
      keyboardVisible: Keyboard.isVisible(),
      reduced,
    });
    const contraction = Animated.timing(commentHeight, {
      toValue: 72,
      duration,
      easing: settleEasing,
      useNativeDriver: false,
    });
    const receipt = Animated.timing(receiptProgress, {
      toValue: 1,
      duration,
      easing: settleEasing,
      useNativeDriver: false,
    });
    contraction.start();
    // The receipt owns completion. Expanding the same comment cannot cancel it.
    receipt.start(({ finished }) => {
      recordTrace(
        trace.current,
        finished ? 'receipt_finished' : 'receipt_cancelled',
        {
          finished,
          keyboardVisible: Keyboard.isVisible(),
        },
      );
      if (finished) {
        geometryDone = true;
        complete();
      }
    });
    return () => {
      contraction.stop();
      receipt.stop();
      keyboard.remove();
      if (feedbackFrame !== undefined) cancelAnimationFrame(feedbackFrame);
      commentHeight.setValue(72);
      receiptProgress.setValue(1);
    };
  }, [
    item?.state,
    commentHeight,
    receiptProgress,
    preferences.motion,
    preferences.haptics,
    reduced,
  ]);
  const accept = (value: CaptureItem) => {
    current.current = value;
    if (alive.current) setItem(value);
  };
  useEffect(() => {
    alive.current = true;
    if (seed && !traceClaimed.current) {
      traceClaimed.current = true;
      trace.current = claimCaptureTrace();
    }
    initial.current ??= seed ? call('begin', seed) : call('list');
    const request = initial.current.then(value => {
      if (alive.current) {
        if (seed) accept(value);
        else if (initialId) {
          const existing = (value as CaptureItem[]).find(
            v => v.id === initialId,
          );
          if (!existing)
            throw Error(
              'This local record is no longer available. Return to Review and retry.',
            );
          accept(existing);
          setComment(existing.body.comment);
          receiptProgress.setValue(existing.state === 'queued' ? 1 : 0);
        } else setItems(value);
      }
      if (seed) recordTrace(trace.current, 'draft_ready');
    });
    void request
      .catch((e: Error) => {
        if (seed) recordTrace(trace.current, 'draft_failed');
        if (alive.current) {
          pendingReject.current = !!seed;
          setError(e.message);
        }
      })
      .finally(() => {
        if (alive.current) {
          setBusy(false);
          setPrepared(true);
        }
      });
    return () => {
      recordTrace(trace.current, 'composer_closed', {
        keyboardVisible: Keyboard.isVisible(),
      });
      alive.current = false;
    };
  }, [seed, initialId, receiptProgress]);
  useEffect(() => {
    if (!item?.id || item.state !== 'queued') return;
    let live = true;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      void call('get', { id: item.id })
        .then((updated: CaptureItem) => {
          if (live) {
            current.current = updated;
            setItem(updated);
          }
        })
        .catch(() => {});
    };
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    const event = new NativeEventEmitter(
      NativeModules.VaultorNative,
    ).addListener('VaultorReviewsChanged', () => {
      if (eventTimer) clearTimeout(eventTimer);
      eventTimer = setTimeout(refresh, 250);
    });
    const timer = setInterval(refresh, 2000);
    return () => {
      live = false;
      event.remove();
      if (eventTimer) clearTimeout(eventTimer);
      clearInterval(timer);
    };
  }, [item?.id, item?.state]);
  const protect = (value: string) => {
    if (locked.current || current.current?.state !== 'draft') return;
    setComment(value);
    setProtecting(true);
    setError('');
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        const actual = current.current!;
        const next = await call('put', {
          id: actual.id,
          version: actual.version,
          comment: value,
        });
        accept(next);
      });
    const pending = chain.current;
    void pending
      .then(() => {
        if (alive.current && chain.current === pending) setProtecting(false);
      })
      .catch((e: Error) => {
        if (alive.current) {
          setError(e.message);
          setProtecting(false);
        }
      });
  };
  const dismiss = () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    void chain.current.then(close).catch((e: Error) => {
      setError(
        e.message + ' Keep this composer open and retry protecting the draft.',
      );
      locked.current = false;
      setBusy(false);
      Alert.alert(
        'Latest changes are not protected',
        'The last protected draft stays on this phone. Newer text is not confirmed saved.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Keep protected draft and close', onPress: close },
        ],
      );
    });
  };
  const queue = () => {
    if (locked.current || !current.current || !comment.trim()) return;
    recordTrace(trace.current, 'save_accepted', {
      keyboardVisible: Keyboard.isVisible(),
    });
    locked.current = true;
    setBusy(true);
    setError('');
    void chain.current
      .then(async () => {
        const actual = current.current!;
        const next = await call('queue', {
          id: actual.id,
          version: actual.version,
        });
        recordTrace(trace.current, 'durable_save', {
          keyboardVisible: Keyboard.isVisible(),
        });
        pendingCompletion.current = true;
        accept(next);
        if (!alive.current) return;
        Keyboard.dismiss();
      })
      .catch((e: Error) => {
        recordTrace(trace.current, 'save_failed');
        if (alive.current) {
          pendingReject.current = true;
          setError(e.message);
        }
      })
      .finally(() => {
        locked.current = false;
        if (alive.current) setBusy(false);
      });
  };
  const discard = () =>
    Alert.alert(
      'Discard protected draft?',
      'Only this local draft will be removed. The original resource remains unchanged.',
      [
        { text: 'Keep draft', style: 'cancel' },
        {
          text: 'Discard draft',
          style: 'destructive',
          onPress: () => {
            if (locked.current) return;
            locked.current = true;
            setBusy(true);
            void chain.current
              .catch(() => {})
              .then(async () => {
                const actual = current.current!;
                await call('discard', {
                  id: actual.id,
                  version: actual.version,
                });
                close();
              })
              .catch((e: Error) => {
                setError(e.message);
                setBusy(false);
                locked.current = false;
              });
          },
        },
      ],
    );
  return (
    <ContextSheet
      ready={prepared}
      motion="navigation"
      title={seed || item ? 'Review capture' : 'Captures on this phone'}
      close={dismiss}
      onSettled={tag => {
        recordTrace(trace.current, 'sheet_settled', { viewPresent: !!tag });
        setSettled({ id: item?.id, tag });
      }}
    >
      {!prepared ? (
        <Text style={s.muted}>Protecting capture...</Text>
      ) : (
        <ScrollView
          style={
            busy || item || items.length
              ? { height: Math.min(600, height * 0.65), flexShrink: 1 }
              : undefined
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.body}
        >
          <View ref={root} collapsable={false}>
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
            {busy && !item ? (
              <Text style={s.muted}>Protecting capture…</Text>
            ) : null}
            {item ? (
              <>
                <Animated.View
                  style={{
                    transform: [
                      {
                        translateY: anchorProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [24, 0],
                        }),
                      },
                    ],
                    marginBottom: 24,
                  }}
                >
                  <Text accessibilityLiveRegion="polite" style={s.muted}>
                    {evidenceLocked || item.state === 'queued'
                      ? 'Evidence locked to this source'
                      : 'Anchoring source evidence...'}
                  </Text>
                  <Text accessibilityRole="header" style={s.title}>
                    {item.source.targetTitle}
                  </Text>
                  <Text style={s.muted}>
                    {item.source.workspaceName} · {item.source.address}
                  </Text>
                  <Text selectable style={s.muted}>
                    {locatorLabel(item.body.locator)} · saved revision{' '}
                    {item.body.baseRevision || 'unavailable'}
                  </Text>
                  {item.body.quote ? (
                    <Text
                      selectable
                      numberOfLines={details ? undefined : 4}
                      style={s.evidence}
                    >
                      {item.body.quote}
                    </Text>
                  ) : (
                    <Text style={s.muted}>No passage selected.</Text>
                  )}
                  <Action
                    label={
                      details
                        ? 'Hide evidence details'
                        : 'Show evidence and source details'
                    }
                    onPress={() => setDetails(v => !v)}
                  />
                  {details &&
                  item.body.context &&
                  item.body.context !== item.body.quote ? (
                    <Text selectable style={s.muted}>
                      Context: {item.body.context}
                    </Text>
                  ) : null}
                </Animated.View>
                <Animated.View style={{ height: commentHeight }}>
                  <TextInput
                    accessibilityLabel="Review comment"
                    style={s.input}
                    placeholder="What needs review?"
                    placeholderTextColor={palette.muted}
                    multiline
                    disableFullscreenUI
                    maxLength={5000}
                    value={comment}
                    editable={!busy && item.state === 'draft'}
                    onChangeText={protect}
                  />
                </Animated.View>
                {item.state === 'queued' ? (
                  <Animated.View
                    ref={receiptRoot}
                    collapsable={false}
                    style={{
                      height: receiptProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, receiptHeight],
                      }),
                      overflow: 'hidden',
                      borderLeftWidth: 4,
                      borderColor: palette.accent,
                      paddingHorizontal: 10,
                    }}
                  >
                    <View
                      onLayout={event =>
                        setReceiptHeight(event.nativeEvent.layout.height + 8)
                      }
                      style={{
                        position: 'absolute',
                        left: 10,
                        right: 10,
                        top: 0,
                      }}
                    >
                      <Text accessibilityRole="header" style={s.title}>
                        Saved on this phone
                      </Text>
                      <Text accessibilityLiveRegion="polite" style={s.muted}>
                        {item ? deliveryLabel(item) : 'Queued on this phone'}
                      </Text>
                      <Text style={s.muted}>
                        {item
                          ? deliveryExplanation(item)
                          : 'Protected locally.'}
                      </Text>
                    </View>
                  </Animated.View>
                ) : (
                  <Text accessibilityLiveRegion="polite" style={s.muted}>
                    {busy || protecting
                      ? 'Protecting draft…'
                      : error
                      ? 'Last protected draft retained; current changes need retry.'
                      : 'Protected draft on this phone · ' +
                        comment.length +
                        '/5000'}
                  </Text>
                )}
                {item.state === 'draft' ? (
                  <View style={s.actions}>
                    <Action
                      label="Save on this phone"
                      disabled={busy || !comment.trim()}
                      onPress={queue}
                    />
                    <Action
                      label="Discard draft"
                      disabled={busy}
                      onPress={discard}
                    />
                    {error ? (
                      <Action
                        label="Retry protecting draft"
                        disabled={busy}
                        onPress={() => protect(comment)}
                      />
                    ) : null}
                  </View>
                ) : (
                  <Action
                    label="Expand saved comment"
                    onPress={() =>
                      Animated.timing(commentHeight, {
                        toValue: 240,
                        duration: motionDuration(
                          'structure',
                          preferences.motion,
                          reduced,
                        ),
                        easing: settleEasing,
                        useNativeDriver: false,
                      }).start()
                    }
                  />
                )}
                {details ? (
                  <Text style={s.muted}>
                    {item.source.targetType} · {item.body.resourceId}. Source
                    identity: {item.source.workspaceId} /{' '}
                    {item.source.generation}. Original content is unchanged.
                  </Text>
                ) : null}
              </>
            ) : !busy ? (
              items.length ? (
                items.map(v => (
                  <View key={v.id} style={s.row}>
                    <Action
                      label={
                        v.source.targetTitle +
                        ' · ' +
                        (v.state === 'draft'
                          ? 'Protected draft'
                          : 'On this phone')
                      }
                      onPress={() => {
                        accept(v);
                        setComment(v.body.comment);
                        commentHeight.setValue(140);
                        receiptProgress.setValue(v.state === 'queued' ? 1 : 0);
                      }}
                    />
                    <Text numberOfLines={2} style={s.muted}>
                      {v.body.comment || 'Empty protected draft'} ·{' '}
                      {v.createdAt}
                    </Text>
                    <Text style={s.muted}>
                      {v.source.workspaceName} · {v.source.address} ·{' '}
                      {locatorLabel(v.body.locator)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={s.muted}>
                  No captures yet. Flag a passage or add a review item from a
                  resource.
                </Text>
              )
            ) : null}
          </View>
        </ScrollView>
      )}
    </ContextSheet>
  );
}
const styles = StyleSheet.create({
  body: { paddingBottom: 12, gap: 8 },
  title: { color: '#e8e8e8', fontSize: 18, fontWeight: '600' },
  muted: { color: '#b3b3b3', fontSize: 13, marginVertical: 4 },
  error: { color: '#ffb4b4', padding: 8 },
  evidence: {
    color: '#e8e8e8',
    borderLeftWidth: 2,
    borderColor: '#8db7ff',
    padding: 10,
  },
  input: {
    flex: 1,
    color: '#e8e8e8',
    fontSize: 16,
    textAlignVertical: 'top',
    padding: 10,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { paddingVertical: 6, borderBottomWidth: 1, borderColor: '#333' },
});
