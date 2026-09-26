# MASTER SPECIFICATION — AI VIDEO FACTORY & CONTENT OS (180 TIKTOK CHANNELS)
## TÀI LIỆU ĐẶC TẢ KỸ THUẬT CHO CODEX TRIỂN KHAI MÃ NGUỒN (TECHNICAL IMPLEMENTATION SPEC)

> **Dự án**: SSMATool TikTok / Compare Studio — Autonomous Multi-Channel Video Factory  
> **Phiên bản tài liệu**: 2.0 (Codex Implementation Spec)  
> **Mục tiêu**: Xây dựng hệ điều hành nội dung tự động vận hành mạng lưới 180 kênh TikTok chia thành 18 Niche (tối đa 10 kênh/niche) với nguyên tắc **nội dung không trùng lặp (Zero Semantic Duplicate)**, **tận dụng 100% 10 Native Canvas Video Engines**, và **vận hành bền bỉ qua Job Orchestrator có khả năng resume từng phân cảnh**.

---

# MỤC LỤC
1. [Tổng quan Kiến trúc Hệ thống & Codebase Context](#1-tổng-quan-kiến-trúc-hệ-thống--codebase-context)
2. [Cấu trúc Thư mục Triển khai (Directory Structure)](#2-cấu-trúc-thư-mục-triển-khai-directory-structure)
3. [Cơ sở Dữ liệu & Data Models (SQLite DDL & Schemas)](#3-cơ-sở-dữ-liệu--data-models-sqlite-ddl--schemas)
4. [Bảng Ma Trận Tương Thích Hoàn Chỉnh (18 Niches × 10 Engines)](#4-bảng-ma-trận-tương-thích-hoàn-chỉnh-18-niches--10-engines)
5. [Đặc tả Schema Channel DNA & Presets Mẫu](#5-đặc-tả-schema-channel-dna--presets-mẫu)
6. [Đặc tả Chi tiết 8 Tầng Xử Lý (8 Layers Specification)](#6-đặc-tả-chi-tiết-8-tầng-xử-lý-8-layers-specification)
   - [Layer 1: Topic Intelligence](#layer-1-topic-intelligence)
   - [Layer 2: Channel DNA & Selector](#layer-2-channel-dna--selector)
   - [Layer 3: Story Engine (Angle, Blueprint, Script, Storyboard)](#layer-3-story-engine)
   - [Layer 4: Creative Engine (Visual Director, Image Queue, Voices, Audio)](#layer-4-creative-engine)
   - [Layer 5: QA Engine (Script QA, Similarity Check, Asset QA, Video QA)](#layer-5-qa-engine)
   - [Layer 6: Job Orchestrator & State Machine (Scene Resume)](#layer-6-job-orchestrator--state-machine)
   - [Layer 7: Publish Manager & Staggered Scheduling](#layer-7-publish-manager--staggered-scheduling)
   - [Layer 8: Analytics & Learning Loop](#layer-8-analytics--learning-loop)
7. [Giao tiếp API & CLI (`tools/batch-matrix.mjs` & FastAPI Routes)](#7-giao-tiếp-api--cli-toolsbatch-matrixmjs--fastapi-routes)
8. [Tích hợp Giao diện Web (UI Workstation)](#8-tích-hợp-giao-diện-web-ui-workstation)
9. [Lộ trình Triển khai Chi tiết Cho Codex (7 Sprints & Acceptance Criteria)](#9-lộ-trình-triển-khai-chi-tiết-cho-codex-7-sprints--acceptance-criteria)

---

# 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG & CODEBASE CONTEXT

### 1.1 Môi trường Vận hành Đang Có
- **Backend Host**: Python 3.10+ FastAPI chạy tại `bkt_web/server.py` (Port 8080).
- **Studio Bridge**: `compare_studio/tools/studio-bridge.mjs` là cầu nối one-shot stdin/stdout JSON từ Python sang các thư viện Node.js ESM.
- **10 Native Video Engines** (HyperFrames HTML5 Canvas) nằm trong `compare_studio/tools/`:
  - `folklore` (`create-folklore-video.mjs`, `generate-folklore-topic.mjs`)
  - `mystery` (`create-mystery-video.mjs`, `generate-mystery-topic.mjs`)
  - `newspaper` (`create-newspaper-video.mjs`, `generate-newspaper-topic.mjs`)
  - `vox` (`create-vox-video.mjs`, `generate-vox-topic.mjs`)
  - `chalk` (`create-chalk-video.mjs`, `generate-chalk-topic.mjs`)
  - `science` (`create-science-video.mjs`, `generate-science-topic.mjs`)
  - `survival` (`create-survival-video.mjs`, `generate-survival-topic.mjs`)
  - `tierlist` (`create-tierlist-video.mjs`, `generate-tierlist-topic.mjs`)
  - `kinetic` (`create-kinetic-video.mjs`, `generate-kinetic-topic.mjs`)
  - `wildlife` / `compare` (`create-wildlife-video.mjs` / `create-video.mjs`)
- **Xưởng Tạo Ảnh AI**: `bkt_web/image_routes.py` và `compare_studio/tools/antigravity-images.mjs` (Antigravity Queue sinh ảnh 9:16).
- **Hệ thống TTS & Âm thanh**: `compare_studio/tools/voices.mjs` (CapCut TTS API), `auto-sfx.mjs`, `soundscapes.mjs`.
- **Hệ thống Đăng TikTok**: `bkt_web/publish_flow.py`, `publish_kit.py`, quản lý qua SQLite `bkt_channels.db`.

### 1.2 Nguyên Tắc Cốt Lõi Khi Triển Khai Mã Nguồn
1. **Không phá vỡ các chức năng cũ**: Các lệnh đơn lẻ (`create-video.mjs`, web UI hiện tại) vẫn phải hoạt động bình thường.
2. **Không gán cứng kênh vào template**: Sử dụng **Compatibility Matrix** để ánh xạ động Niche $\rightarrow$ Topic $\rightarrow$ Angle $\rightarrow$ Engine $\rightarrow$ Channel DNA.
3. **Orchestrator có khả năng Resume**: Mỗi video là một `Job` chia làm nhiều phân cảnh (`Scene`). Lỗi cảnh nào chỉ sinh/render lại cảnh đó, không sinh lại từ đầu.
4. **Content Registry kiểm soát trùng lặp**: Kịch bản bắt buộc qua bước tính khoảng cách vector/ngữ nghĩa trước khi đưa vào hàng đợi sản xuất hình ảnh.

---

# 2. CẤU TRÚC THƯ MỤC TRIỂN KHAI (DIRECTORY STRUCTURE)

Codex sẽ tạo các thư mục và file mới theo cấu trúc chuẩn hoá sau:

```text
compare_studio/
├── config/
│   ├── niches/                      # Cấu hình 18 Niche (YAML)
│   │   ├── 01_folklore.yaml
│   │   ├── 02_mystery.yaml
│   │   ├── 03_deep_space.yaml
│   │   └── ... (đến 18)
│   ├── channels/                    # Cấu hình Channel DNA cho 180 kênh (YAML)
│   │   ├── space_01.yaml
│   │   ├── space_02.yaml
│   │   └── ...
│   ├── blueprints/                  # Cấu trúc câu chuyện mẫu (Narrative Blueprints)
│   │   ├── mystery_reveal.yaml
│   │   ├── science_explainer.yaml
│   │   ├── investigative_dossier.yaml
│   │   ├── survival_simulation.yaml
│   │   ├── tierlist_debate.yaml
│   │   └── rapid_facts_30s.yaml
│   ├── styles/                      # Style Bibles cho Xưởng Tạo Ảnh AI
│   │   ├── dark_mystery_v1.yaml
│   │   ├── cosmic_space_v1.yaml
│   │   ├── vintage_archive_v1.yaml
│   │   ├── modern_vox_v1.yaml
│   │   └── folklore_ink_v1.yaml
│   └── compatibility_matrix.yaml    # Bảng điểm 18 Niches × 10 Engines
│
├── matrix/                          # Package Core cho AI Video Factory
│   ├── planner/
│   │   ├── topic-pool.mjs           # Quản lý kho chủ đề (evergreen, trending)
│   │   ├── angle-generator.mjs      # Sinh 10 góc nhìn độc bản từ 1 đề tài
│   │   └── template-selector.mjs    # Lọc engine dựa trên điểm Compatibility Matrix
│   ├── story/
│   │   ├── blueprint-engine.mjs     # Ráp sườn kịch bản theo nhịp giữ chân
│   │   ├── script-generator.mjs     # Gọi LLM sinh thoại & scene description
│   │   └── storyboard-compiler.mjs  # Chuẩn hoá thành JSON Storyboard 12 cảnh
│   ├── creative/
│   │   ├── visual-director.mjs      # Phân tích ý đồ cảnh & chọn Style Bible
│   │   ├── prompt-compiler.mjs      # Gộp Scene Description + Style Tag + Negative
│   │   ├── asset-manager.mjs        # Đẩy việc vào Antigravity Queue & map file ảnh
│   │   └── audio-orchestrator.mjs   # Tạo TTS voice, mix ambient soundscape & auto-SFX
│   ├── qa/
│   │   ├── script-qa.mjs            # Kiểm tra độ dài, hook, câu cấm, an toàn
│   │   ├── similarity-check.mjs     # So khớp cosine similarity với Content Registry
│   │   ├── asset-qa.mjs             # Kiểm tra ảnh đủ 9:16, không hỏng, đúng tông
│   │   └── video-qa.mjs             # Kiểm tra MP4 không đen hình, âm thanh không clip
│   └── orchestrator/
│       ├── job-manager.mjs          # Quản lý State Machine & ghi trạng thái Job
│       ├── queue-worker.mjs         # Worker chạy ngầm có throttling concurrency
│       └── scene-resumer.mjs        # Khôi phục render từng phân cảnh lỗi
│
├── tools/
│   ├── batch-matrix.mjs             # CLI Command điều phối toàn bộ mẻ sản xuất
│   └── studio-bridge.mjs            # Bổ sung các op mới phục vụ API
│
└── bkt_web/
    ├── matrix_routes.py             # FastAPI routes quản lý Jobs, Batches, Registry
    ├── matrix_db.py                 # SQLite database helper cho matrix system
    └── publish_flow.py              # Đã có - tích hợp thêm metadata matrix
```

---

# 3. CƠ SỞ DỮ LIỆU & DATA MODELS (SQLITE DDL & SCHEMAS)

Hệ thống sử dụng SQLite đặt tại `bkt_web/storage/matrix_factory.db` (chạy chế độ `WAL` mode để hỗ trợ đọc ghi đồng thời cao).

### 3.1 DDL Bảng Cơ Sở Dữ Liệu (`matrix_db.py`)

```sql
-- Kích hoạt WAL mode
PRAGMA journal_mode=WAL;

-- 1. Quản lý Kho Chủ Đề (Topic Pool)
CREATE TABLE IF NOT EXISTS topics (
    topic_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    niche_id TEXT NOT NULL,
    category TEXT DEFAULT 'evergreen', -- evergreen, trending, historical, seasonal
    priority REAL DEFAULT 0.5,
    status TEXT DEFAULT 'READY',        -- READY, IN_PROGRESS, EXHAUSTED, ARCHIVED
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. Quản lý Kênh & Channel DNA (180 Kênh)
CREATE TABLE IF NOT EXISTS channels (
    channel_id TEXT PRIMARY KEY,
    niche_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    tiktok_account_id TEXT,             -- Map sang bkt_channels.db
    persona_tone TEXT NOT NULL,
    preferred_voice_id TEXT NOT NULL,
    visual_style_id TEXT NOT NULL,
    cut_rate_seconds REAL DEFAULT 2.5,
    status TEXT DEFAULT 'ACTIVE',       -- ACTIVE, PAUSED, RESTRICTED
    created_at INTEGER NOT NULL
);

-- 3. Sổ Đăng Ký Nội Dung & Chống Trùng Lặp (Content Registry)
CREATE TABLE IF NOT EXISTS content_registry (
    content_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    angle_title TEXT NOT NULL,
    hook_text TEXT NOT NULL,
    blueprint_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    full_script TEXT NOT NULL,
    script_hash TEXT NOT NULL,          -- SHA-256 của nội dung kịch bản
    embedding_vector BLOB,              -- Vector nhúng ngữ nghĩa (Float32 array)
    published_video_slug TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(channel_id) REFERENCES channels(channel_id),
    FOREIGN KEY(topic_id) REFERENCES topics(topic_id)
);

-- 4. Bảng Quản Lý Công Việc Sản Xuất (Jobs State Machine)
CREATE TABLE IF NOT EXISTS content_jobs (
    job_id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    engine_type TEXT NOT NULL,
    state TEXT NOT NULL,                -- CREATED, SCRIPTING, ASSET_GEN, QA_PENDING, READY_TO_RENDER, RENDERING, VIDEO_QA, READY_TO_PUBLISH, PUBLISHED, FAILED
    current_scene_index INTEGER DEFAULT 0,
    total_scenes INTEGER DEFAULT 12,
    completed_scenes_mask TEXT DEFAULT '', -- Chuỗi nhị phân hoặc JSON mảng đánh dấu scene hoàn tất
    video_slug TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    cost_tokens INTEGER DEFAULT 0,
    cost_images INTEGER DEFAULT 0,
    manifest_json TEXT,                 -- Lưu toàn bộ Asset Manifest & Scene Timings
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 5. Bảng Quản Lý Mẻ Sản Xuất (Batches)
CREATE TABLE IF NOT EXISTS batches (
    batch_id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL,
    total_jobs INTEGER NOT NULL,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    status TEXT DEFAULT 'RUNNING',      -- RUNNING, COMPLETED, PARTIAL_FAILED
    created_at INTEGER NOT NULL
);

-- Chỉ mục tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_jobs_state ON content_jobs(state);
CREATE INDEX IF NOT EXISTS idx_jobs_batch ON content_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_registry_topic ON content_registry(topic_id);
CREATE INDEX IF NOT EXISTS idx_channels_niche ON channels(niche_id);
```

---

# 4. BẢNG MA TRẬN TƯƠNG THÍCH HOÀN CHỈNH (18 NICHES × 10 ENGINES)

File cấu hình: `compare_studio/config/compatibility_matrix.yaml`  
**Quy tắc lọc**: Khi tạo video cho một Niche, hệ thống chỉ chọn các Template Engine có `score >= 0.55`. Các engine `< 0.55` bị loại bỏ để tránh tạo video phản cảm.

| STT | Mã Niche (`niche_id`) | Tên Niche | Folklore | Mystery | Newspaper | Vox | Chalk | Science | Survival | Tierlist | Kinetic | Wildlife / Compare |
|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **01** | `folklore_legends` | Dân Gian & Tâm Linh | **1.00** | **0.90** | **0.80** | 0.30 | 0.20 | 0.10 | 0.50 | **0.85** | **0.75** | 0.40 |
| **02** | `unsolved_mysteries` | Bí Ẩn Chưa Lời Giải | **0.75** | **1.00** | **0.95** | **0.85** | 0.40 | 0.50 | 0.50 | **0.75** | **0.80** | 0.20 |
| **03** | `deep_space` | Vũ Trụ & Vật Lý | 0.15 | **0.60** | 0.50 | **0.95** | 0.45 | **1.00** | **0.75** | **0.80** | **0.85** | 0.10 |
| **04** | `extreme_wildlife` | Động Vật & Biển Sâu | 0.30 | 0.50 | 0.40 | **0.80** | 0.40 | **0.85** | **0.80** | **0.90** | **0.70** | **1.00** |
| **05** | `geopolitics_maps` | Địa Chính Trị & Biên Giới | 0.10 | 0.50 | **0.90** | **0.95** | **1.00** | 0.20 | 0.40 | **0.75** | **0.80** | **0.70** |
| **06** | `dark_psychology` | Tâm Lý Học & Hành Vi | 0.40 | **0.85** | **0.70** | **0.95** | **0.60** | **0.75** | 0.50 | **0.70** | **1.00** | 0.20 |
| **07** | `extreme_survival` | Sinh Tồn & Thảm Hoạ | 0.30 | **0.65** | **0.70** | **0.80** | **0.75** | **0.80** | **1.00** | **0.85** | **0.80** | **0.70** |
| **08** | `tech_ai_future` | Công Nghệ & Tương Lai AI | 0.10 | **0.60** | 0.50 | **1.00** | **0.60** | **0.90** | 0.50 | **0.85** | **0.95** | **0.80** |
| **09** | `economy_empires` | Kinh Tế & Thương Trường | 0.10 | 0.50 | **0.95** | **1.00** | **0.85** | 0.30 | 0.40 | **0.90** | **0.85** | **0.75** |
| **10** | `lost_civilizations` | Văn Minh Cổ Đại | **0.85** | **0.90** | **0.95** | **0.85** | **0.70** | **0.80** | 0.50 | **0.75** | 0.50 | 0.30 |
| **11** | `medical_anomalies` | Y Học & Dị Biệt Sinh Học | 0.30 | **0.90** | **0.80** | **0.90** | 0.40 | **1.00** | **0.75** | **0.70** | **0.75** | 0.40 |
| **12** | `mega_catastrophes` | Đại Thảm Hoạ Trái Đất | 0.20 | **0.70** | **0.90** | **0.85** | **0.80** | **0.95** | **1.00** | **0.80** | **0.85** | 0.40 |
| **13** | `infamous_figures` | Nhân Vật Khét Tiếng | 0.30 | **0.85** | **1.00** | **0.90** | **0.80** | 0.20 | 0.40 | **0.95** | **0.80** | **0.60** |
| **14** | `forbidden_experiments` | Thí Nghiệm Điên Rồ | 0.20 | **1.00** | **0.95** | **0.90** | 0.50 | **0.95** | **0.75** | **0.80** | **0.75** | 0.30 |
| **15** | `ocean_mysteries` | Đại Dương & Rãnh Vực | 0.50 | **0.85** | 0.50 | **0.85** | 0.50 | **0.95** | **0.85** | **0.85** | **0.75** | **1.00** |
| **16** | `philosophy_paradox` | Nghịch Lý Triết Học | 0.40 | **0.70** | 0.50 | **0.95** | **0.85** | **0.80** | 0.30 | **0.80** | **1.00** | 0.50 |
| **17** | `military_arsenal` | Vũ Khí & Khí Tài | 0.10 | 0.50 | **0.85** | **0.90** | **1.00** | **0.75** | **0.70** | **1.00** | **0.80** | **0.85** |
| **18** | `ancient_mythology` | Thần Thoại Cổ Đại | **1.00** | **0.80** | **0.70** | 0.50 | 0.40 | 0.30 | 0.50 | **0.95** | **0.70** | 0.50 |

---

# 5. ĐẶC TẢ SCHEMA CHANNEL DNA & PRESETS MẪU

File lưu trữ: `compare_studio/config/channels/{channel_id}.yaml`

```yaml
# Schema Chuẩn Channel DNA (Codex sử dụng TypeScript Interface tương ứng)
channel_id: "space_07"
niche_id: "deep_space"
name: "Cosmic Impossible"
tiktok_account_ref: "acc_us_space_07" # Link sang bkt_channels.db

persona:
  tone: "mysterious_academic"        # Giọng điệu: học thuật bí ẩn
  energy_level: 0.7                  # Mức năng lượng: 0.1 (trầm) -> 1.0 (sôi nổi)
  target_demographic: "Gen Z & Science Enthusiasts (18-35)"
  catchphrase_prefix: "Bạn có dám đối mặt với sự thật rằng..."

story:
  preferred_blueprints:
    - "science_explainer"
    - "mystery_reveal"
  preferred_hook_types:
    - "impossible_scale"             # So sánh kích thước gây sốc
    - "paradox_question"             # Câu hỏi nghịch lý
  target_duration_seconds: 52
  pacing_beats: 12                   # Số cảnh chuẩn

creative:
  preferred_engines:
    - "science"
    - "vox"
    - "kinetic"
  visual_style_id: "cosmic_space_v1"
  cut_cadence_seconds: 2.8           # Nhịp đổi cảnh
  palette:
    primary: "#0B0C10"              # Đen vũ trụ sâu
    accent: "#66FCF1"               # Xanh neon pulsar
    text: "#C5C6C7"

audio:
  voice_id: "vi-VN-NamMinhNeural"    # Hoặc ID CapCut TTS tương ứng
  voice_speed: 1.08
  voice_pitch: -1                    # Giảm pitch để trầm hơn
  music_family: "deep_cosmic_drone"  # Map vào soundscapes.mjs
  sfx_density: "medium"

publishing:
  language: "vi"
  default_schedule_window: "19:30-20:30"
  hashtags:
    - "khoahoc"
    - "vutru"
    - "khampha"
    - "cosmicimpossible"
```

---

# 6. ĐẶC TẢ CHI TIẾT 8 TẦNG XỬ LÝ (8 LAYERS SPECIFICATION)

## Layer 1: Topic Intelligence
- **File**: `compare_studio/matrix/planner/topic-pool.mjs`
- **Nhiệm vụ**: Nhận vào danh sách đề tài hoặc fetch từ nguồn trending. Phân loại theo Niche. Trả về `TopicObject`.
- **Hàm cốt lõi**:
  ```javascript
  export async function getTopicForNiche(nicheId, { mode = "evergreen" } = {})
  export async function registerNewTopic({ title, nicheId, category, priority })
  ```

## Layer 2: Channel DNA & Selector
- **File**: `compare_studio/matrix/planner/template-selector.mjs`
- **Nhiệm vụ**:
  1. Đọc `compatibility_matrix.yaml`.
  2. Lọc tất cả channel thuộc `niche_id`.
  3. Gán Engine thích hợp cho từng channel dựa trên điểm Compatibility và `preferred_engines` trong DNA.
- **Hàm cốt lõi**:
  ```javascript
  export function resolveChannelsForTopic(nicheId, count = 10)
  ```

## Layer 3: Story Engine
- **File**:
  - `angle-generator.mjs`: Gọi LLM sinh **10 góc nhìn (angles)** hoàn toàn không giao thoa ngữ nghĩa.
  - `blueprint-engine.mjs`: Ép cấu trúc kịch bản theo nhịp chuẩn (Hook 0-3s, Setup 3-15s, Escalation 15-35s, Climax/Twist 35-50s, CTA 50-60s).
  - `script-generator.mjs`: Sinh thoại từng phân cảnh (`scenes[].line`), thời lượng ước tính (`duration`), và mô tả hình ảnh gốc (`scenes[].visual_intent`).
- **Blueprints Mẫu (`compare_studio/config/blueprints/`)**:
  - `mystery_reveal.yaml`: `[hook_anomaly] -> [historical_clue] -> [contradiction] -> [shocking_twist] -> [unresolved_loop]`
  - `science_explainer.yaml`: `[impossible_question] -> [scale_comparison] -> [underlying_mechanism] -> [cosmic_consequence] -> [mind_blown_fact]`

## Layer 4: Creative Engine
- **Visual Director (`visual-director.mjs`)**: Đọc `visual_intent` của từng cảnh, kết hợp `Style Bible` tương ứng của Channel để biên dịch ra **Prompt 9:16 chuyên biệt** cho Antigravity Queue.
- **Prompt Compiler Rule**:
  $$\text{Final Prompt} = \text{Visual Intent} + \text{", "} + \text{Style Palette} + \text{", "} + \text{Camera Angle} + \text{", 9:16 aspect ratio, ultra-detailed, 8k"}$$
- **Audio Orchestrator (`audio-orchestrator.mjs`)**:
  - Tạo TTS wav/mp3 từ `voices.mjs` theo đúng `voice_id`, `speed`, `pitch`.
  - Đo độ dài file audio chính xác $\rightarrow$ Gán `duration` cho từng cảnh (không chia đều thời gian!).
  - Tự động chèn BGM và SFX theo nhịp chuyển cảnh bằng `auto-sfx.mjs`.

## Layer 5: QA Engine (4 Lớp Kiểm Duyệt Nghiêm Ngặt)
- **QA 1: Script QA (`script-qa.mjs`)**:
  - Kiểm tra số từ / độ dài đọc không vượt quá 60s.
  - Kiểm tra câu Hook có chứa từ khoá giữ chân trong 3 giây đầu.
  - Lọc bỏ các từ ngữ vi phạm chính sách cộng đồng TikTok (hate speech, từ ngữ y tế nhạy cảm không căn cứ).
- **QA 2: Originality Check (`similarity-check.mjs`)**:
  - Tính toán độ tương đồng giữa kịch bản mới với toàn bộ kịch bản trong `content_registry` của cùng Niche.
  - Sử dụng thuật toán so sánh n-gram Jaccard kết hợp TF-IDF / Embedding Cosine.
  - **Ngưỡng chặn**: Nếu độ tương đồng $> 0.65$, Reject ngay lập tức và gọi `angle-generator` sinh lại góc tiếp cận khác!
- **QA 3: Asset QA (`asset-qa.mjs`)**:
  - Kiểm tra 100% phân cảnh đều có ảnh hợp lệ trong `assets/images/scene-X.jpg`.
  - Kiểm tra độ phân giải đúng tỷ lệ dọc 9:16 (1080x1920 hoặc 720x1280).
  - Không chấp nhận ảnh lỗi hoặc rỗng.
- **QA 4: Video QA (`video-qa.mjs`)**:
  - Kiểm tra file MP4 sau khi render: Thời lượng $> 25s$ và $< 65s$.
  - Kiểm tra track âm thanh tồn tại (không bị câm tiếng).
  - Không có frame đen (black screen frames).

## Layer 6: Job Orchestrator & State Machine (Scene Resume)
- **File**: `compare_studio/matrix/orchestrator/job-manager.mjs`
- **Mô hình Trạng thái (Job State Machine)**:
  ```text
  CREATED 
     ↓
  SCRIPTING 
     ↓
  ASSET_GEN (Chờ ảnh AI & TTS audio)
     ↓
  QA_PENDING (Kiểm duyệt kịch bản & tài nguyên)
     ↓
  READY_TO_RENDER
     ↓
  RENDERING (Gọi Canvas native export)
     ↓
  VIDEO_QA (Kiểm tra MP4)
     ↓
  READY_TO_PUBLISH
  ```
- **Cơ chế Scene-Level Resume (`scene-resumer.mjs`)**:
  - Trong `content_jobs`, trường `completed_scenes_mask` lưu mảng trạng thái (ví dụ: `[1,1,1,1,1,1,1,0,0,0,0,0]`).
  - Khi worker bị ngắt hoặc render thất bại ở cảnh 8:
    1. Đọc lại manifest của job.
    2. Giữ nguyên cảnh 1 đến 7 đã tạo thành công.
    3. Chỉ kích hoạt xử lý từ cảnh 8 trở đi.
    4. Ghép nối lại và render tiếp mà không tốn token AI hay thời gian vẽ lại ảnh!

## Layer 7: Publish Manager & Staggered Scheduling
- **File**: `bkt_web/publish_flow.py` & `publish_kit.py`
- **Quy tắc xuất bản**:
  - Mỗi video được gắn với `channel_id` cụ thể trong `bkt_channels.db`.
  - **Phân bổ giờ đăng so le (Staggered Scheduling)**: 10 video thuộc 1 mẻ cùng chủ đề được lên lịch cách nhau tối thiểu 45–60 phút (ví dụ: 11:30, 12:15, 13:00, 17:30, 18:15...).
  - Caption và Hashtags được sinh động theo từng Channel DNA và Type Hashtags chuẩn SEO của `publish_kit.py`.

## Layer 8: Analytics & Learning Loop
- **File**: `bkt_web/matrix_analytics.py`
- **Nhiệm vụ**:
  - Cập nhật chỉ số sau 24h/48h: `completion_rate`, `retention_3s`, `likes`, `shares`.
  - Tự động cộng/trừ trọng số cho các `hook_style` và `blueprints` trong Channel DNA:
    - Nếu Hook A đạt `completion_rate > 55%`: Tăng trọng số xuất hiện lên $+0.15$.
    - Nếu Hook B đạt `completion_rate < 30%`: Giảm trọng số xuống $-0.10$.

---

# 7. GIAO TIẾP API & CLI (`tools/batch-matrix.mjs` & FASTAPI ROUTES)

### 7.1 Lệnh CLI Điều Phối Mẻ Sản Xuất (`batch-matrix.mjs`)

```bash
# Cú pháp chạy lệnh tạo ma trận video cho 1 chủ đề:
node compare_studio/tools/batch-matrix.mjs \
  --topic "Tam Giác Quỷ Bermuda" \
  --niche "unsolved_mysteries" \
  --channels 10 \
  --render \
  --auto-publish
```

**Hoạt động bên trong của CLI**:
1. Nhận tham số $\rightarrow$ Tạo 1 `batch_id` trong DB.
2. Gọi `template-selector` để chọn 10 kênh tương thích.
3. Sinh 10 Job và đẩy vào hàng đợi `content_jobs` với trạng thái `CREATED`.
4. Kích hoạt `queue-worker` xử lý ngầm và hiển thị thanh tiến trình (progress bar) trên terminal:
   ```text
   [BATCH-MATRIX] Bắt đầu mẻ: batch_20260923_01 ("Tam Giác Quỷ Bermuda")
   - Acc 01 (mystery_01 / Mystery): [SCRIPTING] ✓ -> [ASSETS] 12/12 -> [RENDER] 100% ✓
   - Acc 02 (newspaper_02 / Newspaper): [SCRIPTING] ✓ -> [ASSETS] 12/12 -> [RENDER] 100% ✓
   - Acc 03 (vox_03 / Vox): [SCRIPTING] ✓ -> [ASSETS] 12/12 -> [RENDER] Đang render...
   ...
   ```

### 7.2 Các Endpoint FastAPI Mới (`bkt_web/matrix_routes.py`)

| Method | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/api/matrix/batch/create` | Tạo mẻ ma trận mới từ UI (nhận `{topic, niche_id, channel_count, auto_render}`) |
| `GET` | `/api/matrix/batch/:batch_id` | Lấy tiến độ thời gian thực của mẻ (tỷ lệ hoàn thành của 10 jobs) |
| `GET` | `/api/matrix/jobs/active` | Lấy danh sách các jobs đang chạy ngầm |
| `POST` | `/api/matrix/jobs/:job_id/retry` | Kích hoạt resume và thử lại một job bị lỗi |
| `GET` | `/api/matrix/channels` | Lấy danh sách 180 kênh kèm thông tin Channel DNA |
| `POST` | `/api/matrix/channels/:id/dna` | Cập nhật cấu hình Channel DNA |
| `GET` | `/api/matrix/registry/search` | Tra cứu lịch sử kịch bản và kiểm tra độ trùng lặp |

---

# 8. TÍCH HỢP GIAO DIỆN WEB (UI WORKSTATION)

Codex sẽ bổ sung trực tiếp vào `bkt_web/static/index.html` và `bkt_web/static/app.js`:

1. **Nút "🪄 Tạo Ma Trận 10 Kênh (AI Matrix)"**: Đặt nổi bật trong thanh Topbar của Compare Studio (cạnh nút "Tạo Video Mới").
2. **Modal Tạo Ma Trận (`modal-matrix-create`)**:
   - Ô nhập Đề tài gốc (Ví dụ: *"Hố sâu rãnh Mariana"*).
   - Dropdown chọn Niche (18 Niche tuyển chọn).
   - Thanh trượt số lượng kênh (mặc định 10 kênh).
   - Checkbox: "Tự động sinh ảnh AI", "Tự động render MP4", "Xếp hàng đăng TikTok".
3. **Bảng Điều Khiển Matrix Monitor (Matrix Dashboard)**:
   - Hiển thị lưới 10 thẻ trạng thái cho 10 kênh tương ứng.
   - Thẻ hiển thị rõ: Tên Kênh, Template Engine được gán, Góc nhìn (Angle), Tiến độ tải ảnh AI, và Video preview khi render xong.

---

# 9. LỘ TRÌNH TRIỂN KHAI CHI TIẾT CHO CODEX (7 SPRINTS & ACCEPTANCE CRITERIA)

Codex sẽ thực thi theo đúng 7 Sprint tuần tự sau đây để đảm bảo tính ổn định tuyệt đối:

```text
SPRINT 1: Nền Tảng Cấu Hình & Ma Trận Tương Thích — HOÀN THÀNH
├── [x] Tạo thư mục compare_studio/config/{niches,channels,blueprints,styles}
├── [x] Viết config/compatibility_matrix.yaml (18 Niches × 10 Engines)
├── [x] Tạo schema Channel DNA và 10 Channel mẫu cho 2 Niche Pilot:
│   ├── [x] Niche 02: unsolved_mysteries (5 kênh)
│   └── [x] Niche 03: deep_space (5 kênh)
└── [x] Acceptance: Node validator đọc và validate toàn bộ 17 file YAML, schema + cross-reference đều đạt.

SPRINT 2: Cơ Sở Dữ Liệu & Job State Machine
├── 1. Viết bkt_web/matrix_db.py: Khởi tạo SQLite matrix_factory.db với 5 bảng DDL.
├── 2. Viết compare_studio/matrix/orchestrator/job-manager.mjs: CRUD operations cho Job State Machine.
├── 3. Viết compare_studio/matrix/orchestrator/scene-resumer.mjs: Logic resume từng phân cảnh.
└── 4. Acceptance: Test tạo job, chuyển state, giả lập fail cảnh 5 và resume thành công cảnh 5-12.

SPRINT 3: Bộ Biên Kịch Độc Bản (Story Engine)
├── 1. Viết compare_studio/matrix/planner/angle-generator.mjs: Prompt LLM sinh 10 góc nhìn độc bản.
├── 2. Viết compare_studio/matrix/planner/template-selector.mjs: Thuật toán chọn engine theo điểm số matrix.
├── 3. Viết compare_studio/matrix/story/blueprint-engine.mjs & script-generator.mjs.
└── 4. Acceptance: Nhập 1 topic, sinh ra 10 kịch bản có 10 góc nhìn và thời lượng đọc khác biệt hoàn toàn.

SPRINT 4: Hệ Thống QA & Sổ Đăng Ký Nội Dung (Content Registry)
├── 1. Viết compare_studio/matrix/qa/similarity-check.mjs: Thuật toán đo khoảng cách văn bản chống trùng lặp.
├── 2. Viết compare_studio/matrix/qa/script-qa.mjs & asset-qa.mjs.
├── 3. Tích hợp ghi nhận kịch bản vào bảng content_registry.
└── 4. Acceptance: Kịch bản trùng > 65% bị từ chối tự động; kịch bản đạt chuẩn được cấp PASS score.

SPRINT 5: Xưởng Tạo Ảnh AI & Âm Thanh Tự Động
├── 1. Viết compare_studio/matrix/creative/visual-director.mjs & prompt-compiler.mjs.
├── 2. Kết nối với bkt_web/image_routes.py và antigravity-images.mjs để sinh ảnh hàng loạt theo batch.
├── 3. Kết nối voices.mjs và auto-sfx.mjs tự động render audio track và SFX.
└── 4. Acceptance: 10 kịch bản tự động tải đủ 120 ảnh AI và 10 audio files hoàn chỉnh.

SPRINT 6: Điều Phối Render & Lệnh CLI (`batch-matrix.mjs`)
├── 1. Viết compare_studio/tools/batch-matrix.mjs làm command wrapper.
├── 2. Kết nối pipeline gọi HyperFrames Canvas render qua Playwright / CapCut CLI.
├── 3. Viết bkt_web/matrix_routes.py kết nối các API vào FastAPI server.
└── 4. Acceptance: Chạy lệnh `node tools/batch-matrix.mjs "Chủ đề test" --render` xuất ra 10 video MP4 hoàn hảo.

SPRINT 7: Tích Hợp UI & Luồng Đăng Tự Động TikTok
├── 1. Thêm nút và modal "Tạo Ma Trận Video" trong bkt_web/static/index.html & app.js.
├── 2. Kết nối publish_flow.py và publish_kit.py tự động lên lịch đăng so le vào các kênh TikTok.
└── 4. Acceptance: Thao tác 1-Click trên Web UI sinh thành công mẻ video và xếp hàng vào lịch đăng.
```

---

# 10. KẾT LUẬN & CHUẨN BỊ BÀN GIAO CHO CODEX

Tài liệu đặc tả kỹ thuật này là **bản thiết kế thi công hoàn chỉnh (blueprint)**.  
Mọi module, class, hàm, cấu trúc dữ liệu và logic kết nối giữa `Python (FastAPI)` và `Node.js (HyperFrames Canvas)` đã được phân định ranh giới rõ ràng.

Codex có thể lấy trực tiếp tài liệu này và triển khai code từ **Sprint 1** tới **Sprint 7** theo đúng trật tự đã định nghĩa, đảm bảo hệ thống đạt độ ổn định công nghiệp và vận hành trơn tru trên 180 kênh TikTok.
