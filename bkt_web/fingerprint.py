"""
BaoSamBrowser Antidetect Fingerprint Spoofing Engine.

Tạo JavaScript init_script để tiêm vào Playwright Page trước khi mọi script của web chạy:
  1. Canvas 2D Noise: Chèn nhiễu vi mô không thể phát hiện vào toDataURL và getImageData.
  2. WebGL Spoofing: Giả lập UNMASKED_VENDOR_WEBGL và UNMASKED_RENDERER_WEBGL (Intel, Apple, NVIDIA, Google).
  3. AudioContext Noise: Thêm nhiễu tần số vi mô vào getChannelData.
  4. WebRTC IP Masking: Che giấu IP nội bộ (LAN) và thay Public IP bằng Proxy IP.
  5. ClientRects Noise: Can thiệp getBoundingClientRect thêm sai số 0.00001px.
  6. Navigator & Platform: Spoof userAgent, platform, hardwareConcurrency, deviceMemory, languages.
  7. Screen & Window: Spoof resolution, colorDepth, pixelRatio.
  8. Timezone & Locale: Cố định timezone hoặc tự động theo IP.
"""

import json
import random
from typing import Any, Dict, Optional

# Danh sách WebGL Vendor và Renderer phổ biến
WEBGL_VENDORS = [
    {
        "vendor": "Google Inc. (NVIDIA)",
        "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    {
        "vendor": "Google Inc. (NVIDIA)",
        "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    {
        "vendor": "Google Inc. (Intel)",
        "renderer": "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    {
        "vendor": "Google Inc. (Intel)",
        "renderer": "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    },
    {
        "vendor": "Google Inc. (Apple)",
        "renderer": "ANGLE (Apple, Apple M1, OpenGL 4.1)",
    },
    {
        "vendor": "Google Inc. (Apple)",
        "renderer": "ANGLE (Apple, Apple M2, OpenGL 4.1)",
    },
    {
        "vendor": "Google Inc. (Apple)",
        "renderer": "ANGLE (Apple, Apple M3, OpenGL 4.1)",
    },
]

COMMON_RESOLUTIONS = [
    (1920, 1080),
    (1536, 864),
    (1440, 900),
    (1366, 768),
    (2560, 1440),
    (1680, 1050),
    (1280, 720),
]


def _safe_int(val: Any, default: int = 1) -> int:
    try:
        if val is None or val == "":
            return default
        return int(val)
    except Exception:
        return default


def generate_fingerprint_script(profile: Dict[str, Any]) -> str:
    """
    Tạo đoạn JavaScript tiêm vào trang bằng `page.add_init_script`.
    Nhận tham số profile từ CSDL (tương ứng với schema Profiles của BaoSamBrowser).
    """
    os_type = _safe_int(profile.get("OsType") or profile.get("os_type"), 1)  # 1: Windows, 2: macOS, 3: Linux
    canvas_mode = _safe_int(profile.get("CanvasMode") or profile.get("canvas_mode"), 1)  # 0: Off, 1: Noise, 2: Block
    webgl_mode = _safe_int(profile.get("WebglImageMode") or profile.get("webgl_image_mode"), 1)  # 0: Off, 1: Noise
    audio_mode = _safe_int(profile.get("AudioMode") or profile.get("audio_mode"), 1)  # 0: Off, 1: Noise
    client_rect_mode = _safe_int(profile.get("ClientRectMode") or profile.get("client_rect_mode"), 1)  # 0: Off, 1: Noise
    webrtc_mode = _safe_int(profile.get("WebrtcMode") or profile.get("webrtc_mode"), 1)  # 0: Real, 1: Altered, 2: Disable
    fixed_public_ip = profile.get("FixedWebrtcPublicIp") or profile.get("fixed_webrtc_public_ip") or ""
    
    # Custom UserAgent / Platform
    ua = profile.get("CustomUserAgent") or profile.get("custom_user_agent") or ""
    if not ua:
        if os_type == 2:
            ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        elif os_type == 3:
            ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        else:
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"

    if os_type == 2:
        platform = "MacIntel"
        app_version = ua.replace("Mozilla/", "")
    elif os_type == 3:
        platform = "Linux x86_64"
        app_version = ua.replace("Mozilla/", "")
    else:
        platform = "Win32"
        app_version = ua.replace("Mozilla/", "")

    # Hardware Concurrency & Memory
    cores = _safe_int(profile.get("Cores") or profile.get("cores"), 8)
    memory = _safe_int(profile.get("Memory") or profile.get("memory"), 8)

    # WebGL Vendor & Renderer
    gpu = random.choice(WEBGL_VENDORS)
    if os_type == 2:
        gpu = random.choice([v for v in WEBGL_VENDORS if "Apple" in v["vendor"]] or WEBGL_VENDORS)
    webgl_vendor = profile.get("WebglVendor", profile.get("webgl_vendor", gpu["vendor"]))
    webgl_renderer = profile.get("WebglRenderer", profile.get("webgl_renderer", gpu["renderer"]))

    # Language
    lang = profile.get("FixedLanguage", profile.get("fixed_language", "en-US"))
    if not lang:
        lang = "en-US"
    languages = [lang]
    if "-" in lang:
        languages.append(lang.split("-")[0])

    # Screen resolution
    res_str = profile.get("Resolution", profile.get("resolution", ""))
    if res_str and "x" in res_str:
        try:
            sw, sh = [int(x.strip()) for x in res_str.split("x")[:2]]
        except Exception:
            sw, sh = random.choice(COMMON_RESOLUTIONS)
    else:
        sw, sh = random.choice(COMMON_RESOLUTIONS)

    # Seed for persistent noise per profile
    prof_id = str(profile.get("Id", profile.get("id", "default")))
    seed = sum(ord(c) for c in prof_id) % 1000 + 1

    js_code = f"""
    (() => {{
        'use strict';

        const SEED = {seed};
        const pseudoRandom = (offset) => {{
            const x = Math.sin(SEED + offset) * 10000;
            return x - Math.floor(x);
        }};

        // -------------------------------------------------------------
        // 1. NAVIGATOR OVERRIDES
        // -------------------------------------------------------------
        try {{
            Object.defineProperty(navigator, 'userAgent', {{ get: () => {json.dumps(ua)}, configurable: true }});
            Object.defineProperty(navigator, 'appVersion', {{ get: () => {json.dumps(app_version)}, configurable: true }});
            Object.defineProperty(navigator, 'platform', {{ get: () => {json.dumps(platform)}, configurable: true }});
            Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {cores}, configurable: true }});
            Object.defineProperty(navigator, 'deviceMemory', {{ get: () => {memory}, configurable: true }});
            Object.defineProperty(navigator, 'language', {{ get: () => {json.dumps(lang)}, configurable: true }});
            Object.defineProperty(navigator, 'languages', {{ get: () => {json.dumps(languages)}, configurable: true }});
            Object.defineProperty(navigator, 'webdriver', {{ get: () => undefined, configurable: true }});

            if (navigator.userAgentData) {{
                Object.defineProperty(navigator, 'userAgentData', {{
                    get: () => ({{
                        brands: [
                            {{ brand: 'Chromium', version: '128' }},
                            {{ brand: 'Google Chrome', version: '128' }},
                            {{ brand: 'Not;A=Brand', version: '24' }}
                        ],
                        mobile: false,
                        platform: {json.dumps("macOS" if os_type == 2 else ("Linux" if os_type == 3 else "Windows"))},
                        getHighEntropyValues: async (hints) => ({{
                            architecture: 'x86',
                            bitness: '64',
                            brands: [
                                {{ brand: 'Chromium', version: '128' }},
                                {{ brand: 'Google Chrome', version: '128' }},
                                {{ brand: 'Not;A=Brand', version: '24' }}
                            ],
                            mobile: false,
                            model: '',
                            platform: {json.dumps("macOS" if os_type == 2 else ("Linux" if os_type == 3 else "Windows"))},
                            platformVersion: '10.0.0',
                            uaFullVersion: '128.0.6613.120'
                        }})
                    }}),
                    configurable: true
                }});
            }}
        }} catch (e) {{}}

        // -------------------------------------------------------------
        // 2. SCREEN & WINDOW PROPERTIES
        // -------------------------------------------------------------
        try {{
            Object.defineProperty(screen, 'width', {{ get: () => {sw}, configurable: true }});
            Object.defineProperty(screen, 'height', {{ get: () => {sh}, configurable: true }});
            Object.defineProperty(screen, 'availWidth', {{ get: () => {sw}, configurable: true }});
            Object.defineProperty(screen, 'availHeight', {{ get: () => {sh - 40}, configurable: true }});
            Object.defineProperty(screen, 'colorDepth', {{ get: () => 24, configurable: true }});
            Object.defineProperty(screen, 'pixelDepth', {{ get: () => 24, configurable: true }});
        }} catch (e) {{}}

        // -------------------------------------------------------------
        // 3. CANVAS 2D NOISE (CanvasMode == 1)
        // -------------------------------------------------------------
        {"if (true) {" if canvas_mode == 1 else "if (false) {"}
            try {{
                const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
                HTMLCanvasElement.prototype.toDataURL = function (type, ...args) {{
                    const ctx = this.getContext('2d');
                    if (ctx && this.width > 0 && this.height > 0) {{
                        try {{
                            const img = ctx.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
                            for (let i = 0; i < img.data.length; i += 4) {{
                                const noise = Math.floor(pseudoRandom(i) * 3) - 1;
                                img.data[i] = Math.min(255, Math.max(0, img.data[i] + noise));
                            }}
                            ctx.putImageData(img, 0, 0);
                        }} catch (err) {{}}
                    }}
                    return originalToDataURL.apply(this, [type, ...args]);
                }};

                const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
                CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {{
                    const res = originalGetImageData.apply(this, [x, y, w, h]);
                    for (let i = 0; i < res.data.length; i += 8) {{
                        const noise = Math.floor(pseudoRandom(i + 50) * 3) - 1;
                        res.data[i] = Math.min(255, Math.max(0, res.data[i] + noise));
                    }}
                    return res;
                }};
            }} catch (e) {{}}
        }}

        // -------------------------------------------------------------
        // 4. WEBGL VENDOR & RENDERER SPOOFING + NOISE
        // -------------------------------------------------------------
        try {{
            const getParamOrig = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function (param) {{
                // UNMASKED_VENDOR_WEBGL: 0x9245
                if (param === 37445) return {json.dumps(webgl_vendor)};
                // UNMASKED_RENDERER_WEBGL: 0x9246
                if (param === 37446) return {json.dumps(webgl_renderer)};
                return getParamOrig.apply(this, [param]);
            }};

            if (window.WebGL2RenderingContext) {{
                const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function (param) {{
                    if (param === 37445) return {json.dumps(webgl_vendor)};
                    if (param === 37446) return {json.dumps(webgl_renderer)};
                    return getParam2Orig.apply(this, [param]);
                }};
            }}
        }} catch (e) {{}}

        // -------------------------------------------------------------
        // 5. AUDIOCONTEXT NOISE (AudioMode == 1)
        // -------------------------------------------------------------
        {"if (true) {" if audio_mode == 1 else "if (false) {"}
            try {{
                const origGetChannelData = AudioBuffer.prototype.getChannelData;
                AudioBuffer.prototype.getChannelData = function (channel) {{
                    const data = origGetChannelData.apply(this, [channel]);
                    for (let i = 0; i < data.length; i += 100) {{
                        data[i] += (pseudoRandom(i + 100) - 0.5) * 0.0000001;
                    }}
                    return data;
                }};
            }} catch (e) {{}}
        }}

        // -------------------------------------------------------------
        // 6. CLIENTRECT NOISE (ClientRectMode == 1)
        // -------------------------------------------------------------
        {"if (true) {" if client_rect_mode == 1 else "if (false) {"}
            try {{
                const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
                Element.prototype.getBoundingClientRect = function () {{
                    const rect = origGetBoundingClientRect.apply(this);
                    const delta = (pseudoRandom(10) - 0.5) * 0.00001;
                    return new DOMRect(
                        rect.x + delta,
                        rect.y + delta,
                        rect.width + delta,
                        rect.height + delta
                    );
                }};
            }} catch (e) {{}}
        }}

        // -------------------------------------------------------------
        // 7. WEBRTC SPOOFING / BLOCKING
        // -------------------------------------------------------------
        {"if (true) {" if webrtc_mode == 2 else "if (false) {"}
            // Mode 2: Disable WebRTC
            try {{
                window.RTCPeerConnection = undefined;
                window.webkitRTCPeerConnection = undefined;
                window.RTCSessionDescription = undefined;
                window.RTCIceCandidate = undefined;
            }} catch (e) {{}}
        }} {"else if (true) {" if webrtc_mode == 1 and fixed_public_ip else "else if (false) {"}
            // Mode 1: Altered / Masked WebRTC IP
            try {{
                const origRTC = window.RTCPeerConnection;
                if (origRTC) {{
                    const publicIp = {json.dumps(fixed_public_ip)};
                    window.RTCPeerConnection = function (config) {{
                        const pc = new origRTC(config);
                        const origCreateOffer = pc.createOffer;
                        pc.createOffer = async function (options) {{
                            const offer = await origCreateOffer.apply(this, [options]);
                            if (offer && offer.sdp) {{
                                offer.sdp = offer.sdp.replace(
                                    /c=IN IP4 [0-9.]+/g,
                                    'c=IN IP4 ' + publicIp
                                );
                            }}
                            return offer;
                        }};
                        return pc;
                    }};
                    window.RTCPeerConnection.prototype = origRTC.prototype;
                }}
            }} catch (e) {{}}
        }}

        // -------------------------------------------------------------
        // 8. CHROME OBJECT RESTORATION
        // -------------------------------------------------------------
        try {{
            if (!window.chrome) {{
                window.chrome = {{
                    app: {{ isInstalled: false, InstallState: {{ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }}, RunningState: {{ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }} }},
                    runtime: {{
                        OnInstalledReason: {{ CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }},
                        OnRestartRequiredReason: {{ APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }},
                        PlatformArch: {{ ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
                        PlatformNaclArch: {{ ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
                        PlatformOs: {{ ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }},
                        RequestUpdateCheckStatus: {{ NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }}
                    }}
                }};
            }}
        }} catch (e) {{}}

    }})();
    """
    return js_code


def generate_user_agent(os_type: int = 1, browser_version: str = "132") -> str:
    """Tạo User-Agent hợp lệ theo hệ điều hành và phiên bản Chrome."""
    clean_ver = str(browser_version).split(".")[0] or "132"
    if os_type == 2:  # Mac
        return f"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{clean_ver}.0.0.0 Safari/537.36"
    elif os_type == 3:  # Linux
        return f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{clean_ver}.0.0.0 Safari/537.36"
    else:  # Windows
        return f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{clean_ver}.0.0.0 Safari/537.36"


def generate_random_fingerprint_dict(os_type: int = 1, browser_version: str = "128") -> Dict[str, Any]:
    """Sinh bộ thông số vân tay ngẫu nhiên nhưng hợp lệ chuẩn GPM Login."""
    ua = generate_user_agent(os_type, browser_version)
    if os_type == 2:  # Mac
        gpu = random.choice([v for v in WEBGL_VENDORS if "Apple" in v["vendor"]] or WEBGL_VENDORS)
    elif os_type == 3:  # Linux
        ua = f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{browser_version}.0.0.0 Safari/537.36"
        gpu = random.choice([v for v in WEBGL_VENDORS if "Intel" in v["vendor"] or "NVIDIA" in v["vendor"]] or WEBGL_VENDORS)
    else:  # Windows
        ua = f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{browser_version}.0.0.0 Safari/537.36"
        gpu = random.choice([v for v in WEBGL_VENDORS if "NVIDIA" in v["vendor"] or "Intel" in v["vendor"]] or WEBGL_VENDORS)

    sw, sh = random.choice(COMMON_RESOLUTIONS)
    cores = random.choice([4, 6, 8, 12, 16])
    memory = random.choice([8, 16, 32])

    return {
        "OsType": os_type,
        "BrowserVersion": browser_version,
        "CustomUserAgent": ua,
        "CanvasMode": 1,
        "WebglImageMode": 1,
        "WebglVendor": gpu["vendor"],
        "WebglRenderer": gpu["renderer"],
        "AudioMode": 1,
        "WebrtcMode": 1,
        "ClientRectMode": 1,
        "Resolution": f"{sw}x{sh}",
        "Cores": cores,
        "Memory": memory,
        "FixedLanguage": "en-US",
        "GeolocationMode": 2,
        "TimezoneBaseOnIp": 1,
    }

