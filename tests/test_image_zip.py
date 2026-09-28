import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from fastapi import HTTPException

from bkt_web import image_routes


class GalleryZipTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.generated = root / "generated"
        self.storage = root / "storage"
        self.generated.mkdir()
        self.storage.mkdir()
        self.patch_generated = mock.patch.object(image_routes, "GENERATED_DIR", self.generated)
        self.patch_storage = mock.patch.object(image_routes, "STORAGE_DIR", self.storage)
        self.patch_generated.start()
        self.patch_storage.start()
        self.addCleanup(self.patch_generated.stop)
        self.addCleanup(self.patch_storage.stop)

    def test_zip_is_disk_backed_deduplicated_and_skips_recompressing_jpeg(self):
        (self.generated / "a.jpg").write_bytes(b"jpeg-bytes")
        archive = image_routes._build_gallery_zip(["a.jpg", "a.jpg", "missing.jpg"])
        self.addCleanup(image_routes._delete_gallery_zip, archive)

        self.assertTrue(archive.is_file())
        self.assertEqual(archive.parent, self.storage)
        with zipfile.ZipFile(archive) as zf:
            self.assertEqual(zf.namelist(), ["a.jpg"])
            self.assertEqual(zf.getinfo("a.jpg").compress_type, zipfile.ZIP_STORED)

    def test_total_source_size_is_capped_before_archive_creation(self):
        (self.generated / "large.png").write_bytes(b"1234")
        with mock.patch.object(image_routes, "MAX_GALLERY_ZIP_SOURCE_BYTES", 3):
            with self.assertRaises(HTTPException) as ctx:
                image_routes._build_gallery_zip(["large.png"])
        self.assertEqual(ctx.exception.status_code, 413)
        self.assertEqual(list(self.storage.glob("*.zip")), [])


if __name__ == "__main__":
    unittest.main()
