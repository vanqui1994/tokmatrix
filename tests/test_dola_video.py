import tempfile
import unittest
from pathlib import Path

import httpx

from bkt_web import dola_video as dv


def client_with(handler, **kw):
    return dv.DolaClient(base_url="http://gw", api_key="k", poll_interval=1,
                         transport=httpx.MockTransport(handler), sleep=lambda s: None, **kw)


class DolaVideoTest(unittest.TestCase):
    def test_validation(self):
        for bad in ({"prompt": "x", "duration": 12}, {"prompt": "x", "ratio": "2:1"},
                    {"prompt": "x", "model": "sora"}, {"prompt": ""},
                    {"prompt": "x", "reference_images": ["a.jpg"]}):
            with self.assertRaises(dv.DolaValidationError):
                dv._validate(bad)
        req = dv._validate({"prompt": "x", "duration": 30})
        self.assertEqual(req.model, "seedance-2.0")
        self.assertEqual(req.default_timeout(), 3600)
        ref = dv._validate({"prompt": "x", "reference_images": ["https://a/b.jpg"]})
        self.assertEqual(ref.default_timeout(), 900)

    def test_generate_and_wait_survives_network_jitter(self):
        polls = []

        def handler(req):
            self.assertEqual(req.headers["authorization"], "Bearer k")
            if req.method == "POST":
                return httpx.Response(200, json={"id": "video_1", "status": "queued"})
            polls.append(1)
            if len(polls) == 1:
                raise httpx.ConnectError("jitter")
            if len(polls) == 2:
                return httpx.Response(503)
            if len(polls) == 3:
                return httpx.Response(200, json={"id": "video_1", "status": "processing"})
            return httpx.Response(200, json={"id": "video_1", "status": "completed",
                                             "video_url": "http://gw/videos/a.mp4"})

        task = client_with(handler).generate_video_and_wait({"prompt": "fox"})
        self.assertEqual(task.video_url, "http://gw/videos/a.mp4")
        self.assertEqual(len(polls), 4)

    def test_failed_task_raises_with_error(self):
        def handler(req):
            if req.method == "POST":
                return httpx.Response(200, json={"id": "v", "status": "queued"})
            return httpx.Response(200, json={"id": "v", "status": "failed", "error": "nsfw"})

        with self.assertRaisesRegex(dv.DolaTaskFailed, "nsfw"):
            client_with(handler).generate_video_and_wait({"prompt": "x"})

    def test_quota_429_retries_then_raises(self):
        calls = []

        def handler(req):
            calls.append(1)
            return httpx.Response(429, json={"detail": "no credits"}, headers={"Retry-After": "7"})

        with self.assertRaises(dv.DolaQuotaError) as ctx:
            client_with(handler).create_task({"prompt": "x"}, quota_retries=2)
        self.assertEqual(len(calls), 3)
        self.assertEqual(ctx.exception.retry_after, 7)

    def test_422_and_timeout(self):
        c = client_with(lambda r: httpx.Response(422, json={"detail": "bad duration"}))
        with self.assertRaises(dv.DolaValidationError):
            c.create_task({"prompt": "x"})

        def handler(req):
            if req.method == "POST":
                return httpx.Response(200, json={"id": "v", "status": "queued"})
            return httpx.Response(200, json={"id": "v", "status": "processing"})

        with self.assertRaises(dv.DolaTimeout):
            client_with(handler).generate_video_and_wait({"prompt": "x"}, timeout=0.001)

    def test_download_checks_mp4(self):
        mp4 = b"\x00\x00\x00\x18ftypmp42" + b"0" * 100
        c = client_with(lambda r: httpx.Response(200, content=mp4 if r.url.path.endswith(".mp4") else b"<html>"))
        with tempfile.TemporaryDirectory() as d:
            out = c.download_video("/videos/a.mp4", Path(d) / "a.mp4")
            self.assertEqual(out.read_bytes(), mp4)
            with self.assertRaises(dv.DolaError):
                c.download_video("/videos/a.html", Path(d) / "b.mp4")
            self.assertFalse((Path(d) / "b.mp4").exists())

    def test_download_error_and_foreign_host_has_no_key(self):
        seen = {}

        def handler(req):
            seen[req.url.host] = req.headers.get("authorization")
            if req.url.host == "cdn":
                return httpx.Response(200, content=b"\x00\x00\x00\x18ftypmp42")
            return httpx.Response(404, json={"detail": "gone"})

        c = client_with(handler)
        with tempfile.TemporaryDirectory() as d:
            c.download_video("http://cdn/a.mp4", Path(d) / "a.mp4")
            with self.assertRaisesRegex(dv.DolaError, "404"):
                c.download_video("/videos/x.mp4", Path(d) / "x.mp4")
        self.assertIsNone(seen["cdn"])
        self.assertEqual(seen["gw"], "Bearer k")


if __name__ == "__main__":
    unittest.main()
