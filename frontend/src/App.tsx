import WorkspaceRoot from './components/WorkspaceRoot';
import Dashboard from './pages/Dashboard';
import { SettingsProvider } from './lib/settings';
import ConnectionGate from './components/ConnectionGate';
export default function App() {
  return <WorkspaceRoot><ConnectionGate><SettingsProvider><Dashboard /></SettingsProvider></ConnectionGate></WorkspaceRoot>;
}
