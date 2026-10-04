import Dashboard from './pages/Dashboard';
import { SettingsProvider } from './lib/settings';
import ConnectionGate from './components/ConnectionGate';
export default function App() {
  return <ConnectionGate><SettingsProvider><Dashboard /></SettingsProvider></ConnectionGate>;
}
