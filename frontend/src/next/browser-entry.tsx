import {createRoot} from 'react-dom/client';
import BrowserWorkspace from './browser';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';

createRoot(document.getElementById('root')!).render(
  <EscapeManagerProvider><BrowserWorkspace /></EscapeManagerProvider>,
);
