import test from 'node:test';
import assert from 'node:assert/strict';
import {LinkedManager} from '../src/linked/manager.mjs';
test('same-context native requests await registry initialization instead of opening a second journal owner',async()=>{const owner={epoch:'same',kind:'owned-local',token:'token',workspace:'w',generation:'g',mainFrame:true};const manager=new LinkedManager({owner:async()=>owner});manager.context=owner;let release;manager.opening=new Promise(resolve=>{release=resolve;});let entered=false;const admitted=manager.ensure({token:'token',workspace:'w',generation:'g'}).then(()=>{entered=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,false);release();await admitted;assert.equal(entered,true);});
