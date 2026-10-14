"""Read-only RAPL sampler. Exports package energy only; never changes limits."""
from datetime import datetime, timezone
import glob
import json
import os
from pathlib import Path
import time

OUTPUT=Path('/var/lib/jarvis-power-sampler/summary.json')

def average_power(before, after, maximum, seconds):
    if seconds <= 0 or not 0 <= before <= maximum or not 0 <= after <= maximum:
        raise ValueError('Invalid counter')
    delta=after-before if after>=before else maximum-before+after
    watts=delta/seconds/1e6
    if not 0<=watts<=1000:
        raise ValueError('Counter discontinuity')
    return watts

def sample():
    zones=[]
    # Glob only top-level packages. "core", "uncore", "dram" and "psys"
    # overlap or have different boundaries; summing them would double count.
    for raw in glob.glob('/sys/class/powercap/intel-rapl:*/energy_uj'):
        path=Path(raw)
        try:
            if not (path.parent/'name').read_text().strip().startswith('package-'):
                continue
            zones.append((path,int(path.read_text()),int((path.parent/'max_energy_range_uj').read_text())))
        except (OSError,ValueError):
            continue
    if not zones:
        return None
    start=time.monotonic()
    time.sleep(2)
    readings=[(before,int(path.read_text()),maximum) for path,before,maximum in zones]
    elapsed=time.monotonic()-start
    return {'source':'intel-rapl','watts':round(sum(average_power(a,b,m,elapsed) for a,b,m in readings),3),
            'observedAt':datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'),
            'windowSeconds':round(elapsed,3)}

if __name__=='__main__':
    OUTPUT.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
    try:
        value=sample()
    except (OSError,ValueError):
        value=None
    temporary=OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(value),encoding='utf8')
    os.chmod(temporary,0o644)
    os.replace(temporary,OUTPUT)
