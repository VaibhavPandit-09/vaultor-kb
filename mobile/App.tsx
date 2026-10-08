import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import WorkspaceScreen from './src/WorkspaceScreen';
export default function App() {
  return (
    <SafeAreaProvider>
      <WorkspaceScreen />
    </SafeAreaProvider>
  );
}
