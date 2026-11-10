// Deterministic, disposable 512x512 RGBA PNG; no external image or user file.
import {deflateSync} from 'node:zlib';
export function imageFixture(){
 const crc=data=>{let value=0xffffffff;for(const byte of data){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const type=Buffer.from(name),body=Buffer.concat([type,data]),header=Buffer.alloc(4),tail=Buffer.alloc(4);header.writeUInt32BE(data.length);tail.writeUInt32BE(crc(body));return Buffer.concat([header,body,tail]);};
 const width=512,height=512,raw=Buffer.alloc(height*(1+4*width));let seed=42;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const at=y*(1+4*width)+1+x*4;raw[at]=seed&255;raw[at+1]=(seed>>>8)&255;raw[at+2]=(seed>>>16)&255;raw[at+3]=255;}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
