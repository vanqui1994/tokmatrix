# TikTok Metadata Specification & Processing Rules

Tài liệu tham chiếu chuẩn hóa các trường dữ liệu nội bộ (Metadata) trích xuất từ TikTok API / Scraping phục vụ bóc tách phân loại, làm sạch dữ liệu và phát hiện vi phạm.

---

## 1. Category Mapping (categoryType)

Trường categoryType (integer) đại diện cho danh mục cấp cao được cố định trong kiến trúc core của ByteDance/TikTok.

### 1.1 Bảng ánh xạ giá trị (Lookup Table)

| Value | Identifier | Tên tiếng Việt | Ghi chú |
| :--- | :--- | :--- | :--- |
| 0 | DEFAULT_UNDEFINED | Mặc định / Chưa phân loại | Giá trị fallback khi hệ thống không gắn nhãn |
| 100 | ANIMATION_COMICS | Hoạt hình & Truyện tranh | Anime, Manga, hoạt họa 2D/3D |
| 101 | PERFORMANCE | Biểu diễn nghệ thuật | Biểu diễn sân khấu, tài năng |
| 102 | BEAUTY_CARE | Chăm sóc sắc đẹp | Makeup, skincare, mỹ phẩm |
| 103 | GAME | Trò chơi điện tử | Stream game, highlight, review game |
| 104 | COMEDY | Hài hước & Giải trí | Tiểu phẩm hài, troll, tình huống vui |
| 105 | DAILY_LIFE | Đời sống thường ngày | Vlogs, sinh hoạt, phong cách sống |
| 106 | FAMILY | Gia đình & Con cái | Chăm sóc con, gia đình |
| 107 | `EMOTIONAL_RELATIONSHIP`| Mối quan hệ tình cảm | Tình yêu, đôi lứa, tâm sự |
| 108 | DRAMA | Phim ngắn / Tình huống | Kịch bản, web drama ngắn |
| 109 | DRESS_UP | Thời trang & Phối đồ | OOTD, biến hình trang phục |
| 110 | DUBBING | Lồng tiếng & POV | Nhại giọng, diễn xuất theo audio |
| 111 | FOOD | Ẩm thực & Nấu ăn | Mukbang, hướng dẫn nấu ăn, review |
| 112 | SPORTS | Thể thao | Bóng đá, võ thuật, thể thao đối kháng |
| 113 | ANIMALS | Động vật & Thú cưng | Chó, mèo, động vật hoang dã |
| 114 | SOCIETY | Đời sống xã hội | Tin tức, thời sự, sự kiện cộng đồng |
| 115 | CAR | Xe cộ | Ô tô, xe máy, review phương tiện |
| 116 | EDUCATION | Giáo dục & Kiến thức | STEM, học ngoại ngữ, mẹo học tập |
| 117 | FITNESS_HEALTH | Thể hình & Sức khỏe | Gym, yoga, rèn luyện thể chất |
| 118 | TECHNOLOGY | Công nghệ & Thiết bị | Review công nghệ, thủ thuật PC/Mobile |
| 119 | SINGING_DANCING | Ca hát & Nhảy múa | Cover nhạc, vũ đạo trending |
| 120 | ALL_GENERAL | Toàn bộ / Tổng hợp | Dùng trong Request parameter để lấy feed hỗn hợp |

---

## 2. Sub-niche Classification (diversificationId)

Trường diversificationId (integer) là mã phân loại ngách sâu (Sub-niche) do mô hình AI của TikTok tạo ra nhằm đa dạng hóa bảng tin FYP.

### 2.1 Quy luật phân dải mã (Range Hierarchy)

* **1 – 99:** Danh mục thô cấp hệ thống (Legacy / Broad categories).
* **10000 – 10020:** Âm nhạc & Trào lưu biểu diễn (10001: Dance Challenge, 10005: Lip-sync/Cover).
* **10021 – 10040:** Đời sống & Vlogs (10023: Daily Vlog, 10032: ASMR Cleaning, 10035: Storytelling).
* **10041 – 10060:** Du lịch & Ngoài trời (10043: Itinerary, 10048: Camping/Survival, 10055: Check-in).
* **10061 – 10080:** Tình cảm & Kịch bản (10072: Drama ngắn, 10075: Couple/Tâm sự tình yêu, 10078: Tình bạn).
* **10081 – 10110:** Ẩm thực & Nấu nướng (10082: Cooking Tutorial, 10088: Mukbang, 10102: Food Review).
* **10111 – 10150:** Gaming & Thiết bị (10115: Game Highlight, 10122: Thủ thuật phần mềm, 10135: Unboxing).

---

## 3. Policy & Trust Rules (penaltyContext)

Khối dữ liệu phản ánh phán quyết của hệ thống *Trust & Safety (T&S)* và thuật toán trọng tài kiểm duyệt.

### 3.1 Ý nghĩa các trường dữ liệu

| Key | Type | Ý nghĩa kiểm duyệt |
| :--- | :--- | :--- |
| status | integer | Trạng thái tổng quát của đợt kiểm duyệt T&S. |
| tns_status | string/int | Trạng thái kiểm duyệt an toàn nội dung (Trust & Safety). |
| video_status | integer | Vòng đời thực thể video trên cơ sở dữ liệu. |
| reviewed | string/int | Đã qua người thật duyệt thủ công hay chưa (0: Chưa, 1: Đã duyệt). |
| ec_global_verdict | integer | Đánh giá điều kiện gắn link giỏ hàng / TikTok Shop. |
| arb_content_safety_status | integer | Kết quả kiểm duyệt từ Arbitration Engine (Bản quyền, Reup, Spam). |
| display_penalty_type | string/int | Loại hình phạt can thiệp trực tiếp lên giao diện hiển thị. |
| display_ui_type | string/int | Kiểu giao diện áp dụng cho các hạn chế hiển thị. |
| display_policy | integer | Chính sách giới hạn khu vực / nguồn phân phối. |

### 3.2 Bảng mã phán quyết chi tiết

#### A. An toàn nội dung (tns_status, status)
* 102: *Pass / Clean* – Video an toàn, được đẩy vào luồng phân phối tự nhiên.
* 101, 103: *Pending* – Video đang nằm trong hàng đợi quét sâu (Queue).
* 201 – 205: *Restricted* – Cảnh báo vi phạm nhẹ/nhạy cảm (Giới hạn độ tuổi 18+, che mờ cảnh báo).
* 301 – 305: *Severe Violation* – Vi phạm nghiêm trọng tiêu chuẩn cộng đồng, bị gỡ (Takedown).

#### B. Bản quyền & Tính nguyên bản (arb_content_safety_status)
* 102: *Normal* – Nội dung nguyên bản, không tranh chấp.
* 200 – 204: *Audio Copyright Flag* – Vi phạm bản quyền âm thanh (dẫn tới bị tắt tiếng).
* 301, 302: *Duplicate / Low Quality* – Bị bắt Reup, quét trùng video hash (bị hạn chế phân phối/0 view).

#### C. Thực thể video (video_status)
* 10: *Active / Public* – Video công khai bình thường.
* 1: *User Deleted* – Người dùng đã xóa.
* 2: *Private* – Đặt chế độ riêng tư hoặc tạm ẩn.
* 4: *Banned* – Bị hệ thống khóa do vi phạm.
* 7, 8: *Processing Mute* – Đang xử lý bóc tách hoặc xóa luồng âm thanh vi phạm.

#### D. Can thiệp hiển thị (display_penalty_type)
* "0": *None* – Không bị áp chế tài hiển thị.
* "1": *Muted* – Tắt tiếng toàn bộ track âm thanh do bản quyền.
* "2": *Sensitive Overlay* – Đặt màn che mờ cảnh báo nhạy cảm.
* "3": *Shadowban / Suppression* – Chặn phân phối lên FYP/Explore, chỉ xem được tại Profile.
* "4": *Feature Restriction* – Khóa tương tác Duet, Stitch, Share.

#### E. Thương mại điện tử (ec_global_verdict)
* 1: *Approved* – Đủ điều kiện gắn link TikTok Shop / Affiliate.
* 0: *Ineligible* – Chưa đủ điều kiện kích hoạt giỏ hàng.
* 2: *Rejected / Suspended* – Bị từ chối hoặc thu hồi giỏ hàng do vi phạm quy chuẩn thương mại.

---

## 4. Logic Pipeline (Pseudo-code & Rule Engine)

Dưới đây là logic chuẩn để tích hợp vào module tiền xử lý dữ liệu:

```python
def evaluate_tiktok_video(record: dict) -> dict:
    penalty = record.get("penaltyContext", {})
    
    # 1. Trích xuất chỉ số
    tns_status = int(penalty.get("tns_status", 102))
    arb_status = int(penalty.get("arb_content_safety_status", 102))
    video_status = int(penalty.get("video_status", 10))
    display_penalty = str(penalty.get("display_penalty_type", "0"))
    ec_verdict = int(penalty.get("ec_global_verdict", 0))
    
    # 2. Đánh giá tính toàn vẹn (Flags)
    is_active = (video_status == 10)
    is_clean = (tns_status == 102 and arb_status == 102 and display_penalty == "0")
    is_muted = (arb_status in range(200, 205) or display_penalty == "1")
    is_reup = (arb_status in [301, 302])
    is_shadowbanned = (display_penalty == "3")
    is_shop_eligible = (ec_verdict == 1 and is_clean)
    
    # 3. Phán quyết phân loại
    if not is_active:
        action = "DISCARD_UNAVAILABLE"
    elif not is_clean:
        if is_reup:
            action = "FLAG_REUP_SUPPRESSED"
        elif is_muted:
            action = "FLAG_AUDIO_COPYRIGHT"
        elif is_shadowbanned:
            action = "FLAG_FYP_SHADOWBAN"
        else:
            action = "FLAG_POLICY_VIOLATION"
    else:
        action = "QUALIFIED_NORMAL"
        
    return {
        "action": action,
        "is_clean": is_clean,
        "is_shop_eligible": is_shop_eligible,
        "category_id": record.get("categoryType"),
        "sub_niche_id": record.get("diversificationId")
    }