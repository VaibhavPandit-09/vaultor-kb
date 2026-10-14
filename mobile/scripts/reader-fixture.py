"""Disposable R2 media only; never reads a workspace or credentials."""
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption
root = Path(__file__).resolve().parent.parent / 'cache' / 'reader-fixture'
root.mkdir(parents=True, exist_ok=True)
for i, color in enumerate(['#276780', '#853b70']):
    im=Image.new('RGB',(1600,1000),color)
    d=ImageDraw.Draw(im)
    for y in range(0,1000,80): d.line((0,y,1600,y), fill='#f4e2b5', width=3)
    d.rectangle((200,200,1400,800),outline='white',width=12)
    im.save(root/f'image-{i+1}.png')
for name, encrypted in [('reading.pdf',False),('locked.pdf',True)]:
    pdf=canvas.Canvas(str(root/name),pagesize=(600,900),encrypt=StandardEncryption('fixture-password') if encrypted else None)
    for i in range(1,13):
        pdf.setFillColorRGB(.98,.96,.9);pdf.rect(0,0,600,900,fill=1,stroke=0)
        pdf.setFillColorRGB(.1,.2,.3);pdf.setFont('Helvetica',24);pdf.drawString(40,830,f'R2 Reading document - Page {i}')
        for row in range(18):
            pdf.setFont('Helvetica',12);pdf.drawString(40,780-row*32,f'Original PDF text and colors. Reading line {row+1}.')
        pdf.showPage()
    pdf.save()
print('Disposable reader image/PDF fixtures generated')
