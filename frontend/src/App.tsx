import Dashboard from './pages/Dashboard';
import { EscapeManagerProvider } from './lib/escape/EscapeManagerProvider';
import { SettingsProvider } from './lib/settings';
import ConnectionGate from './components/ConnectionGate';
export default function App() {
  return <ConnectionGate><SettingsProvider><EscapeManagerProvider><Dashboard /></EscapeManagerProvider></SettingsProvider></ConnectionGate>;
}
