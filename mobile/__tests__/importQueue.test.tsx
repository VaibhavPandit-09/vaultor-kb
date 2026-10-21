import React from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {NativeModules,AppState} from 'react-native';
import {useImportQueue} from '../src/useImportQueue';
let listener:()=>void,appListener:(state:string)=>void;
jest.mock('react-native',()=>({
 NativeModules:{VaultorNative:{collectedImports:jest.fn()}},
 NativeEventEmitter:class {addListener(_name:string,callback:()=>void){listener=callback;return {remove:jest.fn()};}},
 AppState:{currentState:'active',addEventListener:(_name:string,callback:(state:string)=>void)=>{appListener=callback;return {remove:jest.fn()};}},
}));
let observed:ReturnType<typeof useImportQueue>,tree:ReactTestRenderer;
const native=NativeModules.VaultorNative.collectedImports as jest.Mock;
function Probe(){observed=useImportQueue();return null;}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;native.mockReset();AppState.currentState='active';});
afterEach(async()=>{await act(async()=>tree?.unmount());});
test('cold local acquisition opens Pending once; delivery state updates do not reopen or activate a source',async()=>{
 let rows=[{id:'local-input',filename:'shared.txt',state:'collected',bytes:10,createdAt:Date.now()}];native.mockImplementation((action:string)=>Promise.resolve(action==='list'?JSON.stringify(rows):'{}'));
 await act(async()=>{tree=create(<Probe/>);});expect(observed.incoming).toBe(1);expect(observed.items[0]).not.toHaveProperty('source');
 rows=[{...rows[0],state:'queued'}];await act(async()=>listener());expect(observed.incoming).toBe(1);rows=[{...rows[0],state:'acknowledged'}];await act(async()=>listener());expect(observed.incoming).toBe(1);expect(native.mock.calls.every(c=>['list','sync'].includes(c[0]))).toBe(true);
});
test('queue confirmation during an in-flight batch retains a foreground followup; background never dispatches',async()=>{
 let finish!:(value:string)=>void;let calls=0;native.mockImplementation((action:string)=>action==='list'?Promise.resolve('[]'):++calls===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve('{}'));
 await act(async()=>{tree=create(<Probe/>);});expect(calls).toBe(1);await act(async()=>observed.sync());await act(async()=>finish('{}'));expect(calls).toBe(2);
 AppState.currentState='background';await act(async()=>observed.sync(true));expect(calls).toBe(2);AppState.currentState='active';await act(async()=>appListener('active'));expect(calls).toBe(3);
});
