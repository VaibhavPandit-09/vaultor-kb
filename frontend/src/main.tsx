import { installMotion } from './lib/motion';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux';
import './index.css'
import App from './App'
import { store } from './state/store';
import ErrorBoundary from './components/ErrorBoundary';
import { installDiagnostics } from './lib/diagnostics';
import DesktopRoot from './components/DesktopRoot';
import { EscapeManagerProvider } from './lib/escape/EscapeManagerProvider';

installDiagnostics();
const stopMotion = installMotion();
if (import.meta.hot) import.meta.hot.dispose(stopMotion);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <EscapeManagerProvider><ErrorBoundary region="application"><DesktopRoot><App /></DesktopRoot></ErrorBoundary></EscapeManagerProvider>
    </Provider>
  </StrictMode>,
)
