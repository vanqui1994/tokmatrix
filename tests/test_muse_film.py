import unittest

from bkt_web import muse_film


class ShotTextTest(unittest.TestCase):
    def test_quote_markers_and_bold_are_removed(self):
        self.assertEqual(muse_film.shot_text("> **[0-1s]** Hard cut: the window frosts over."),
                         "[0-1s] Hard cut: the window frosts over.")

    def test_lines_without_words_are_empty(self):
        for line in (">", "> ", ">>", "  ", "**", "- ", "> -"):
            self.assertEqual(muse_film.shot_text(line), "", line)

    def test_list_markers_are_removed(self):
        self.assertEqual(muse_film.shot_text("2) A wolf crosses the lake"), "A wolf crosses the lake")
        self.assertEqual(muse_film.shot_text("• Dawn over the hills"), "Dawn over the hills")


if __name__ == "__main__":
    unittest.main()
