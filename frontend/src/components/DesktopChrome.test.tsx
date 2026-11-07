// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {DesktopConnectionButton} from './DesktopChrome';
import {WorkspaceSelectionContext} from '../lib/workspaceSelection';
import {DesktopConnectionContext} from '../lib/desktopConnectionContext';
afterEach(cleanup);
it('distinguishes workspace selection from connection controls',()=>{render(<WorkspaceSelectionContext.Provider value={{name:'Research',server:'Local',open:vi.fn()}}><DesktopConnectionContext.Provider value={{name:'Server',online:true,open:vi.fn()}}><DesktopConnectionButton/></DesktopConnectionContext.Provider></WorkspaceSelectionContext.Provider>);expect(screen.getByText('Research').parentElement?.querySelector('.lucide-layers')).toBeTruthy();expect(screen.getByLabelText('Connections and sharing').querySelector('.lucide-plug')).toBeTruthy();});
