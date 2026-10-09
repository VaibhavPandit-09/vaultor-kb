import React from 'react';
import { KeyboardAvoidingView, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WorkspaceScreen from './src/WorkspaceScreen';
export default function App() {
  const light = useColorScheme() === 'light';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={light ? 'dark-content' : 'light-content'} />
      <KeyboardAvoidingView behavior="height" style={styles.workspace}>
        <WorkspaceScreen />
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({ workspace: { flex: 1 } });
