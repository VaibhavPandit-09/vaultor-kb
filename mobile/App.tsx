import React, { useEffect } from 'react';
import {
  KeyboardAvoidingView,
  NativeModules,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ReadingProvider, useAppearance } from './src/ui';
import WorkspaceScreen from './src/WorkspaceScreen';
function Shell() {
  const light = useAppearance() === 'light';
  useEffect(() => {
    NativeModules.VaultorPresentation?.systemBars(light, 0);
  }, [light]);
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
