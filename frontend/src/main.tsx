import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux';
import './index.css'
import App from './App'
import { store } from './state/store';
import ErrorBoundary from './components/ErrorBoundary';
import { installDiagnostics } from './lib/diagnostics';

installDiagnostics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <ErrorBoundary region="application"><App /></ErrorBoundary>
    </Provider>
  </StrictMode>,
)
