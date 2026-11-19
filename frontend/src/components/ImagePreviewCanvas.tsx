import {useState} from 'react';

export default function ImagePreviewCanvas({url,title}:{url:string;title:string}){
  const [zoom,setZoom]=useState<number|'fit'>('fit'),[naturalWidth,setNaturalWidth]=useState(0);
  return (
    <div className="bg-background min-h-full"><div className="image-preview-tools"><button onClick={() => setZoom('fit')}>Fit</button><button onClick={() => setZoom(1)}>Actual size</button><button onClick={() => setZoom(value => Math.max(.1, (value === 'fit' ? 1 : value) - .25))}>−</button><button onClick={() => setZoom(value => Math.min(4, (value === 'fit' ? 1 : value) + .25))}>+</button><span>{zoom === 'fit' ? 'Fit' : Math.round(zoom * 100) + '%'}</span></div><div className="image-preview-canvas"><img src={url} alt={title} onLoad={event => setNaturalWidth(event.currentTarget.naturalWidth)} style={zoom === 'fit' ? {maxWidth:'100%',height:'auto'} : {maxWidth:'none',width:`${naturalWidth * zoom}px`}} /></div></div>
  );
}
