import json
import unittest
from unittest import mock

import httpx

from bkt_web.services import gemini


def reply(text, status=200):
    if status != 200:
        return httpx.Response(status, json={"error": {"message": "busy"}})
    return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})


class GeminiServiceTest(unittest.TestCase):
    def client(self, script):
        """script: list of (model, status, text) theo thứ tự lời gọi mong đợi."""
        self.calls = []

        def handler(request):
            model = request.url.path.rsplit("/", 1)[-1].split(":")[0]
            self.calls.append(model)
            assert request.headers["x-goog-api-key"] == "k"
            assert "key" not in request.url.params  # khoá không nằm trên URL/log
            want_model, status, text = script[len(self.calls) - 1]
            assert model == want_model, (model, want_model)
            return reply(text, status)
        return httpx.Client(transport=httpx.MockTransport(handler))

    def test_falls_through_busy_models_in_order(self):
        c = self.client([("a", 503, ""), ("b", 429, ""), ("c", 200, "ok")])
        self.assertEqual(gemini.generate("hi", models=["a", "b", "c"], key="k", client=c), "ok")
        self.assertEqual(self.calls, ["a", "b", "c"])

    def test_retries_5xx_on_same_model_before_moving_on(self):
        c = self.client([("a", 503, ""), ("a", 200, "ok")])
        with mock.patch("time.sleep"):
            self.assertEqual(gemini.generate("hi", models=["a", "b"], key="k", client=c, attempts=2), "ok")

    def test_client_error_stops_immediately(self):
        c = self.client([("a", 400, "")])
        with self.assertRaises(gemini.GeminiError):
            gemini.generate("hi", models=["a", "b"], key="k", client=c)
        self.assertEqual(self.calls, ["a"])

    def test_rounds_repeat_the_whole_chain(self):
        c = self.client([("a", 503, ""), ("b", 503, ""), ("a", 200, "ok")])
        with mock.patch("time.sleep"):
            self.assertEqual(gemini.generate("hi", models=["a", "b"], key="k", client=c, rounds=2), "ok")

    def test_generate_json_parses_fenced_and_moves_on_after_bad_json(self):
        c = self.client([("a", 200, "not json at all"), ("b", 200, '```json\n{"x": 1}\n```')])
        self.assertEqual(gemini.generate_json("hi", models=["a", "b"], key="k", client=c), {"x": 1})

    def test_request_body_carries_config_and_parts(self):
        seen = {}

        def handler(request):
            seen.update(json.loads(request.content))
            return reply("ok")
        c = httpx.Client(transport=httpx.MockTransport(handler))
        gemini.generate([gemini.text("a"), gemini.inline(b"\x00", "image/png")], models=["m"], key="k", client=c,
                        json_mode=True, temperature=0.2, max_tokens=10, thinking_budget=0)
        cfg = seen["generationConfig"]
        self.assertEqual(cfg["responseMimeType"], "application/json")
        self.assertEqual((cfg["temperature"], cfg["maxOutputTokens"], cfg["thinkingConfig"]["thinkingBudget"]), (0.2, 10, 0))
        self.assertEqual(seen["contents"][0]["parts"][1]["inline_data"]["mime_type"], "image/png")

    def test_missing_key_is_a_clear_error(self):
        with mock.patch.object(gemini, "api_key", return_value=""):
            with self.assertRaises(gemini.GeminiError):
                gemini.generate("hi")


if __name__ == "__main__":
    unittest.main()
