// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { ResourceSelectionContext, useResourceSelection } from '../lib/resourceSelection';
import ResourceBatchActions from './ResourceBatchActions';
import ResourceActions from './ResourceActions';
vi.mock('../lib/resourceBatchCommands',()=>({commandScope:()=>({epoch:0}),requireCommandScope:vi.fn(),changeMembership:vi.fn(),pinResources:vi.fn()}));
vi.mock('../lib/resourceActions',()=>({executeResourceCommand:vi.fn(),resourceCommandEnabled:()=>false,supportedResourceActions:()=>({open:true}),resourceCommands:{'open-another':{title:'Open in another pane'}},requestResourceAction:vi.fn()}));
vi.mock('./ResourceCollections',()=>({CollectionPicker:()=>null}));
vi.mock('./OrganizationManager',()=>({default:()=>null}));
import { changeMembership, pinResources } from '../lib/resourceBatchCommands';
import { requestResourceAction } from '../lib/resourceActions';
import type { Resource } from '../types';
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
const items=['a','b'].map(id=>({id,title:id,type:'note',tags:[],createdAt:'',updatedAt:''})) as Resource[];
afterEach(()=>{cleanup();vi.clearAllMocks();});
function HarnessContent(){const selection=useResourceSelection(items,'page');return <ResourceSelectionContext.Provider value={{...selection,collection:{id:'col',name:'Col',count:2}}}><section><button onClick={selection.selectAll}>Select both</button><output>{selection.ids.join(',')}</output>{selection.ids.length>0&&<ResourceBatchActions resources={selection.resources} collection={{id:'col',name:'Col',count:2}}/>}<div className="library-row"><button>Row a</button><ResourceActions resource={items[0]}/></div></section></ResourceSelectionContext.Provider>;}
function Harness(){return <EscapeManagerProvider><HarnessContent/></EscapeManagerProvider>;}
it('pin partial failures retain only failed selections and show actionable feedback',async()=>{
 vi.mocked(pinResources).mockResolvedValueOnce({completed:['a'],failed:[{id:'b',title:'b',detail:'Unavailable'}]});
 render(<Harness/>);fireEvent.click(screen.getByText('Select both'));fireEvent.click(screen.getByRole('button',{name:'Organize selection'}));fireEvent.click(await screen.findByRole('button',{name:'Pin selection'}));
 await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('b'));expect(screen.getAllByRole('alert').some(node=>node.textContent?.includes('1 failed'))).toBe(true);
});
it('atomic membership refusal retains the selection without silently removing surviving memberships',async()=>{
 vi.mocked(changeMembership).mockRejectedValueOnce(new Error('Resource no longer available'));
 render(<Harness/>);fireEvent.click(screen.getByText('Select both'));fireEvent.click(screen.getByRole('button',{name:'Organize selection'}));fireEvent.click(await screen.findByRole('button',{name:'Remove from this collection'}));
 await screen.findAllByText('Resource no longer available');expect(screen.getByRole('status').textContent).toBe('a,b');expect(changeMembership).toHaveBeenCalledWith(['a','b'],'collection','col','remove',{epoch:0});
});
it('right-click on a selected resource exposes the same protected multi-target Trash coordinator',async()=>{
 render(<Harness/>);fireEvent.click(screen.getByText('Select both'));fireEvent.contextMenu(screen.getByText('Row a'));fireEvent.click(await screen.findByRole('menuitem',{name:'Move selection to Trash…'}));await waitFor(()=>expect(requestResourceAction).toHaveBeenCalledWith('trash',items));expect(screen.queryByRole('menuitem',{name:'Rename…'})).toBeNull();
});
