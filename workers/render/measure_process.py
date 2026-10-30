"""Measure one real child; RSS is sampled, CPU includes all its threads. No shell."""
import json
import subprocess
import sys
import time
from pathlib import Path
import psutil

destination=Path(sys.argv[1]); command=sys.argv[2:]
start=time.monotonic(); peak=0; cpu=0
process=subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
tracked=psutil.Process(process.pid)
while process.poll() is None:
    try:
        peak=max(peak, tracked.memory_info().rss)
        times=tracked.cpu_times(); cpu=max(cpu,times.user+times.system)
    except (psutil.NoSuchProcess,psutil.AccessDenied): pass
    time.sleep(0.1)
_,err=process.communicate()
destination.write_text(json.dumps({'wall_ms':round((time.monotonic()-start)*1000),
  'cpu_ms_sampled':round(cpu*1000),'peak_rss_bytes_sampled':peak,'exit_code':process.returncode})+'\n',encoding='utf-8')
if process.returncode: sys.stderr.buffer.write(err[-8000:])
sys.exit(process.returncode)
