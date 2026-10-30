"""Original code-drawn illustrations. Not archive photos or approved editorial material."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
TITLES = ['¿Cuánto dura un segundo?', 'Una unidad compartida', 'Buscar una repetición', 'El cesio-133',
          'Una transición precisa', '9 192 631 770 ciclos', 'Comparar los relojes', 'Medir, documentar, revisar']
TEXTS = [
 'Mirar un reloj parece suficiente para saber cuánto dura un segundo. Pero comparar relojes exige algo más: una referencia compartida. Esta historia muestra cómo una unidad cotidiana puede apoyarse en una definición científica precisa.',
 'El segundo es la unidad de tiempo del Sistema Internacional. Su símbolo es la letra ese. Una definición común permite expresar intervalos con el mismo lenguaje, aunque se midan en lugares diferentes y con instrumentos distintos.',
 'Para entender la idea, imaginemos una señal que se repite. Contar sus ciclos permite describir un intervalo. Este dibujo es una explicación visual simplificada: no es una fotografía de un laboratorio ni una medición experimental.',
 'La definición del segundo utiliza una propiedad del cesio ciento treinta y tres. No depende de observar las manecillas de un reloj. Se refiere a una frecuencia asociada a una transición específica del átomo en condiciones definidas.',
 'El detalle importa: la referencia corresponde a la transición entre dos niveles hiperfinos del estado fundamental no perturbado. El esquema representa esa relación de forma conceptual; las líneas y sus distancias no están dibujadas a escala.',
 'La frecuencia fijada es de nueve mil ciento noventa y dos millones seiscientos treinta y un mil setecientos setenta hercios. Ese valor conecta los ciclos de la radiación correspondiente con la unidad de tiempo que llamamos segundo.',
 'La definición y su realización práctica son asuntos relacionados. Los laboratorios construyen y comparan instrumentos para materializar la referencia. La página del NIST explica cómo los relojes atómicos permiten medir el tiempo a partir de propiedades de los átomos.',
 'La próxima vez que veas pasar un segundo, recuerda la pregunta inicial: cómo compartir una medida. Aquí dejamos dos fuentes para comprobar la explicación. Este ensayo audiovisual requiere todavía revisión humana y una narración profesional antes de su aprobación.'
]

def font(size):
    for candidate in ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(candidate).exists(): return ImageFont.truetype(candidate, size)
    raise RuntimeError('Install Arial or DejaVu Sans')

def wrap(draw, text, face, max_width):
    lines, line = [], ''
    for word in text.split():
        candidate = (line + ' ' + word).strip()
        if draw.textlength(candidate, font=face) > max_width:
            lines.append(line); line = word
        else: line = candidate
    if line: lines.append(line)
    return lines

def generate(out):
    assets = out / 'assets'; assets.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for i, title in enumerate(TITLES):
        im = Image.new('RGB', (1080, 1920), '#122126'); d = ImageDraw.Draw(im)
        accent = '#d9bc79'; white = '#eee9dd'
        for x in range(80, 1080, 80): d.line((x, 580, x, 1390), fill='#203238', width=1)
        for y in range(580, 1390, 80): d.line((80, y, 1000, y), fill='#203238', width=1)
        d.text((110, 180), f'CLUSTER / ENSAYO 00 / {i+1:02}', font=font(26), fill=accent)
        y = 280
        for line in wrap(d, title, font(72), 850): d.text((110, y), line, font=font(72), fill=white); y += 88
        if i == 0:
            d.ellipse((260, 680, 820, 1240), outline=accent, width=8)
            d.line((540, 960, 540, 745), fill=white, width=12); d.line((540, 960, 690, 1040), fill=white, width=10)
            for h in range(12):
                a = h*math.pi/6; x, y = 540+250*math.sin(a), 960-250*math.cos(a)
                d.ellipse((x-6,y-6,x+6,y+6), fill=white)
        elif i == 1:
            for j, label in enumerate(['LABORATORIO A', '1 s', 'LABORATORIO B']):
                y=700+j*190; d.rectangle((220,y,860,y+120), outline=accent,width=4)
                d.text((270,y+35),label,font=font(40),fill=white)
        elif i == 2:
            pts=[(110+x, 960-int(140*math.sin(x*math.pi/90))) for x in range(860)]
            d.line(pts, fill=accent,width=7); d.text((150,1200),'SEÑAL PERIÓDICA / ESQUEMA',font=font(30),fill=white)
        elif i == 3:
            d.ellipse((340,760,740,1160),outline=accent,width=5)
            d.text((420,870),'Cs',font=font(120),fill=white); d.text((445,1020),'133',font=font(60),fill=accent)
        elif i == 4:
            for y in [780,1120]: d.line((220,y,860,y),fill=accent,width=8)
            d.line((540,1090,540,810),fill=white,width=7); d.polygon([(520,840),(540,805),(560,840)],fill=white)
            d.text((230,1210),'NIVELES / SIN ESCALA',font=font(34),fill=white)
        elif i == 5:
            for j,label in enumerate(['9 192 631 770', 'Hz', '1 segundo']):
                d.text((160,740+190*j),label,font=font(88 if j==0 else 70),fill=accent if j==0 else white)
        elif i == 6:
            for x in [180,630]:
                d.rectangle((x,780,x+270,1130),outline=accent,width=4)
                d.text((x+40,910),'00:01',font=font(52),fill=white)
            d.line((450,960,630,960),fill=white,width=5)
        else:
            for j,label in enumerate(['BIPM / SI', 'NIST / RELOJES ATÓMICOS', 'REVISIÓN EDITORIAL PENDIENTE']):
                d.text((140,750+j*180),label,font=font(34),fill=accent if j==2 else white)
        d.text((110,1340),'ILUSTRACIÓN ORIGINAL / NO ES ARCHIVO',font=font(27),fill=accent)
        d.text((110,1400),'POC TÉCNICA / SIN VOZ TTS',font=font(27),fill=white)
        path=assets/f'{i+1:02}.png'; im.save(path)
        hashes[f'assets/{i+1:02}.png']=hashlib.sha256(path.read_bytes()).hexdigest()
    (out/'asset-checksums.json').write_text(json.dumps(hashes,indent=2)+'\n',encoding='utf-8')

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--out',type=Path,default=ROOT/'workers/render/out/dataset')
    args=p.parse_args(); generate(args.out.resolve())
