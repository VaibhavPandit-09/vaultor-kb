// Deterministic source workloads for the existing Electron performance runner.
// No app limits, parser options or measurement definitions live here.
const prose = 'A knowledge base explains decisions, records tradeoffs, and preserves context for the next reader. ';
const paragraph = `${prose.repeat(24)}Use **clear emphasis**, _brief explanations_, \`inline names\`, and [local references](./unchanged.md).\r\n\r\n`;
const table = index => {
  const columns=3+index%5,rows=3+index%11;
  const line=cells=>'| '+cells.join(' | ')+' |\r\n';
  return line(Array.from({length:columns},(_,i)=>'Field '+i))+line(Array.from({length:columns},(_,i)=>i%2?':---':'---:'))+
    Array.from({length:rows},(_,row)=>line(Array.from({length:columns},(_,col)=>`Record ${row}, field ${col}: ${prose.repeat(2)}`))).join('')+'\r\n';
};
const languages=['typescript','python','java','sql','json','bash'];
const code=index=>{
  const language=languages[index%languages.length];
  // A mixture of short and long fences, all below the existing 16K code bound.
  const lines=index%4===0?90:18;
  const row=i=>({
    typescript:`const revision${i} = { id: ${i}, status: "saved", reason: "Preserve the prior source revision" };`,
    python:`revision_${i} = {"id": ${i}, "status": "saved", "reason": "Preserve the prior source revision"}`,
    java:`records.add(new Revision(${i}, "saved", "Preserve the prior source revision"));`,
    sql:`INSERT INTO revisions (id, status, reason) VALUES (${i}, 'saved', 'Preserve the prior source revision');`,
    json:`  {"id": ${i}, "status": "saved", "reason": "Preserve the prior source revision"}${i<lines-1?',':''}`,
    bash:`printf '%s\\n' "Revision ${i}: saved; preserve the prior source revision"`,
  })[language];
  const body=Array.from({length:lines},(_,i)=>row(i)).join('\r\n');
  return '```'+language+'\r\n'+(language==='json'?'[\r\n'+body+'\r\n]':body)+'\r\n```\r\n\r\n';
};
const dense=index=>`### Decision ${index}\r\n\r\nA **small** _linked_ [decision](./unchanged.md) with \`context\`: ${prose}\r\n\r\n- First decision\r\n  - Nested rationale with **emphasis**\r\n    - Further detail with a [reference](./unchanged.md)\r\n      - Supported depth and ${prose}\r\n- Second decision\r\n\r\n`;
const target=(label,kind='paragraph')=>({label,kind,needle:`${label} marker paragraph.`,prefix:label});
const special=(label,kind)=>({label,kind,needle:`${label} structure marker.`,prefix:label});
const wrapped=t=>{
  const index=['First','Central','Last'].indexOf(t.label);
  if(t.kind==='tableCell'){
    const n=index*7,columns=3+n%5,rows=3+n%11;
    return table(n).replace(`Record ${Math.floor(rows/2)}, field ${Math.floor(columns/2)}:`,t.needle);
  }
  if(t.kind==='codeBlock'){
    // Edit inside long TypeScript/JSON/Java fences, not separate tiny sentinels.
    const lines=code(index*4).split('\r\n'),middle=Math.floor(lines.length/2);
    lines[middle]=lines[middle].replace('Preserve the prior source revision',t.needle);
    return lines.join('\r\n');
  }
  return `- Decision branch\r\n  - Context\r\n    - Rationale\r\n      - ${t.needle}\r\n\r\n`;
};

export const structureMatrix=[
  {id:'prose',type:'prose',kib:1024,admission:'editable'},
  {id:'tables',type:'tables',kib:256,admission:'editable'},
  {id:'code',type:'code',kib:512,admission:'editable'},
  {id:'dense',type:'dense',kib:256,admission:'editable'},
  {id:'mixed',type:'mixed',kib:1024,admission:'editable'},
  {id:'complexity-refusal',type:'dense',kib:512,admission:'expected-refusal',reason:'DOCUMENT_SHAPE_LIMIT'},
  {id:'size-refusal',type:'prose',kib:1025,admission:'expected-refusal',reason:'LARGE_DOCUMENT'},
];

export function structureFixture(spec){
  const bytes=spec.kib*1024-(spec.kib===1024?4096:0);
  const targets=['Beginning','Middle','End'].map(label=>target(label));
  const kinds=spec.type==='tables'?['tableCell','tableCell','tableCell']:spec.type==='code'?['codeBlock','codeBlock','codeBlock']:spec.type==='dense'?['listItem','listItem','listItem']:spec.type==='mixed'?['tableCell','codeBlock','listItem']:[];
  const extra=kinds.map((kind,i)=>special(['First','Central','Last'][i],kind));targets.push(...extra);
  const head='\ufeff---\r\ntitle: Structural qualification\r\n---\r\n\r\n';
  const tail='[label][ref]\r\n\r\n[ref]: ./unchanged.md "retain"\r\n\r\n<!-- untouched structural sentinel -->\r\n';
  const markers=[0,1,2].map(i=>targets[i].needle+'\r\n\r\n'+(extra[i]?wrapped(extra[i]):''));
  const remaining=bytes-Buffer.byteLength(head+tail+markers.join(''));
  const chunks=(budget,part)=>{
    let text='',used=0,i=part*1000;
    while(true){
      const candidate=spec.id==='complexity-refusal'?'**b** _i_ [link](./unchanged.md) `c`.\n\n':
        spec.type==='tables'?table(i):spec.type==='code'?code(i):spec.type==='dense'?dense(i):
        spec.type==='mixed'?[paragraph,table(i),code(i),dense(i)][i%4]:`## Section ${i}\r\n\r\n${paragraph}${paragraph}`;
      const size=Buffer.byteLength(candidate);if(used+size>budget)break;
      text+=candidate;used+=size;i++;
    }
    // Paragraph padding is bounded per block; it never hides a giant text block
    // or changes whether a structural chunk is admitted.
    let left=budget-used;
    while(left>=4){const n=Math.min(left,4096);text+='p'.repeat(n-2)+'\n\n';left-=n;}
    return text+' '.repeat(left);
  };
  const a=Math.floor(remaining/2),text=head+markers[0]+chunks(a,0)+markers[1]+chunks(remaining-a,1)+markers[2]+tail;
  if(Buffer.byteLength(text)!==bytes)throw Error('Structural fixture byte budget');
  const lines=text.split(/\r?\n/);
  return {...spec,caseId:`${spec.id}-${spec.kib}`,file:`structure-${spec.id}-${spec.kib}.md`,text,targets,complexity:{lines:lines.length,headings:lines.filter(s=>/^#{1,6} /.test(s)).length,fences:lines.filter(s=>/^```/.test(s)).length/2,tableRows:lines.filter(s=>s.startsWith('|')).length,longestLineUnits:Math.max(...lines.map(s=>s.length))}};
}

export function structuralCases({smoke=false,caseName}={}){
  const selected=caseName?structureMatrix.filter(s=>s.id===caseName):structureMatrix;
  if(!selected.length)throw Error('Unknown structural case');
  return selected.map(s=>structureFixture(smoke&&s.admission==='editable'?{...s,kib:64}:s));
}
