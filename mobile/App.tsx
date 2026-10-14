import React from 'react';
import { KeyboardAvoidingView, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReadingProvider, useAppearance } from './src/ui';
import WorkspaceScreen from './src/WorkspaceScreen';
function Shell() {
  const light = useAppearance() === 'light';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={light ? 'dark-content' : 'light-content'} />
      <KeyboardAvoidingView behavior="height" style={styles.workspace}>
        <WorkspaceScreen />
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}
export default function App() {
  return (
    <ReadingProvider>
      <Shell />
    </ReadingProvider>
  );
}
const styles = StyleSheet.create({ workspace: { flex: 1 } });
