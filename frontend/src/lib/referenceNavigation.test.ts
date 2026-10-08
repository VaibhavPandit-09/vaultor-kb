// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {Editor,Node} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {SharedNoteDocuments} from './sharedNoteDocuments';
import {focusReference} from './referenceNavigation';
const editors:Editor[]=[];
afterEach(()=>editors.splice(0).forEach(editor=>editor.destroy()));
it('selects the exact validated saved occurrence without changing the document and rejects moved targets',()=>{
 const link=Node.create({name:'resourceLink',group:'inline',inline:true,atom:true,addAttributes:()=>({resourceId:{default:''}}),renderHTML:()=>['span']});
 const image=Node.create({name:'image',group:'block',atom:true,addAttributes:()=>({resourceId:{default:''}}),renderHTML:()=>['img']});
 const editor=new Editor({extensions:[StarterKit,link,image],content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Prefix '},{type:'resourceLink',attrs:{resourceId:'target'}}]},{type:'image',attrs:{resourceId:'image'}}]}});editors.push(editor);new SharedNoteDocuments().attach('source',editor);const json=editor.getJSON();
 expect(focusReference(editor,'/0/1','target')).toBe(true);expect(editor.state.selection.from).toBe(8);expect(focusReference(editor,'/1','image')).toBe(true);expect(editor.state.selection.from).toBe(10);expect(editor.getJSON()).toEqual(json);
 expect(focusReference(editor,'/0/0','target')).toBe(false);expect(focusReference(editor,'/0/1','different')).toBe(false);expect(focusReference(editor,'/99','target')).toBe(false);expect(focusReference(editor,'/evil','target')).toBe(false);
});
