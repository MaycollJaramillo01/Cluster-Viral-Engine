#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 2 ]; then echo 'Usage: check_output.sh <mp4> <approx_seconds>' >&2; exit 2; fi
FILE="$1" TARGET="$2"
python3 - "$FILE" "$TARGET" <<'PYX'
import json,subprocess,sys
path,target=sys.argv[1],float(sys.argv[2])
x=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',path],text=True))
v=next((s for s in x['streams'] if s['codec_type']=='video'),None)
a=next((s for s in x['streams'] if s['codec_type']=='audio'),None)
d=float(x['format']['duration'])
assert v and v['codec_name']=='h264',f'expected H264 {v}'
assert a and a['codec_name']=='aac',f'expected AAC {a}'
assert int(v['width'])%2==0 and int(v['height'])%2==0
assert abs(d-target)<2,f'duration {d} expected near {target}'
print(f'PASS video={v["width"]}x{v["height"]}, audio={a["codec_name"]}, duration={d:.2f}s')
PYX
