import re
import threading
import unittest
from pathlib import Path

from bkt_web import workers

ROOT = Path(__file__).resolve().parents[1] / "bkt_web"


class WorkersRegistryTest(unittest.TestCase):
    def test_every_named_thread_in_the_code_is_registered(self):
        """Thêm worker mới mà quên khai báo trong workers.WORKERS thì trang "Worker nền" sẽ không thấy nó."""
        found = set()
        for f in list(ROOT.glob("*.py")) + list(ROOT.glob("autopilot/*.py")):
            text = f.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r'Thread\([^)]*?name=f?"([^"{]+)', text, re.S):
                found.add(m.group(1))
            for m in re.finditer(r'^THREAD_NAME = "([^"]+)"', text, re.M):
                found.add(m.group(1))
        missing = [n for n in sorted(found) if not any(workers._match(w, n) or (w.name.endswith("*") and n == w.name[:-1]) for w in workers.WORKERS)]
        self.assertEqual(missing, [])

    def test_names_unique_and_status_counts_live_threads(self):
        names = [w.name for w in workers.WORKERS]
        self.assertEqual(len(names), len(set(names)))
        fake = [threading.Thread(name="upload-scheduler"), threading.Thread(name="matrix-b1"), threading.Thread(name="matrix-b2")]
        for t in fake:
            t.is_alive = lambda: True
        rows = {r["name"]: r for r in workers.status(fake)["workers"]}
        self.assertEqual(rows["upload-scheduler"]["running"], 1)
        self.assertEqual(rows["matrix-*"]["running"], 2)
        self.assertEqual(rows["dola-worker"]["running"], 0)


if __name__ == "__main__":
    unittest.main()
