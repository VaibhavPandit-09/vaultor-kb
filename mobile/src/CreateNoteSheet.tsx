import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Action } from './BrowseScreen';
import { useThemeStyles } from './ui';
import type { Creation, MobileWorkspace } from './workspace';

export default function CreateNoteSheet({
  model,
  close,
}: {
  model: MobileWorkspace;
  close(): void;
}) {
  const s = useThemeStyles(styles);
  const destination = useRef({
    scope: model.state.scope,
    collection:
      model.state.view === 'browse' ? model.state.browse.collection : undefined,
  }).current;
  const [title, setTitle] = useState(''),
    [pending, setPending] = useState<Creation | null>(null),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const submitting = useRef(false);
  useEffect(() => {
    let alive = true;
    void model
      .pendingCreation()
      .then(value => {
        if (alive) {
          setPending(value);
          if (value) setTitle(value.title);
          setReady(true);
        }
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [model]);
  const submit = async () => {
    if (submitting.current || !ready) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      if (model.state.scope !== destination.scope)
        throw Error('Workspace changed. Reopen New note.');
      Keyboard.dismiss();
      await model.createNote(title, destination.collection?.id);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creation failed. Retry.');
      const value = await model.pendingCreation().catch(() => null);
      setPending(value);
      if (value) setTitle(value.title);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      transparent
      animationType="none"
      onRequestClose={() => {
        if (!busy) close();
      }}
    >
      <View style={s.scrim}>
        <ScrollView style={s.panel} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={s.heading}>
            New note
          </Text>
          <Text style={s.secondary}>
            {pending?.collectionId
              ? 'In the original collection'
              : destination.collection
              ? `In ${destination.collection.name}`
              : 'In Library'}
          </Text>
          <TextInput
            accessibilityLabel="Note title"
            autoFocus={!pending}
            editable={!busy && !pending && ready}
            value={title}
            onChangeText={setTitle}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            placeholder="What’s on your mind?"
            placeholderTextColor="#858585"
            maxLength={500}
            style={s.input}
          />
          {pending ? (
            <Text style={s.secondary}>
              A previous creation is pending. Retry finishes that same note.
            </Text>
          ) : null}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <View style={s.actions}>
            <Action
              label={
                busy ? 'Creating…' : pending ? 'Retry creation' : 'Create note'
              }
              disabled={busy || !ready || !title.trim()}
              onPress={() => void submit()}
            />
            <Action label="Cancel" disabled={busy} onPress={close} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' },
  panel: {
    flexGrow: 0,
    maxHeight: '85%',
    backgroundColor: '#0a0a0a',
    borderColor: '#333',
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: '#e8e8e8',
    marginBottom: 8,
  },
  secondary: { color: '#b3b3b3', marginBottom: 12 },
  input: {
    minHeight: 52,
    color: '#e8e8e8',
    borderBottomWidth: 1,
    borderColor: '#333',
    marginBottom: 16,
  },
  error: { color: '#ffb4b4', marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
});
