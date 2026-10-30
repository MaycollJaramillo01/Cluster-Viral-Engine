#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
command -v python3 >/dev/null
mkdir -p out
W="${CVE_WIDTH:-360}"; H="${CVE_HEIGHT:-640}"
if (( W < 160 || H < 240 )); then echo 'dimensions too small' >&2; exit 2; fi
if (( W % 2 != 0 || H % 2 != 0 )); then echo 'even dimensions required' >&2; exit 2; fi
printf '1\n00:00:00,000 --> 00:00:04,000\nCLUSTER: una historia por investigar.\n\n2\n00:00:04,100 --> 00:00:08,000\nDatos y fuentes deben verificarse.\n\n3\n00:00:08,100 --> 00:00:12,000\nSin aprobacion humana, no publicar.\n' > out/demo.srt
# Synthesize three distinct illustrative stills, all original.
python3 - "$W" "$H" <<'PYX'
import sys
from pathlib import Path
w,h=int(sys.argv[1]),int(sys.argv[2])
for idx,(r,g,b) in enumerate([(7,28,45),(12,60,72),(39,32,65)]):
 f=Path('out')/f'scene{idx+1}.ppm'
 with f.open('wb') as o:
  o.write(f'P6\n{w} {h}\n255\n'.encode())
  for y in range(h):
   shift=int(y/h*35)
   o.write(bytes([min(255,r+shift),min(255,g+shift),min(255,b+shift)])*w)
PYX
# Three 4s zooming scenes with short fade in/out transitions, ~12s output.
ffmpeg -hide_banner -loglevel error -y \
  -loop 1 -framerate 30 -t 4.5 -i out/scene1.ppm \
  -loop 1 -framerate 30 -t 4.5 -i out/scene2.ppm \
  -loop 1 -framerate 30 -t 4.5 -i out/scene3.ppm \
  -f lavfi -t 12 -i 'sine=frequency=190:sample_rate=48000' \
  -filter_complex "[0:v]scale=$W:$H,setsar=1,zoompan=z='min(zoom+0.0005,1.07)':d=1:s=${W}x${H}:fps=30,trim=duration=4,setpts=PTS-STARTPTS,fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=3.75:d=0.25[v0];[1:v]scale=$W:$H,setsar=1,zoompan=z='min(zoom+0.0007,1.10)':d=1:s=${W}x${H}:fps=30,trim=duration=4,setpts=PTS-STARTPTS,fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=3.75:d=0.25[v1];[2:v]scale=$W:$H,setsar=1,zoompan=z='min(zoom+0.0008,1.12)':d=1:s=${W}x${H}:fps=30,trim=duration=4,setpts=PTS-STARTPTS,fps=30,format=yuv420p,fade=t=in:st=0:d=0.25,fade=t=out:st=3.75:d=0.25[v2];[v0][v1][v2]concat=n=3:v=1:a=0[vout];[vout]drawtext=text='CLUSTER VIRAL ENGINE':fontsize=$((W/21)):fontcolor=white:x=(w-text_w)/2:y=h*0.16:box=1:boxcolor=black@0.3:boxborderw=12,subtitles=out/demo.srt:force_style='FontSize=22,PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,Outline=2,MarginV=120'[vfinal]" \
  -map '[vfinal]' -map 3:a \
  -c:v libx264 -preset veryfast -crf 24 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 128k -movflags +faststart -t 12 out/poc.mp4
printf 'Created: %s/out/poc.mp4\n' "$(pwd)"
ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,codec_name,width,height -of json out/poc.mp4
