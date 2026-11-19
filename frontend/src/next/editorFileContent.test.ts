// @vitest-environment jsdom
import {Editor} from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {Table,TableRow,TableCell,TableHeader} from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {expect,it} from 'vitest';
import {tableContent,markdownContent} from './editorFileContent';
import {captureImportTarget} from '../lib/importTarget';
import {delimited,tableRows} from '../components/editor/TableWorkspace';

const editor = () => new Editor({element:document.createElement('div'),extensions:[StarterKit,Table,TableRow,TableCell,TableHeader,TaskList,TaskItem]});

it('round trips quoted, multiline and Unicode values and pads incomplete rows',()=>{
  const view=editor();
  try {
    const blocks=tableContent('\uFEFFName,Description,Extra\r\n猫,"one, ""two""\r\nnext",\r\nEllie,last\r\n');
    const table=view.schema.nodeFromJSON(blocks[0]);
    table.check();
    const rows=tableRows(table);
    expect(rows).toEqual([['Name','Description','Extra'],['猫','one, "two"\r\nnext',''],['Ellie','last','']]);
    expect(tableRows(view.schema.nodeFromJSON(tableContent(delimited(rows,','))[0]))).toEqual(rows);
    expect(tableRows(view.schema.nodeFromJSON(tableContent('a\tb\n1\t2')[0]))).toEqual([['a','b'],['1','2']]);
    expect(delimited([['=1+1','ordinary']],',',true)).toBe("'=1+1,ordinary");
  } finally {view.destroy();}
});

it('refuses broken quoting and cell limit overflow',()=>{
  expect(()=>tableContent('a,b\n"unfinished,b')).toThrow(/Malformed/);
  expect(()=>tableContent(Array(501).fill('x').join(','))).toThrow(/500 columns/);
});

it('projects editable Markdown into the existing editor and refuses opaque syntax',async()=>{
  const view=editor();
  try {
    const contents=markdownContent('# Title\n\n> **bold**\n\n- [x] done\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconsole.log(1)\n```\n\n[Link](https://example.com)\n');
    expect(contents.map(node=>node.type)).toEqual(['heading','blockquote','taskList','table','codeBlock','paragraph']);
    expect(contents[1].content?.[0].content?.[0].marks).toEqual([{type:'bold'}]);
    await new Promise<void>(resolve=>view.on('create',()=>resolve()));
    const target=captureImportTarget(view,view.state.selection);
    target.insert(contents);
    expect(view.getText()).toContain('console.log(1)');
    expect(()=>markdownContent('![image](./relative.png)')).toThrow(/faithfully/);
  } finally {view.destroy();}
});
