"""Publisher chỉ mở trình duyệt khi tunnel WireGuard gọi được TikTok (vpn_manager.start_verified_wireguard_proxy)."""
import os
import subprocess
import sys
import time
import unittest
from unittest import mock

from bkt_web import vpn_manager as vm


class VerifiedTunnelTest(unittest.TestCase):
    def setUp(self):
        self.started, self.stopped = [], []
        ports = iter(range(4000, 4100))

        def fake_start(channel_id, conf):
            port = next(ports)
            self.started.append(port)
            return {"socks_port": port, "location": "Frankfurt (de1)"}

        for patch in (mock.patch.object(vm, "start_wireguard_proxy", side_effect=fake_start),
                      mock.patch.object(vm, "stop_wireguard_proxy", side_effect=lambda cid: self.stopped.append(cid)),
                      mock.patch.object(vm.time, "sleep")):
            patch.start()
            self.addCleanup(patch.stop)

    def test_first_working_tunnel_is_returned_without_rebuilding(self):
        tunnel = vm.start_verified_wireguard_proxy(7, "de1.conf", probe=lambda port: True)
        self.assertEqual(tunnel["socks_port"], 4000)
        self.assertEqual(self.stopped, [])

    def test_slow_handshake_is_waited_for_on_the_same_tunnel(self):
        answers = iter([False, True])
        tunnel = vm.start_verified_wireguard_proxy(7, "de1.conf", probe=lambda port: next(answers))
        self.assertEqual((tunnel["socks_port"], self.started, self.stopped), (4000, [4000], []))

    def test_dead_tunnel_is_rebuilt(self):
        logs = []
        tunnel = vm.start_verified_wireguard_proxy(7, "de1.conf", probe=lambda port: port == 4001,
                                                   log=lambda m, level="info": logs.append(m))
        self.assertEqual(tunnel["socks_port"], 4001)
        self.assertEqual(self.stopped, [7])
        self.assertIn("dựng lại tunnel lần 2/3", logs[0])

    def test_gives_up_with_clear_error_and_leaves_no_tunnel(self):
        with self.assertRaisesRegex(RuntimeError, "không kết nối được tới TikTok sau 3 lần"):
            vm.start_verified_wireguard_proxy(7, "de1.conf", probe=lambda port: False)
        self.assertEqual(len(self.started), 3)
        self.assertEqual(self.stopped, [7, 7, 7])


class TunnelCapTest(unittest.TestCase):
    """Giữ số tunnel dưới giới hạn kết nối NordVPN: tắt tunnel quét dùng lâu nhất, không đụng tunnel đăng bài."""

    def setUp(self):
        self.discarded = []
        for patch in (mock.patch.dict(vm.ACTIVE_TUNNELS, clear=True),
                      mock.patch.object(vm, "_discard_tunnel", side_effect=lambda info: self.discarded.append(info["pid"])),
                      mock.patch.object(vm, "MAX_TUNNELS", 3), mock.patch.object(vm, "MAX_SCAN_TUNNELS", 2)):
            patch.start()
            self.addCleanup(patch.stop)

    def test_new_scan_tunnel_evicts_least_recently_used_scan(self):
        vm.ACTIVE_TUNNELS.update({"a": {"pid": 1, "expires_at": 200}, "b": {"pid": 2, "expires_at": 100}})
        self.assertEqual(vm._make_room_locked(scan=True), ["b"])
        self.assertEqual(self.discarded, [2])

    def test_publish_tunnel_takes_room_from_scans_but_never_from_publish(self):
        vm.ACTIVE_TUNNELS.update({"pub": {"pid": 9}, "a": {"pid": 1, "expires_at": 200}, "b": {"pid": 2, "expires_at": 100}})
        self.assertEqual(vm._make_room_locked(scan=False), ["b"])
        self.assertIn("pub", vm.ACTIVE_TUNNELS)
        vm.ACTIVE_TUNNELS.clear()
        vm.ACTIVE_TUNNELS.update({"p1": {"pid": 7}, "p2": {"pid": 8}, "p3": {"pid": 9}})
        self.assertEqual(vm._make_room_locked(scan=False), [])   # chỉ có tunnel đăng bài: không tắt gì
        self.assertEqual(len(vm.ACTIVE_TUNNELS), 3)


@unittest.skipUnless(sys.platform.startswith("linux"), "cần /proc")
class OrphanCleanupTest(unittest.TestCase):
    def test_only_wireproxy_older_than_the_app_is_killed(self):
        proc = subprocess.Popen(["bash", "-c", "exec -a wireproxy sleep 30"])
        self.addCleanup(proc.kill)
        time.sleep(0.3)
        self.assertNotIn(proc.pid, vm.cleanup_orphan_tunnels())   # trẻ hơn tiến trình test → không phải mồ côi
        self.assertIsNone(proc.poll())
        real = vm._proc_start_ticks
        with mock.patch.object(vm, "_proc_start_ticks", side_effect=lambda pid: real(pid) + (10**9 if pid == os.getpid() else 0)):
            self.assertIn(proc.pid, vm.cleanup_orphan_tunnels())
        self.assertIsNotNone(proc.wait(timeout=5))


if __name__ == "__main__":
    unittest.main()
