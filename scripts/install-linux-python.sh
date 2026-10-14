#!/bin/bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
export UV_PYTHON_INSTALL_DIR=/opt/jarvis/python UV_CACHE_DIR=/var/cache/jarvis/uv UV_NATIVE_TLS=1
umask 027
[ "$(id -u)" = 0 ] || exit 1
requirements=${1:?Pass the uploaded pinned requirements file}
[ -f "$requirements" ] && [ ! -L /opt/jarvis ] || exit 1
python3 -m venv /opt/jarvis/uv-bootstrap
/opt/jarvis/uv-bootstrap/bin/pip install --disable-pip-version-check 'uv==0.12.23'
uv=/opt/jarvis/uv-bootstrap/bin/uv
"$uv" python install 3.12.15 --no-bin
python_path=$("$uv" python find --managed-python 3.12.15)
[[ "$python_path" = /opt/jarvis/python/* ]] || exit 1
if [ -e /opt/jarvis/venv ]; then
  [ ! -L /opt/jarvis/venv ] || exit 1
  version=$(/opt/jarvis/venv/bin/python -c 'import sys; print("%d.%d" % sys.version_info[:2])')
  if [ "$version" != 3.12 ]; then
    [ ! -e /opt/jarvis/venv-py314-unused ] || exit 1
    mv /opt/jarvis/venv /opt/jarvis/venv-py314-unused
  fi
fi
if [ ! -e /opt/jarvis/venv ]; then "$uv" venv --python "$python_path" /opt/jarvis/venv; fi
"$uv" pip install --python /opt/jarvis/venv/bin/python -r "$requirements" 'piper-tts==1.8.0'
chgrp -R jarvis /opt/jarvis/python /opt/jarvis/venv
chmod -R g+rX /opt/jarvis/python /opt/jarvis/venv
runuser -u jarvis -- /opt/jarvis/venv/bin/python -c 'import sys, faster_whisper, rapidocr_onnxruntime, piper; print("Verified Python:", sys.version.split()[0]); print("ASR/OCR/TTS imports passed")'
/opt/jarvis/venv/bin/python -m pip --version 2>/dev/null || true
"$uv" pip freeze --python /opt/jarvis/venv/bin/python > /etc/jarvis/python-runtime.lock.txt
chown root:jarvis /etc/jarvis/python-runtime.lock.txt
chmod 0640 /etc/jarvis/python-runtime.lock.txt
