import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from bkt_web import server, vpn_manager


class FakeProc:
    def poll(self):
        return None

    def terminate(self):
        pass

    def wait(self, timeout=None):
        return 0


class ChannelProxyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / "channels.db"
        conn = sqlite3.connect(self.db)
        conn.execute("CREATE TABLE channels (id INTEGER PRIMARY KEY, country TEXT, vpn_config TEXT DEFAULT '', "
                     "vpn_location TEXT DEFAULT '', nord_host TEXT DEFAULT '')")
        conn.executemany("INSERT INTO channels(id, country, vpn_config) VALUES (?, ?, ?)",
                         [(1, "GB", "NordVPN_United_Kingdom/Standard_P2P/London/uk1.conf"), (2, "GB", "")])
        conn.commit()
        conn.close()
        for module in (server, vpn_manager):
            patch = mock.patch.object(module, "DB_PATH", self.db)
            patch.start()
            self.addCleanup(patch.stop)
        tunnels = mock.patch.dict(vpn_manager.ACTIVE_TUNNELS, clear=True)
        tunnels.start()
        self.addCleanup(tunnels.stop)

    def fake_start(self, channel_id, conf, idle_ttl=None):
        return {"socks_port": 1080 + channel_id, "socks5_url": f"socks5://127.0.0.1:{1080 + channel_id}",
                "location": conf}

    def test_uses_the_channels_own_config_not_shared_nord(self):
        with mock.patch.object(vpn_manager, "start_wireguard_proxy", side_effect=self.fake_start) as start, \
                mock.patch.object(server.nord_api, "start_dynamic_nord_tunnel") as nord:
            result = server.ensure_channel_proxy(1, country="GB", nord_host="uk6083.nordvpn.com")
        self.assertTrue(result["ok"])
        start.assert_called_once_with(1, "NordVPN_United_Kingdom/Standard_P2P/London/uk1.conf",
                                      idle_ttl=server.CHANNEL_PROXY_IDLE_TTL)
        nord.assert_not_called()

    def test_tunnel_failure_is_an_error_never_a_shared_fallback(self):
        with mock.patch.object(vpn_manager, "start_wireguard_proxy", side_effect=RuntimeError("down")), \
                mock.patch.object(server.nord_api, "start_dynamic_nord_tunnel") as nord:
            result = server.ensure_channel_proxy(1, country="GB")
        self.assertFalse(result["ok"])
        nord.assert_not_called()

    def test_channel_without_config_gets_an_unused_one(self):
        catalog = {"GB": [{"rel_path": "NordVPN_United_Kingdom/Standard_P2P/London/uk1.conf", "label": "uk1"},
                          {"rel_path": "NordVPN_United_Kingdom/Standard_P2P/London/uk2.conf", "label": "uk2"}]}
        with mock.patch.object(vpn_manager, "get_vpn_catalog", return_value=catalog), \
                mock.patch.object(vpn_manager, "is_vpn_config_alive", return_value=True), \
                mock.patch.object(vpn_manager, "start_wireguard_proxy", side_effect=self.fake_start):
            result = server.ensure_channel_proxy(2, country="GB")
        self.assertTrue(result["ok"])
        conn = sqlite3.connect(self.db)
        self.assertEqual(conn.execute("SELECT vpn_config FROM channels WHERE id=2").fetchone()[0],
                         "NordVPN_United_Kingdom/Standard_P2P/London/uk2.conf")
        conn.close()

    def test_no_free_config_left_is_an_error(self):
        catalog = {"GB": [{"rel_path": "NordVPN_United_Kingdom/Standard_P2P/London/uk1.conf", "label": "uk1"}]}
        with mock.patch.object(vpn_manager, "get_vpn_catalog", return_value=catalog), \
                mock.patch.object(vpn_manager, "is_vpn_config_alive", return_value=True):
            result = server.ensure_channel_proxy(2, country="GB")
        self.assertFalse(result["ok"])

    def test_idle_scan_tunnels_are_reaped_but_publish_tunnels_are_not(self):
        now = time.time()
        vpn_manager.ACTIVE_TUNNELS.update({
            1: {"proc": FakeProc(), "expires_at": now - 1},
            2: {"proc": FakeProc(), "expires_at": now + 600},
            3: {"proc": FakeProc()},
        })
        self.assertEqual(vpn_manager.reap_idle_tunnels(now), 1)
        self.assertEqual(sorted(vpn_manager.ACTIVE_TUNNELS), [2, 3])

    def test_publish_reusing_a_scan_tunnel_clears_its_expiry(self):
        vpn_manager.ACTIVE_TUNNELS[1] = {"proc": FakeProc(), "conf_rel_path": "a.conf", "socks_port": 5,
                                         "expires_at": time.time() + 600}
        with mock.patch.object(vpn_manager, "is_port_listening", return_value=True):
            vpn_manager.start_wireguard_proxy(1, "a.conf")
        self.assertNotIn("expires_at", vpn_manager.ACTIVE_TUNNELS[1])


if __name__ == "__main__":
    unittest.main()
