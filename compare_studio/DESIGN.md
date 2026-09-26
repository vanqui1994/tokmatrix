# DESIGN.md — "So Sánh Kiến Thức" template

**Concept angle:** A fast-paced myth-busting showdown — two icons face off in a top-frame
split, a bold pink-accented caption calls the verdict line by line, and a flat 2D host
physically points the answer home. Motion reads as a game-show buzzer round, not a lecture.

## Country Theme & Background System (6 Quốc Gia)

Mỗi quốc gia sở hữu **màu nền (`--bg`) riêng biệt**, **hiệu ứng ambient glow (`--glow-top`, `--glow-bottom`) độc bản** và **linh vật 2D flat chuyên biệt** phản ánh văn hoá bản địa, đồng thời đảm bảo 100% chuẩn tương phản **WCAG AA (≥ 4.5:1)**:

| Quốc gia | Mã | Nền `--bg` | Glow Trên / Dưới | Linh vật | Đặc trưng văn hoá & Bảng màu |
| :--- | :---: | :---: | :---: | :---: | :--- |
| 🇩🇪 **Đức** | `de` | `#F5EAD6`<br>(Bavarian Malt) | Amber Gold / Slate<br>`rgba(212,154,61,0.42)` / `rgba(40,50,56,0.35)` | **Dachshund Otto** | Bauhaus Slate & Bavarian Amber Gold. Chó xúc xích lạp xưởng đeo kính gọng vàng, nơ đỏ cổ điển. |
| 🇰🇷 **Hàn Quốc** | `ko` | `#E2EFE7`<br>(Celadon Jade 청자) | Dancheong Coral / Navy<br>`rgba(226,109,92,0.40)` / `rgba(31,42,62,0.32)` | **Tiger Horangi** | Hanbok Royal Navy & Dancheong Coral. Hổ dũng mãnh đeo kính xanh ngọc, sọc vằn nâu cam truyền thống. |
| 🇯🇵 **Nhật Bản** | `ja` | `#FCEBE4`<br>(Sakura Washi) | Torii Vermilion / Matcha<br>`rgba(214,69,49,0.38)` / `rgba(91,138,114,0.35)` | **Shiba Inu Hachi** | Torii Vermilion & Sumi Ink & Matcha. Chú cún Shiba má trắng urajiro, khăn bandana đỏ Torii. |
| 🇻🇳 **Việt Nam** | `vi` | `#EBDCA8`<br>(Hội An Ochre) | Ngói Bát Tràng / Xanh ngọc<br>`rgba(180,80,47,0.40)` / `rgba(62,140,119,0.35)` | **Mèo Mun Professor** | Vàng vôi phố cổ Hội An, nâu đất ấm. Giáo sư Mèo mun đeo kính xô thơm và ria mép dài kinh điển. |
| 🇫🇷 **Pháp** | `fr` | `#E6E9F2`<br>(Parisian Chalk Blue) | Bordeaux / Bistro Navy<br>`rgba(166,43,43,0.38)` / `rgba(30,41,59,0.32)` | **Coq Pierre** | Bistro Navy & Bordeaux Wine. Gà trống Gô-loa kiêu hãnh với mào đỏ Bordeaux và yếm cổ thanh lịch. |
| 🇺🇸 **Mỹ / Toàn cầu**| `en` | `#F6EDD3`<br>(Ivory Parchment) | Oxford Gold / Navy<br>`rgba(212,155,36,0.42)` / `rgba(30,40,56,0.32)` | **Owl Barnaby** | Oxford Navy & Royal Amber Gold. Cú mèo thông thái lông vũ nâu ấm, quầng mắt tròn và kính tri thức. |

### WCAG AA Contrast Compliance
Mọi màu chữ chính (`--fg`), chữ phụ (`--fg-dim`), từ khoá nhấn mạnh (`--accent-terra-ink`, `--accent-sage-ink`) trên từng nền đều được kiểm duyệt tự động qua `hyperframes check`:
- **Chữ chính trên nền:** Tương phản từ **10.5:1** đến **14.8:1** (vượt xa chuẩn 4.5:1).
- **Từ khoá nhấn mạnh trên nền:** Tương phản từ **5.3:1** đến **8.9:1** (đạt chuẩn AA).
- **Chữ trong thẻ so sánh (`--panel`):** `--fg-on-panel` tương phản từ **11.2:1** đến **13.6:1**.

## Typography

- **Be Vietnam Pro, 900** — captions, topic names, VS badge. The series now scripts in English
  and German; the family stays because the `vietnamese` subset is still required for the
  `#eyebrow` channel tag (`CHANNEL` in `.env` may contain Vietnamese diacritics, e.g.
  "Cường IT"), and the `latin` subset already covers German umlauts (ä ö ü ß, U+00C0–U+00FF).
  Original rationale: Geometric sans, heavy weight only
  (extreme weight contrast per house style), not on the banned-monoculture list. Replaces
  Montserrat: the compiler's pre-bundled embed for Montserrat only covers the "latin" unicode
  range, which drops Vietnamese tone-mark glyphs (U+1EA0-1EF9) and renders diacritics broken.
  Be Vietnam Pro is purpose-built for Vietnamese and must be embedded via explicit `@font-face`
  + `unicode-range` (vietnamese + latin subsets) in `<head>` — **not** a Google Fonts `<link>`
  (trips the `google_fonts_import` lint warning) and **not** left as a bare `font-family` name
  (silently falls back to the incomplete pre-bundled embed). See either video's `index.html`
  `<head>` for the exact `@font-face` block to copy.
- **JetBrains Mono, 700** — eyebrow tag (`#eyebrow`, text sourced from `CHANNEL` in the
  repo-root `.env` — see the `create-video` skill's `scripts/sync-channel.mjs`; default
  "SO SÁNH KIẾN THỨC"), small labels. Crosses the
  sans→mono boundary against Be Vietnam Pro (never pair two sans-serifs). Same embedding rule
  applies — JetBrains Mono also needs its "vietnamese" subset explicitly `@font-face`-embedded
  when it renders Vietnamese text (e.g. the eyebrow tag).
- Caption line size: 64px (well above the 20px in-feed floor — this is a 9:16 in-feed video).
  Topic name in cards: 44px. Eyebrow tag: 22px, uppercase, tracked +0.12em.

## Layout (1080×1920)

Three fixed horizontal zones — this split is the template's contract; only content inside
each zone changes between topics. All zone content is horizontally centered on the **canvas
center** (x=540) with symmetric left/right padding — see Safe zone below.

- **Top — comparison zone** (`y 64–824`, 760px): two **square** image cards, 450×450 each,
  40px gap, card-left at x=70, card-right at x=560 (right edge 1010, symmetric 70px margins).
  Cards sit at `top: 275` so their centre lands on y=500. A round
  VS badge (120px, left=480, top=440) sits centered on the seam, overlapping each card 40px so
  it reads as attached, not floating.

  450px is the optimal enlarged size: leaves a safe 70px symmetric margin from outer screen edges,
  fills the upper visual zone with impactful presence. Inside the card, `.card-icon` is 345px
  tall and `.icon-art` is 305×305 (images 315×315), leaving the label 46px with crisp uppercase
  readability.
- **Middle — caption zone** (`y 840–1300`, 460px): one caption line visible at a time,
  centered, max-width 860px, left=110 (symmetric 110px margins). Keyword spans get
  `--accent-pink`.
- **Bottom — avatar zone** (`y 1280–1920`, 640px): a flat 2D **black cat** host character
  (`#avatar-host` top=1280, left=330, horizontally centered like every other zone), drawn as a
  clean silhouette in `--fur` with no outline — tall pointed ears with cream inner notches, an
  SVG teardrop body that widens toward the base, oversized round cream eyes with small pupils
  set inward, round sage "professor" glasses framing them, a cream triangle nose, three long
  cream whiskers per side, thin front legs mounted *behind* the body so the shoulder seam never
  shows, two rounded hind paws (`.leg`, also behind the body, protruding past its bottom corners
  so a gap reads between them), and a long curved SVG tail sweeping left. The two ears are
  symmetric about the head's centre: centres at x=42 and x=158 inside the 200px-wide head, with
  the inner notches on the same centres. Front legs swap rotation per beat
  (point-left / point-right / shrug / explain / neutral-hold). Top raised from the original
  y=1360 so the head/face clears the platform caption/username band — see Safe zone.

  Only six ids are driven by the timeline — `#avatar-host`, `#avatar-body`, `#avatar-head`,
  `#arm-left`, `#arm-right`, `#mouth` (plus classes `.arm` / `.hand`). Every other part of the
  character is static decoration: a future restyle of the host only has to keep those six ids
  and the `pose()` / `headTilt()` / `talk()` helpers keep working untouched.

## Safe zone (platform UI overlays)

TikTok/Reels/FB in-feed chrome overlays the raw 1080×1920 frame: an engagement-icon rail near
the right edge and a caption/username/progress-bar band at the bottom. Fix this with symmetric
padding and vertical clearance, not by shifting the composition's horizontal center — an
off-center layout reads as broken on any device/platform that *doesn't* show that overlay.

| Constant        | Value  | Meaning                                                          |
| ---------------- | ------ | ------------------------------------------------------------------ |
| `SAFE_MARGIN`     | 120px  | Minimum clearance from both the left and right edge (symmetric)    |
| `SAFE_BOTTOM`     | 380px  | Clearance from the bottom edge (caption/username/progress band)    |
| horizontal center | 540    | Raw canvas center — every zone stays centered here                 |

Only the avatar's head/upper body must clear `SAFE_BOTTOM` (y ≥ 1540 is unsafe) — the lower
torso/hands may bleed under the platform band since they carry no readable information. Card
icon internals that use fixed pixel offsets (not `%`/`translateX(-50%)` centering) must be
re-checked for overflow whenever card width changes; icons built via grid `place-items:center`
with no `top`/`left` adapt automatically.

## Background layer

- Soft `--accent-pink` radial glow behind the VS badge, low opacity, gentle breathing pulse
  (finite repeat).
- Ghost eyebrow word ("SO SÁNH") oversized at 4% opacity behind the caption zone, static.
- Soft `--accent-cyan` glow behind the avatar's head, gentle breathing pulse, phase-opposed
  to the top glow (per `sine-wave-loop` phase-opposition rule).

## Motion

- **Image cards**: `spring-pop-entrance` (scale 0→1, `power3.out`, ~0.5s), staggered ~0.15s
  left-then-right. VS badge pops ~0.3s after on `spring-pop-entrance` (small hero pop).
- **Caption lines**: one line visible per beat window; each enters with `spring-pop-entrance`
  (y:24→0 + fade, `power3.out`, 0.35s) and exits with a fast fade+lift
  (`power2.in`, 0.2s) before the next line pops. Keyword spans get a quick color-set +
  scale-punch (1→1.15→1, 0.25s) timed to the line's entrance — a simplified,
  line-level cousin of `asr-keyword-glow` (no continuous per-word envelope; this is a
  30-40s fast-cut format, not a lyric-video read).
- **Avatar arms**: discrete rotation tweens per beat, `power3.out`, ~0.3s — point-left,
  point-right, shrug (both arms up+out), explain (one arm lower, open palm), neutral
  (arms at rest) for the outro hold.
- **Active-side emphasis**: during Giải A / Giải B, the inactive card dims to 85% opacity +
  scales to 0.96 and keeps the resting border `rgba(210,162,76,0.22)`; the active card holds
  full opacity, scales to 1.05, and its 3px border lights up to `#D2A24C`. The border is what
  actually names the focused card — dimming alone is easy to miss on a phone. On the payoff
  line both borders light up together. Directs the eye without a camera move (`camera-static`).

## Rhythm & Screenplay Architecture

Target total: **65–70s** per video (chuẩn hóa định dạng monetization và retention cao cấp cho TikTok >60s, YouTube Shorts, Reels). Timing hoàn toàn dựa trên VO thật từ Edge TTS (real durations), kết hợp khoảng nghỉ nhịp tính toán khoa học (intra-act 0.30s, inter-act 0.40s).

Cấu trúc kịch tính chuẩn **7 Hồi — 20 Nhịp Kịch Bản (7-Act Screenplay — 20 Beats)**:
1. **Hồi 1: Hook Kích Thích (Line 1–2, ~6s):** Giới thiệu trực diện 2 khái niệm A & B đối lập bằng hình ảnh.
2. **Hồi 2: Nút Thắt & Cảnh Báo (Line 3–4, ~7s):** Nêu tỷ lệ nhầm lẫn (90%), hậu quả sai sót, và đặt ra câu hỏi bản chất.
3. **Hồi 3: Mổ Xẻ Bên A (Line 5–8, ~13s):** Định nghĩa bản chất, cơ chế vận hành, siêu năng lực (ưu điểm), và điểm yếu chí mạng của A.
4. **Hồi 4: Bước Ngoặt Kịch Tính (Line 9, ~4s):** Cầu nối chuyển giao — giải thích vì sao điểm yếu của A thúc đẩy B ra đời.
5. **Hồi 5: Mổ Xẻ Bên B (Line 10–13, ~13s):** Định nghĩa B, cách giải quyết nhược điểm của A, siêu năng lực của B, và sự đánh đổi phải chấp nhận.
6. **Hồi 6: Đại Chiến 3 Hiệp (Line 14–17, ~13s):** So găng trực diện qua 3 tiêu chí cốt lõi (Trải nghiệm, Kỹ thuật/Độ bền, Tình huống thực chiến) + 1 câu tóm lược phân cực.
7. **Hồi 7: Quy Tắc Vàng & CTA (Line 18–20, ~12s):** Mẹo 3 giây nhớ đời (Mnemonic), Chốt hạ chân lý lựa chọn (Payoff Verdict), và Kêu gọi bình luận tương tác (Viral CTA).

*(Lưu ý: Hệ thống vẫn duy trì tương thích ngược với các video 12 dòng 30-40s cũ).* Energy: Nhịp điệu mở màn nhanh, khoảng lặng tò mò, đào sâu 2 hồi mổ xẻ, dồn dập nảy lửa ở 3 hiệp đấu, và đọng lại với quy tắc vàng dễ nhớ. Tuyệt đối không kéo dài khoảng nghỉ để câu giờ; năng lượng phải luôn được duy trì liên tục.

## Do's and don'ts

- Do keep the 3-zone layout byte-for-byte identical across topics — only text, image
  content, and the two card images change when this becomes a real template instance.
- Do keep keyword-pink reserved for the *difference*, not the topic names (topic names use
  cyan) — the color coding itself teaches the viewer where to look.
- Do keep every zone's content within the safe zone (above) — centered on x=540 with symmetric
  `SAFE_MARGIN` on both sides, avatar head clear of `SAFE_BOTTOM`.
- Don't add a 4th zone or reorder the three zones — the format's recognizability depends on
  the fixed vertical stacking (top comparison → middle caption → bottom avatar). Raising the
  avatar zone's top offset to respect `SAFE_BOTTOM` is a safe-zone fit, not a reorder.
- Don't animate more than one caption line at a time — line-by-line, never word-by-word
  (this is a fast format, not a karaoke lyric video).
