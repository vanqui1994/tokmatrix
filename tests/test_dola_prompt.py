import unittest

from bkt_web import dola_video as dv


class PromptCleanerTest(unittest.TestCase):
    def test_humanize_prompt(self):
        self.assertEqual(dv.humanize_dola_prompt(""), "")
        self.assertEqual(dv.humanize_dola_prompt("   "), "")
        cases = {
            "fox, 4k.": "A natural cinematic visual of fox.",
            "fox 4k.": "A natural cinematic visual of fox.",
            "NASA's rocket": "A natural cinematic visual of NASA's rocket.",
            "McDonald farm": "A natural cinematic visual of McDonald farm.",
            "4k-ready fox": "A natural cinematic visual of fox.",
            "fox (4k)": "A natural cinematic visual of fox.",
            "fox, , , running": "A natural cinematic visual of fox, running.",
            "A stunning sunset": "A stunning sunset.",
            "slow motion water drop": "slow motion water drop.",
        }
        for inp, expected in cases.items():
            self.assertEqual(dv.humanize_dola_prompt(inp), expected, f"Failed for {inp}")


if __name__ == "__main__":
    unittest.main()
