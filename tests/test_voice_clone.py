import json
import pickle
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import voice_clone


class FakeTensor:
    def __init__(self, value):
        self.value = value

    def cpu(self):
        return self


def _fake_torch():
    torch = types.ModuleType("torch")
    torch.seeds = []
    torch.save = lambda obj, path: Path(path).write_bytes(pickle.dumps(obj.value))
    torch.load = lambda path, map_location=None: FakeTensor(pickle.loads(Path(path).read_bytes()))
    torch.manual_seed = torch.seeds.append
    return torch


class FakeConverter:
    def __init__(self):
        self.converted = []

    def extract_se(self, wavs):
        return FakeTensor([Path(w).stat().st_size for w in wavs])

    def convert(self, src, src_se, tgt_se, output_path=None, tau=0.3, message=""):
        self.converted.append((tgt_se.value, tau))
        Path(output_path).write_bytes(Path(src).read_bytes())


def _tone(path: Path, seconds: float = 1.0, freq: int = 220) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}", str(path)], check=True)


class VoiceCloneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.patches = [mock.patch.object(voice_clone, "CLONE_DIR", root / "clones"), mock.patch.dict(sys.modules, {"torch": _fake_torch()})]
        for p in self.patches:
            p.start()
        self.ref = root / "ref.mp3"
        self.src = root / "src.mp3"
        _tone(self.ref, 2.0, 180)
        _tone(self.src, 1.0, 260)

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def test_enroll_requires_consent_and_a_clean_id(self):
        with self.assertRaises(ValueError):
            voice_clone.enroll("de_host", [self.ref], consent="", lang="de", converter=FakeConverter())
        with self.assertRaises(ValueError):
            voice_clone.enroll("Bad Id", [self.ref], consent="owner", lang="de", converter=FakeConverter())
        entry = voice_clone.enroll("de_host", [self.ref], consent="owner", lang="de", gender="male", converter=FakeConverter())
        registry = json.loads(voice_clone.registry_path().read_text())
        self.assertEqual(registry["voices"]["de_host"]["se_sha256"], entry["se_sha256"])
        self.assertEqual(entry["consent"], "owner")

    def test_convert_is_seeded_and_fails_loudly_for_unknown_or_tampered_voices(self):
        conv = FakeConverter()
        voice_clone.enroll("de_host", [self.ref], consent="licensed", lang="de", converter=conv)
        out1 = Path(self.tmp.name) / "o1.mp3"
        voice_clone.convert("de_host", self.src, out1, converter=conv)
        voice_clone.convert("de_host", self.src, Path(self.tmp.name) / "o2.mp3", converter=conv)
        seeds = sys.modules["torch"].seeds
        self.assertEqual(len(seeds), 2)
        self.assertEqual(seeds[0], seeds[1])
        self.assertGreater(out1.stat().st_size, 0)
        with self.assertRaises(KeyError):
            voice_clone.convert("ghost", self.src, out1, converter=conv)
        (voice_clone.CLONE_DIR / "de_host.se.pt").write_bytes(b"changed")
        with self.assertRaises(RuntimeError):
            voice_clone.convert("de_host", self.src, out1, converter=conv)

    def test_cli_reports_errors_as_one_json_line(self):
        with mock.patch("builtins.print") as printed:
            code = voice_clone.main(["convert", "--id", "ghost", "--src", str(self.src), "--out", "/tmp/x.mp3"])
        self.assertEqual(code, 1)
        self.assertFalse(json.loads(printed.call_args[0][0])["success"])


if __name__ == "__main__":
    unittest.main()
