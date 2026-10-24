// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {Editor,Extension} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {createLowlight,all} from 'lowlight';
import {boundedCodeHighlighting} from './boundedCodeHighlighting';
it('source highlighting caps aggregate work and weakly caches unchanged code nodes',()=>{
  const lowlight=createLowlight(all), highlight=vi.spyOn(lowlight,'highlight');
  const editor=new Editor({extensions:[StarterKit,Extension.create({name:'boundedHighlightTest',addProseMirrorPlugins:()=>[boundedCodeHighlighting(lowlight,25)]})],content:{type:'doc',content:Array.from({length:4},()=>({type:'codeBlock',attrs:{language:'js'},content:[{type:'text',text:'const a=1;'}]}))}});
  expect(highlight).toHaveBeenCalledTimes(2);
  const end=editor.state.doc.content.size-2;editor.view.dispatch(editor.state.tr.insertText('last',end));
  expect(highlight).toHaveBeenCalledTimes(2);expect(editor.getText()).toContain('last');
  editor.view.dispatch(editor.state.tr.insertText('x',2));expect(highlight).toHaveBeenCalledTimes(3);editor.destroy();
});
