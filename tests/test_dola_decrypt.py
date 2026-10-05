import base64
import hashlib
import unittest

from bkt_web import dola_decrypt as dd


class DolaDecryptTest(unittest.TestCase):
    def test_humanize_prompt(self):
        # Empty / whitespace
        self.assertEqual(dd.humanize_dola_prompt(""), "")
        self.assertEqual(dd.humanize_dola_prompt("   "), "")

        # 9 Target Cases
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
            self.assertEqual(dd.humanize_dola_prompt(inp), expected, f"Failed for {inp}")

    def test_decode_base64_loose(self):
        plain = b"hello world 123"
        encoded = base64.b64encode(plain).decode()
        self.assertEqual(dd.decode_base64_loose(encoded), plain)

        # URL-safe characters
        encoded_alt = encoded.replace("+", "$").replace("/", "@")
        self.assertEqual(dd.decode_base64_loose(encoded_alt), plain)

    def test_qaab_decryption_roundtrip(self):
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        seed = b"test_seed_thirty_two_bytes_12345"
        digest1 = hashlib.sha512(seed[:32]).digest()
        salt = bytes.fromhex(dd.QAAB_SALT_HEX)
        digest2 = hashlib.sha512(digest1 + salt).digest()
        key, iv = digest2[:16], digest2[16:32]

        url = b"https://v3-web.doubaocdn.com/video/unwatermarked_1080p.mp4"
        pad = 16 - (len(url) % 16)
        padded = url + bytes([pad]) * pad

        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        ct = encryptor.update(padded) + encryptor.finalize()

        # Magic header + encrypted payload
        data = dd.MAGIC_HEADER + ct
        token_str = base64.b64encode(data).decode()
        key_seed_str = base64.b64encode(seed).decode()

        # Decrypt via function
        decrypted = dd.decrypt_qaab_token(token_str, key_seed_str)
        self.assertEqual(decrypted, url.decode())

        # Test decode_main_url
        self.assertEqual(dd.decode_main_url(token_str, key_seed_str), url.decode())

        # Test plain http URL passes through
        self.assertEqual(dd.decode_main_url("https://example.com/video.mp4"), "https://example.com/video.mp4")

        # Test plain base64 URL passes through
        b64_plain = base64.b64encode(b"https://example.com/plain.mp4").decode()
        self.assertEqual(dd.decode_main_url(b64_plain), "https://example.com/plain.mp4")

    def test_extract_unwatermarked_url_from_video_model(self):
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

        seed = b"seed_32_bytes_long_sample_123456"
        digest1 = hashlib.sha512(seed[:32]).digest()
        salt = bytes.fromhex(dd.QAAB_SALT_HEX)
        digest2 = hashlib.sha512(digest1 + salt).digest()
        key, iv = digest2[:16], digest2[16:32]

        url = b"https://byteintl.com/video/best_quality_raw.mp4"
        pad = 16 - (len(url) % 16)
        padded = url + bytes([pad]) * pad
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        ct = cipher.encryptor().update(padded) + cipher.encryptor().finalize()

        token_str = base64.b64encode(dd.MAGIC_HEADER + ct).decode()
        key_seed_str = base64.b64encode(seed).decode()

        video_model_dict = {
            "key_seed": key_seed_str,
            "video_list": {
                "video_1": {
                    "main_url": token_str,
                    "bitrate": 5000000,
                    "vwidth": 1080,
                    "vheight": 1920,
                },
                "video_low": {
                    "main_url": base64.b64encode(b"https://example.com/low.mp4").decode(),
                    "bitrate": 1000000,
                    "vwidth": 720,
                    "vheight": 1280,
                },
            },
        }

        # Should pick the higher score unwatermarked URL
        res = dd.extract_unwatermarked_url_from_video_model(video_model_dict, "https://fallback.com/watermarked.mp4")
        self.assertEqual(res, url.decode())


if __name__ == "__main__":
    unittest.main()
