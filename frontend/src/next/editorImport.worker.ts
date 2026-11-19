import {tableContent,markdownContent} from './editorFileContent';

self.onmessage = ({data}: MessageEvent<{format: 'table' | 'markdown'; source: string}>) => {
  try { self.postMessage({content: data.format === 'table' ? tableContent(data.source) : markdownContent(data.source)}); }
  catch (error) { self.postMessage({error: error instanceof Error ? error.message : String(error)}); }
};
