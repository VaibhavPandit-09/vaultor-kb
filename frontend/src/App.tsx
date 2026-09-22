import Dashboard from './pages/Dashboard';
import { EscapeManagerProvider } from './lib/escape/EscapeManagerProvider';
import { SettingsProvider } from './lib/settings';
export default function App() {
  return <SettingsProvider><EscapeManagerProvider><Dashboard /></EscapeManagerProvider></SettingsProvider>;
}
