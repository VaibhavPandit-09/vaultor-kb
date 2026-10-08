// @vitest-environment jsdom
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,test,expect} from 'vitest';
import SearchCoverage from './SearchCoverage';
afterEach(cleanup);
test('coverage separates pending, unsupported, empty and failed files without HTML',()=>{
 render(<SearchCoverage coverage={{files:10,indexed:2,queued:1,indexing:1,unsupported:1,noText:1,limitExceeded:1,encrypted:1,invalid:1,failed:1,complete:false,failure:'<script>untrusted</script>'}}/>);
 expect(screen.getByRole('status').textContent).toContain('2 pending');expect(screen.getByRole('status').textContent).toContain('4 unavailable');expect(screen.getByRole('status').textContent).toContain('no OCR');expect(document.querySelector('script')).toBeNull();
});
test('old host coverage is unavailable, not silently certified complete',()=>{render(<SearchCoverage/>);expect(screen.getByRole('status').textContent).toContain('Update the connected host to 0.7.0');});
