"""Model-free command-worker protocol checks, not recognition accuracy evidence."""
import json
import runpy
import socket
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

WORKER = Path(__file__).resolve().parents[1] / "apps/api/resources/voice/asr_faster_whisper.py"


class Array:
    def reshape(self, *_args):
        return self

    def astype(self, *_args, **_kwargs):
        return self


class Frame:
    samples = 16000
    sample_rate = 16000

    def to_ndarray(self):
        return Array()


class Container:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def decode(self, **_kwargs):
        return iter([Frame()])


class Resampler:
    def __init__(self, **_kwargs):
        pass

    def resample(self, frame):
        return [frame] if frame is not None else []


class WorkerProtocol(unittest.TestCase):
    def run_worker(self, supplied):
        observed = {}

        class Model:
            def __init__(self, model, **options):
                observed["model"] = model
                observed["options"] = options

            def transcribe(self, _audio, **options):
                observed["transcribeOptions"] = options
                return (types.SimpleNamespace(**item) for item in supplied), types.SimpleNamespace(language="zh")

        modules = {
            "faster_whisper": types.SimpleNamespace(WhisperModel=Model),
            "av": types.SimpleNamespace(AudioResampler=Resampler, open=lambda _input: Container()),
            "numpy": types.SimpleNamespace(concatenate=lambda _samples: Array(), float32="float32"),
        }
        with tempfile.TemporaryDirectory(prefix="jarvis-asr-worker-protocol-") as temporary:
            directory = Path(temporary)
            model = directory / "model"
            model.mkdir()
            output = directory / "transcript.json"
            argv = [str(WORKER), "--input", str(directory / "public-fixture.wav"), "--output", str(output),
                    "--model", str(model), "--language", "zh", "--threads", "2"]
            with patch.dict(sys.modules, modules), patch.object(sys, "argv", argv), \
                    patch.object(socket, "create_connection", side_effect=AssertionError("network forbidden")), \
                    patch.object(socket, "socket", side_effect=AssertionError("network forbidden")):
                runpy.run_path(str(WORKER), run_name="__main__")
            raw = output.read_text(encoding="utf-8")
            self.assertNotIn(str(directory), raw)
            self.assertEqual(set(json.loads(raw)), {"text", "language", "duration", "segments"})
            self.assertEqual(observed["options"], {"device": "cpu", "compute_type": "int8", "cpu_threads": 2,
                                                   "num_workers": 1, "local_files_only": True})
            self.assertEqual(observed["transcribeOptions"], {"language": "zh", "beam_size": 3, "vad_filter": True,
                                                             "condition_on_previous_text": False})
            return json.loads(raw)

    def test_original_segment_times_and_text_survive_single_pass_generator(self):
        supplied = [{"start": 0.123456789, "end": 0.47, "text": "  原始第一句。 "},
                    {"start": 0.51, "end": 0.98, "text": "\n第二句🎤。  "}]
        result = self.run_worker(supplied)
        self.assertEqual(result["segments"], supplied)
        self.assertEqual(result["text"], "".join(item["text"] for item in supplied).strip())
        self.assertEqual(result["language"], "zh")
        self.assertEqual(result["duration"], 1.0)

    def test_empty_or_outside_model_segments_are_never_fabricated_or_clamped(self):
        empty = self.run_worker([])
        self.assertEqual(empty["segments"], [])
        self.assertEqual(empty["text"], "")
        supplied = [{"start": 0.9, "end": 9.75, "text": "模型原始时间由下游验证拒绝。"}]
        outside = self.run_worker(supplied)
        self.assertEqual(outside["duration"], 1.0)
        self.assertEqual(outside["segments"], supplied)


if __name__ == "__main__":
    unittest.main(verbosity=2)
