"""Local deterministic binary fixtures; no downloaded corpus or user inputs."""
import argparse, hashlib, json, math, random, struct, wave
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

parser=argparse.ArgumentParser()
parser.add_argument('directory'); parser.add_argument('--small', action='store_true')
args=parser.parse_args(); root=Path(args.directory); root.mkdir(parents=True,exist_ok=True)
records=[]
def record(path,mime,category,index):
    records.append(dict(path=path.name,mime=mime,category=category,index=index,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
formats=[('PNG','png','image/png'),('JPEG','jpg','image/jpeg'),('WEBP','webp','image/webp'),('GIF','gif','image/gif')]
for i in range(12 if args.small else 600):
    fmt,ext,mime=formats[i%4]; p=root/f'image-{i:04}.{ext}'
    if not p.exists():
        w,h=[(640,360),(360,640),(900,240),(512,512)][(i//4)%4]
        if i==596: w,h=8000,4999
        im=Image.new('RGB',(w,h),((i*23)%150+30,(i*47)%150+30,(i*71)%150+30))
        d=ImageDraw.Draw(im); d.rectangle((w//8,h//8,w*7//8,h*7//8),outline='white',width=max(2,w//180));d.text((w//6,h//3),f'ATLAS / Observatory {i:04}\nSynthetic spectrum and field measurements',fill='white')
        if i==597:
            # Deterministic noise creates a near-byte-bound image without altering originals.
            rng=random.Random(597);im=Image.frombytes('RGB',(2700,2500),rng.randbytes(2700*2500*3))
        if fmt=='GIF' and i%20==3:
            second=im.copy();ImageDraw.Draw(second).ellipse((30,30,90,90),fill='white');im.save(p,save_all=True,append_images=[second],duration=250,loop=0)
        else: im.save(p,format=fmt,**({'quality':92} if fmt in ('JPEG','WEBP') else {}))
    record(p,mime,'image',i)
for i in range(6 if args.small else 100):
    p=root/f'paper-{i:03}.pdf'
    if not p.exists():
        c=canvas.Canvas(str(p),pagesize=(595,842),invariant=1,pageCompression=1)
        pages=30 if i==99 else 2+(i%4)
        for page in range(pages):
            if i%10==0:
                c.drawImage(ImageReader(root/'image-0000.png'),50,350,width=495,height=279)
            else:
                c.setFillColorRGB(.05,.15,.25);c.setFont('Helvetica-Bold',19);c.drawString(48,770,f'Atlas Research Bulletin {i:03}')
                c.setFont('Helvetica',11);c.drawString(48,740,f'Local synthetic corpus / Page {page+1} / orbitledger{i:03}')
                text=c.beginText(48,700);text.setLeading(18)
                for line in range(22):text.textLine(f'Sample {line+1:02}: water, energy and habitat observations for sector {i:03}.')
                c.drawText(text);c.line(48,720,545,720)
            c.showPage()
        c.save()
    record(p,'application/pdf','pdf',i)
for i in range(8 if args.small else 150):
    ext,mime=[('txt','text/plain'),('md','text/markdown'),('csv','text/csv'),('json','application/json'),('py','text/x-python')][i%5];p=root/f'dataset-{i:03}.{ext}'
    phrase=f'filecompass{i:03}'
    body=f'Atlas synthetic dataset {i}\n{phrase}\nObservations of energy, ecosystems and urban design.\nUnicode: café 東京 مرحبا\nLiteral: 100% under_score [brackets]\n'
    if ext=='json':body=json.dumps(dict(title=f'Atlas dataset {i}',phrase=phrase,measurements=list(range(30))),ensure_ascii=False)
    if ext=='csv':body='station,value,marker\n'+''.join(f'station{n},{i+n},{phrase}\n' for n in range(30))
    if ext=='py':body=f'# Synthetic data, not executed\nmarker = "{phrase}"\n'
    p.write_text(body,encoding='utf-8');record(p,mime,'text',i)
for i in range(4 if args.small else 50):
    if i%2==0:
        p=root/f'tone-{i:03}.wav'
        with wave.open(str(p),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b''.join(struct.pack('<h',int(2500*math.sin(2*math.pi*(220+i)*n/8000))) for n in range(8000)))
        mime='audio/wav'
    else:
        p=root/f'unknown-{i:03}.bin';p.write_bytes(b'ATLAS SYNTHETIC UNKNOWN FORMAT\0'+bytes(range(256)));mime='application/octet-stream'
    record(p,mime,'other',i)
(root/'media.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
faults=root/'faults';faults.mkdir(exist_ok=True)
near=faults/'near-20MiB.png'
if not near.exists():Image.frombytes('RGB',(2600,2600),random.Random(2026).randbytes(2600*2600*3)).save(near)
over=faults/'over-40MP.png'
if not over.exists():Image.new('RGB',(8001,5000),'black').save(over)
(faults/'invalid.pdf').write_bytes(b'ATLAS DELIBERATELY INVALID PDF FIXTURE\n')
(faults/'unsupported.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>',encoding='utf-8')
(faults/'manifest.json').write_text(json.dumps(dict(imported=False,purpose='Explicit future upload/search failure scenarios, never silently imported into the baseline',files=[dict(name=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in faults.iterdir() if p.name!='manifest.json']),indent=2),encoding='utf-8')
print(json.dumps(dict(files=len(records),bytes=sum(r['bytes'] for r in records),video='Not generated: no pinned video encoder; unknown/audio fixtures cover Other files.')))
