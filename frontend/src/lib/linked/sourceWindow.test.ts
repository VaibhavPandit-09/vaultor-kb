import {expect,it} from 'vitest';
import {sourceWindow,SOURCE_PAGE_STEP} from './sourceWindow';
it('overlapping readonly byte windows retain Unicode crossing the boundary without replacement characters',()=>{const text='a'.repeat(65535)+'😀Ω end',bytes=new TextEncoder().encode(text),first=sourceWindow(bytes.subarray(0,65536),0),offset=SOURCE_PAGE_STEP-4,second=sourceWindow(bytes.subarray(offset,offset+65536),offset);expect(first).not.toContain('�');expect(second).not.toContain('�');expect(second).toContain('😀Ω end');expect(bytes).toEqual(new TextEncoder().encode(text));});
