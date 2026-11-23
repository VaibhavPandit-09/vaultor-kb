import {useEffect,useRef,useState} from 'react';
import {AnnotationMode,getDocument,GlobalWorkerOptions,PasswordResponses,TextLayer,type PDFDocumentProxy,type PDFPageProxy,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {original} from './media';

GlobalWorkerOptions.workerSrc=workerUrl;
type Scale='width'|'page'|number;

export default function PdfPreview({id,workspace}:{id:string;workspace?:string}){
  const [pdf,setPdf]=useState<PDFDocumentProxy>(),[page,setPage]=useState(1),[scale,setScale]=useState<Scale>('width');
  const [status,setStatus]=useState('Loading PDF…'),[documentError,setDocumentError]=useState('');
  const [passwordRequest,setPasswordRequest]=useState<{submit:(password:string)=>void;incorrect:boolean}>();
  const [size,setSize]=useState({width:480,height:460});
  const viewport=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let live=true,task:ReturnType<typeof getDocument>|undefined;
    void original(id,workspace).then(async({buffer})=>{
      if(!live)return;
      if(!new TextDecoder().decode(buffer.slice(0,1024)).includes('%PDF-'))throw new Error('This file does not contain a PDF header.');
      task=getDocument({
        data:new Uint8Array(buffer),enableXfa:false,useWasm:false,useWorkerFetch:false,
        disableFontFace:true,maxImageSize:32_000_000,canvasMaxAreaInBytes:32*1024*1024,stopAtErrors:true,
      });
      task.onPassword=(submit:(password:string)=>void,reason:number)=>{
        if(live)setPasswordRequest({submit,incorrect:reason===PasswordResponses.INCORRECT_PASSWORD});
      };
      const document=await task.promise;
      if(live){setPasswordRequest(undefined);setPdf(document);}
    }).catch(error=>{
      if(live){setPasswordRequest(undefined);setDocumentError(error?.name==='PasswordException'?'Unable to unlock this PDF.':String(error));}
    });
    return()=>{live=false;void task?.destroy().catch(()=>{});};
  },[id,workspace]);
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const observer=new ResizeObserver(entries=>{
      const {width,height}=entries[0].contentRect;
      setSize(old=>Math.abs(old.width-width)<1&&Math.abs(old.height-height)<1?old:{width,height});
    });
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const host=stage.current;
    if(!host||!pdf)return;
    let live=true,render:RenderTask|undefined,textLayer:TextLayer|undefined,current:PDFPageProxy|undefined;
    const canvas=document.createElement('canvas'),text=document.createElement('div');
    text.className='textLayer next-pdf-text';
    host.replaceChildren();
    const draw=async()=>{
      current=await pdf.getPage(page);
      if(!live)return;
      const unit=current.getViewport({scale:1});
      const fitWidth=Math.max(1,size.width-24)/unit.width;
      const fitPage=Math.min(fitWidth,Math.max(1,size.height-24)/unit.height);
      const requested=scale==='width'?fitWidth:scale==='page'?fitPage:scale;
      // Bound the raster independently of the PDF's declared dimensions.
      const zoom=Math.min(requested,Math.sqrt(8_000_000/(unit.width*unit.height)),4000/unit.width,4000/unit.height);
      const pageViewport=current.getViewport({scale:zoom});
      canvas.width=Math.max(1,Math.ceil(pageViewport.width));
      canvas.height=Math.max(1,Math.ceil(pageViewport.height));
      host.style.width=canvas.width+'px';
      host.style.height=canvas.height+'px';
      host.style.setProperty('--scale-factor',String(zoom));
      host.style.setProperty('--total-scale-factor',String(zoom));
      host.append(canvas,text);
      render=current.render({canvas,viewport:pageViewport,annotationMode:AnnotationMode.DISABLE});
      await render.promise;
      if(!live)return;
      setStatus(zoom<requested?'Page rendered at the safe canvas limit':'');
      textLayer=new TextLayer({textContentSource:current.streamTextContent(),container:text,viewport:pageViewport});
      await textLayer.render();
    };
    void draw().catch(error=>{if(live)setStatus('Page unavailable. '+String(error));});
    return()=>{
      live=false;
      textLayer?.cancel();
      render?.cancel();
      canvas.remove();text.remove();
      canvas.width=0;canvas.height=0;
      current?.cleanup();
    };
  },[pdf,page,scale,size]);

  const navigate=(next:number)=>{if(pdf&&next>=1&&next<=pdf.numPages)setPage(next);};
  const adjust=(delta:number)=>setScale(value=>Math.min(4,Math.max(.25,(typeof value==='number'?value:1)+delta)));
  return <section className="next-pdf" aria-label="PDF preview">
    <div className="image-preview-tools" role="toolbar" aria-label="PDF controls">
      <button disabled={!pdf||page===1} onClick={()=>navigate(page-1)}>Previous page</button>
      <span aria-live="polite">Page {page} of {pdf?.numPages??'…'}</span>
      <button disabled={!pdf||page>=pdf.numPages} onClick={()=>navigate(page+1)}>Next page</button>
      <button aria-pressed={scale==='width'} onClick={()=>setScale('width')}>Fit width</button>
      <button aria-pressed={scale==='page'} onClick={()=>setScale('page')}>Fit page</button>
      <button aria-pressed={scale===1} onClick={()=>setScale(1)}>Actual size</button>
      <button aria-label="Zoom out" onClick={()=>adjust(-.25)}>−</button>
      <button aria-label="Zoom in" onClick={()=>adjust(.25)}>+</button>
    </div>
    {passwordRequest&&<form className="image-preview-tools" onSubmit={event=>{
      event.preventDefault();
      const input=event.currentTarget.elements.namedItem('password');
      if(!(input instanceof HTMLInputElement)||!input.value)return;
      const password=input.value;
      input.value='';
      setPasswordRequest(undefined);
      passwordRequest.submit(password);
    }}>
      <label>PDF password <input name="password" type="password" autoComplete="off" required autoFocus/></label>
      <button type="submit">Unlock PDF</button>
      {passwordRequest.incorrect&&<span role="alert">Incorrect PDF password.</span>}
    </form>}
    {!passwordRequest&&(status||documentError)&&<p role={documentError?'alert':'status'}>{documentError||status}</p>}
    <div className="next-pdf-viewport" ref={viewport} tabIndex={0} aria-label="Rendered PDF page">
      <div className="next-pdf-page" ref={stage}/>
    </div>
  </section>;
}
