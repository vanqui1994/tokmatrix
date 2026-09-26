# MASTER SPECIFICATION — AI VIDEO FACTORY & CONTENT OS (180 TIKTOK CHANNELS)

## TÀI LIỆU ĐẶC TẢ KỸ THUẬT CHO CODEX TRIỂN KHAI MÃ NGUỒN (TECHNICAL IMPLEMENTATION SPEC)

> **Dự án**: SSMATool TikTok / Compare Studio — Autonomous Multi-Channel Video Factory  

> **Phiên bản tài liệu**: 2.1 (Codex Implementation Spec — Production Hardening)  

> **Mục tiêu**: Xây dựng hệ điều hành nội dung tự động vận hành mạng lưới 180 kênh TikTok chia thành 18 Niche (tối đa 10 kênh/niche) với nguyên tắc **kiểm soát đa dạng ngữ nghĩa (Semantic Diversity Control)**, **tận dụng 100% 10 Native Canvas Video Engines**, và **vận hành bền bỉ qua Job Orchestrator có khả năng resume từng phân cảnh**.

---

# MỤC LỤC

1. [Tổng quan Kiến trúc Hệ thống & Codebase Context]\(#1-tổng-quan-kiến-trúc-hệ-thống--codebase-context)

2. [Cấu trúc Thư mục Triển khai (Directory Structure)]\(#2-cấu-trúc-thư-mục-triển-khai-directory-structure)

3. [Cơ sở Dữ liệu & Data Models (SQLite DDL & Schemas)]\(#3-cơ-sở-dữ-liệu--data-models-sqlite-ddl--schemas)

4. [Bảng Ma Trận Tương Thích Hoàn Chỉnh (18 Niches × 10 Engines)]\(#4-bảng-ma-trận-tương-thích-hoàn-chỉnh-18-niches--10-engines)

5. [Đặc tả Schema Channel DNA & Presets Mẫu]\(#5-đặc-tả-schema-channel-dna--presets-mẫu)

6. [Đặc tả Chi tiết 8 Tầng Xử Lý (8 Layers Specification)]\(#6-đặc-tả-chi-tiết-8-tầng-xử-lý-8-layers-specification)

   - [Layer 1: Topic Intelligence]\(#layer-1-topic-intelligence)

   - [Layer 2: Channel DNA & Selector]\(#layer-2-channel-dna--selector)

   - [Layer 3: Story Engine (Angle, Blueprint, Script, Storyboard)]\(#layer-3-story-engine)

   - [Layer 4: Creative Engine (Visual Director, Image Queue, Voices, Audio)]\(#layer-4-creative-engine)

   - [Layer 5: QA Engine (Script QA, Similarity Check, Asset QA, Video QA)]\(#layer-5-qa-engine)

   - [Layer 6: Job Orchestrator & State Machine (Scene Resume)]\(#layer-6-job-orchestrator--state-machine)

   - [Layer 7: Publish Manager & Staggered Scheduling]\(#layer-7-publish-manager--staggered-scheduling)

   - [Layer 8: Analytics & Learning Loop]\(#layer-8-analytics--learning-loop)

7. [Giao tiếp API & CLI (`tools/batch-matrix.mjs` & FastAPI Routes)]\(#7-giao-tiếp-api--cli-toolsbatch-matrixmjs--fastapi-routes)

8. [Tích hợp Giao diện Web (UI Workstation)]\(#8-tích-hợp-giao-diện-web-ui-workstation)

9. [Lộ trình Triển khai Chi tiết Cho Codex (7 Sprints & Acceptance Criteria)]\(#9-lộ-trình-triển-khai-chi-tiết-cho-codex-7-sprints--acceptance-criteria)

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

## 1.3 Source of Truth & Config Versioning

- YAML trong `compare_studio/config/` là **preset/source configuration** do con người quản lý.
- Database lưu **resolved active configuration** đã được compile từ YAML để worker sử dụng ổn định.
- Mỗi Channel DNA có `config_version`.
- Khi YAML thay đổi, job đang chạy vẫn giữ snapshot config cũ; chỉ job mới sử dụng version mới.
- `manifest_json` của mỗi job phải snapshot toàn bộ config/version để có thể debug và tái lập kết quả.

## 1.4 Sprint 0 — Codebase Audit bắt buộc

Trước khi Codex tạo implementation mới, phải audit codebase hiện có và sinh `CODEBASE_AUDIT.md`.

Các hạng mục phải kiểm tra:

```text
verify file existence
verify exported functions
verify CLI contracts
verify FastAPI routes
verify asset paths
verify render contract
verify publish integration
verify resumable boundaries
```

Các file/module cần audit tối thiểu:

```text
compare_studio/tools/studio-bridge.mjs
compare_studio/tools/voices.mjs
compare_studio/tools/auto-sfx.mjs
compare_studio/tools/soundscapes.mjs
compare_studio/tools/create-*.mjs
compare_studio/tools/generate-*-topic.mjs
bkt_web/image_routes.py
bkt_web/publish_flow.py
bkt_web/publish_kit.py
```

**Rule:** nếu interface thực tế khác tài liệu, Codex phải adapt theo source hiện có; không tạo module duplicate chỉ để khớp spec.

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

    config_version INTEGER DEFAULT 1,
    resolved_config_json TEXT,          -- Active Channel DNA resolved từ YAML preset
    updated_at INTEGER,

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

    state TEXT NOT NULL,                -- CREATED, PLANNING, SCRIPTING, SCRIPT_QA, ASSET_GENERATING, ASSET_QA, READY_TO_RENDER, RENDERING, VIDEO_QA, READY_TO_PUBLISH, SCHEDULED, PUBLISHED, ANALYTICS_PENDING, COMPLETED, RETRY_WAIT, FAILED, DEAD_LETTER

    current_scene_index INTEGER DEFAULT 0,

    total_scenes INTEGER DEFAULT 12,

    completed_scenes_mask TEXT DEFAULT '', -- Chuỗi nhị phân hoặc JSON mảng đánh dấu scene hoàn tất

    video_slug TEXT NOT NULL,

    retry_count INTEGER DEFAULT 0,

    max_retries INTEGER DEFAULT 3,

    locked_by TEXT,
    locked_at INTEGER,
    lease_expires_at INTEGER,
    heartbeat_at INTEGER,
    next_retry_at INTEGER,

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

-- 6. Artifact theo Scene để hỗ trợ resume thực sự
CREATE TABLE IF NOT EXISTS scene_artifacts (
    artifact_id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    scene_index INTEGER NOT NULL,
    artifact_type TEXT NOT NULL,       -- image, svg, canvas, narration, sfx, subtitle, segment_video, manifest
    file_path TEXT NOT NULL,
    checksum TEXT,
    status TEXT DEFAULT 'READY',
    created_at INTEGER NOT NULL,
    UNIQUE(job_id, scene_index, artifact_type)
);

-- 7. Analytics snapshots
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    metrics_json TEXT NOT NULL
);

-- Chỉ mục tối ưu truy vấn

CREATE INDEX IF NOT EXISTS idx_jobs_state ON content_jobs(state);

CREATE INDEX IF NOT EXISTS idx_jobs_batch ON content_jobs(batch_id);

CREATE INDEX IF NOT EXISTS idx_registry_topic ON content_registry(topic_id);

CREATE INDEX IF NOT EXISTS idx_channels_niche ON channels(niche_id);
CREATE INDEX IF NOT EXISTS idx_scene_artifacts_job ON scene_artifacts(job_id, scene_index);
CREATE INDEX IF NOT EXISTS idx_analytics_content ON analytics_snapshots(content_id, captured_at);

```

---

# 4. BẢNG MA TRẬN TƯƠNG THÍCH HOÀN CHỈNH (18 NICHES × 10 ENGINES)

File cấu hình: `compare_studio/config/compatibility_matrix.yaml`  

**Quy tắc lọc**: Khi tạo video cho một Niche, hệ thống chỉ chọn các Template Engine có `score >= 0.55`. Các engine `< 0.55` bị loại bỏ để tránh tạo video phản cảm.

\| STT | Mã Niche (`niche_id`) | Tên Niche | Folklore | Mystery | Newspaper | Vox | Chalk | Science | Survival | Tierlist | Kinetic | Wildlife / Compare |

\|:---:|:---|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|

\| **01** | `folklore_legends` | Dân Gian & Tâm Linh | **1.00** | **0.90** | **0.80** | 0.30 | 0.20 | 0.10 | 0.50 | **0.85** | **0.75** | 0.40 |

\| **02** | `unsolved_mysteries` | Bí Ẩn Chưa Lời Giải | **0.75** | **1.00** | **0.95** | **0.85** | 0.40 | 0.50 | 0.50 | **0.75** | **0.80** | 0.20 |

\| **03** | `deep_space` | Vũ Trụ & Vật Lý | 0.15 | **0.60** | 0.50 | **0.95** | 0.45 | **1.00** | **0.75** | **0.80** | **0.85** | 0.10 |

\| **04** | `extreme_wildlife` | Động Vật & Biển Sâu | 0.30 | 0.50 | 0.40 | **0.80** | 0.40 | **0.85** | **0.80** | **0.90** | **0.70** | **1.00** |

\| **05** | `geopolitics_maps` | Địa Chính Trị & Biên Giới | 0.10 | 0.50 | **0.90** | **0.95** | **1.00** | 0.20 | 0.40 | **0.75** | **0.80** | **0.70** |

\| **06** | `dark_psychology` | Tâm Lý Học & Hành Vi | 0.40 | **0.85** | **0.70** | **0.95** | **0.60** | **0.75** | 0.50 | **0.70** | **1.00** | 0.20 |

\| **07** | `extreme_survival` | Sinh Tồn & Thảm Hoạ | 0.30 | **0.65** | **0.70** | **0.80** | **0.75** | **0.80** | **1.00** | **0.85** | **0.80** | **0.70** |

\| **08** | `tech_ai_future` | Công Nghệ & Tương Lai AI | 0.10 | **0.60** | 0.50 | **1.00** | **0.60** | **0.90** | 0.50 | **0.85** | **0.95** | **0.80** |

\| **09** | `economy_empires` | Kinh Tế & Thương Trường | 0.10 | 0.50 | **0.95** | **1.00** | **0.85** | 0.30 | 0.40 | **0.90** | **0.85** | **0.75** |

\| **10** | `lost_civilizations` | Văn Minh Cổ Đại | **0.85** | **0.90** | **0.95** | **0.85** | **0.70** | **0.80** | 0.50 | **0.75** | 0.50 | 0.30 |

\| **11** | `medical_anomalies` | Y Học & Dị Biệt Sinh Học | 0.30 | **0.90** | **0.80** | **0.90** | 0.40 | **1.00** | **0.75** | **0.70** | **0.75** | 0.40 |

\| **12** | `mega_catastrophes` | Đại Thảm Hoạ Trái Đất | 0.20 | **0.70** | **0.90** | **0.85** | **0.80** | **0.95** | **1.00** | **0.80** | **0.85** | 0.40 |

\| **13** | `infamous_figures` | Nhân Vật Khét Tiếng | 0.30 | **0.85** | **1.00** | **0.90** | **0.80** | 0.20 | 0.40 | **0.95** | **0.80** | **0.60** |

\| **14** | `forbidden_experiments` | Thí Nghiệm Điên Rồ | 0.20 | **1.00** | **0.95** | **0.90** | 0.50 | **0.95** | **0.75** | **0.80** | **0.75** | 0.30 |

\| **15** | `ocean_mysteries` | Đại Dương & Rãnh Vực | 0.50 | **0.85** | 0.50 | **0.85** | 0.50 | **0.95** | **0.85** | **0.85** | **0.75** | **1.00** |

\| **16** | `philosophy_paradox` | Nghịch Lý Triết Học | 0.40 | **0.70** | 0.50 | **0.95** | **0.85** | **0.80** | 0.30 | **0.80** | **1.00** | 0.50 |

\| **17** | `military_arsenal` | Vũ Khí & Khí Tài | 0.10 | 0.50 | **0.85** | **0.90** | **1.00** | **0.75** | **0.70** | **1.00** | **0.80** | **0.85** |

\| **18** | `ancient_mythology` | Thần Thoại Cổ Đại | **1.00** | **0.80** | **0.70** | 0.50 | 0.40 | 0.30 | 0.50 | **0.95** | **0.70** | 0.50 |

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

  - `angle-generator.mjs`: Gọi LLM sinh **tối đa 10 góc nhìn (angles)** đủ khác biệt về angle, hook, evidence set và narrative structure. Không yêu cầu semantic overlap bằng 0 vì các video vẫn cùng topic gốc.

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

### Asset Type Strategy

Không ép mọi scene phải sinh AI image. `storyboard-compiler` phải gắn `asset_type` cho từng scene:

```text
IMAGE_AI
CANVAS
SVG
TEXT
MAP
CHART
EXISTING_ASSET
```

Quy tắc:
- `kinetic`, `chalk`, `vox`, `tierlist` ưu tiên Canvas/SVG/Text khi phù hợp.
- `science`, `wildlife`, `folklore`, `mystery` có thể dùng AI image nhiều hơn.
- Chỉ gọi Antigravity khi `asset_type = IMAGE_AI`.
- Acceptance test không được hard-code `12 ảnh/video`; phải kiểm tra đủ artifact theo storyboard manifest.

## Layer 5: QA Engine (4 Lớp Kiểm Duyệt Nghiêm Ngặt)

- **QA 1: Script QA (`script-qa.mjs`)**:

  - Kiểm tra số từ / độ dài đọc không vượt quá 60s.

  - Kiểm tra câu Hook có chứa từ khoá giữ chân trong 3 giây đầu.

  - Lọc bỏ các từ ngữ vi phạm chính sách cộng đồng TikTok (hate speech, từ ngữ y tế nhạy cảm không căn cứ).

- **QA 2: Originality Check (`similarity-check.mjs`)**:

  - Tính độ tương đồng theo pipeline nhiều tầng: exact hash → n-gram/Jaccard → TF-IDF shortlist → embedding cosine trên shortlist, tránh quét embedding toàn registry ở MVP.

  - Sử dụng thuật toán so sánh n-gram Jaccard kết hợp TF-IDF / Embedding Cosine.

  - **Ngưỡng chặn**: Nếu độ tương đồng vượt ngưỡng cấu hình (mặc định `0.65`), Reject và gọi `angle-generator` sinh lại góc tiếp cận khác. Ngưỡng phải versioned và có thể tune theo niche.

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
PLANNING
     ↓
SCRIPTING
     ↓
SCRIPT_QA
     ↓
ASSET_GENERATING
     ↓
ASSET_QA
     ↓
READY_TO_RENDER
     ↓
RENDERING
     ↓
VIDEO_QA
     ↓
READY_TO_PUBLISH
     ↓
SCHEDULED
     ↓
PUBLISHED
     ↓
ANALYTICS_PENDING
     ↓
COMPLETED

Mọi state đều có thể chuyển sang `RETRY_WAIT`, `FAILED` hoặc `DEAD_LETTER`.
```

- **Cơ chế Scene-Level Resume (`scene-resumer.mjs`)**:

  - Trong `content_jobs`, trường `completed_scenes_mask` lưu mảng trạng thái (ví dụ: `[1,1,1,1,1,1,1,0,0,0,0,0]`).

  - Khi worker bị ngắt hoặc render thất bại ở cảnh 8:

    1. Đọc lại manifest của job.

    2. Giữ nguyên cảnh 1 đến 7 đã tạo thành công.

    3. Chỉ kích hoạt xử lý từ cảnh 8 trở đi.

    4. Ghép nối lại và render tiếp mà không tốn token AI hay thời gian vẽ lại ảnh!

### Scene Artifact Contract

Để `Scene-Level Resume` hoạt động thật, mỗi scene phải có artifact directory riêng:

```text
projects/{job_id}/scenes/scene_01/
├── scene.json
├── image.png            # nếu IMAGE_AI
├── narration.wav
├── sfx.wav              # optional
├── subtitle.json
├── segment.mp4          # nếu renderer hỗ trợ segment render
└── manifest.json
```

Nếu native Canvas engine hiện chỉ render full-video, Sprint 0 phải ghi rõ limitation. Khi đó resume trước mắt áp dụng cho **asset generation và scene preparation**, còn segment render được triển khai khi engine hỗ trợ.

## Layer 7: Publish Manager & Staggered Scheduling

- **File**: `bkt_web/publish_flow.py` & `publish_kit.py`

- **Quy tắc xuất bản**:

  - Mỗi video được gắn với `channel_id` cụ thể trong `bkt_channels.db`.

  - **Phân bổ giờ đăng so le (Staggered Scheduling)**: 10 video thuộc 1 mẻ cùng chủ đề được lên lịch cách nhau tối thiểu 45–60 phút (ví dụ: 11:30, 12:15, 13:00, 17:30, 18:15...).

  - Caption và Hashtags được sinh động theo từng Channel DNA và Type Hashtags chuẩn SEO của `publish_kit.py`.

## Layer 8: Analytics & Learning Loop

- **File**: `bkt_web/matrix_analytics.py`


- **Analytics Provider Contract**:

```ts
interface AnalyticsProvider {
  fetchVideoMetrics(channelId: string, videoId: string): Promise<VideoMetrics>;
}
```

Provider có thể trả metric không đầy đủ. Hệ thống phải lưu `available_metrics` và không giả định mọi provider đều có `retention_3s` hoặc `completion_rate`.

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

node compare_studio/tools/batch-matrix.mjs \\

  --topic "Tam Giác Quỷ Bermuda" \\

  --niche "unsolved_mysteries" \\

  --channels 10 \\

  --render \\

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

\| Method | Endpoint | Mô tả |

\| :--- | :--- | :--- |

\| `POST` | `/api/matrix/batch/create` | Tạo mẻ ma trận mới từ UI (nhận `{topic, niche_id, channel_count, auto_render}`) |

\| `GET` | `/api/matrix/batch/\:batch_id` | Lấy tiến độ thời gian thực của mẻ (tỷ lệ hoàn thành của 10 jobs) |

\| `GET` | `/api/matrix/jobs/active` | Lấy danh sách các jobs đang chạy ngầm |

\| `POST` | `/api/matrix/jobs/\:job_id/retry` | Kích hoạt resume và thử lại một job bị lỗi |

\| `GET` | `/api/matrix/channels` | Lấy danh sách 180 kênh kèm thông tin Channel DNA |

\| `POST` | `/api/matrix/channels/\:id/dna` | Cập nhật cấu hình Channel DNA |

\| `GET` | `/api/matrix/registry/search` | Tra cứu lịch sử kịch bản và kiểm tra độ trùng lặp |

---

# 8. TÍCH HỢP GIAO DIỆN WEB (UI WORKSTATION)

Codex sẽ bổ sung trực tiếp vào `bkt_web/static/index.html` và `bkt_web/static/app.js`:

1. **Nút "🪄 Tạo Ma Trận 10 Kênh (AI Matrix)"**: Đặt nổi bật trong thanh Topbar của Compare Studio (cạnh nút "Tạo Video Mới").

2. **Modal Tạo Ma Trận (`modal-matrix-create`)**:

   - Ô nhập Đề tài gốc (Ví dụ: *\*"Hố sâu rãnh Mariana"\**).

   - Dropdown chọn Niche (18 Niche tuyển chọn).

   - Thanh trượt số lượng kênh (mặc định 10 kênh).

   - Checkbox: "Tự động sinh ảnh AI", "Tự động render MP4", "Xếp hàng đăng TikTok".

3. **Bảng Điều Khiển Matrix Monitor (Matrix Dashboard)**:

   - Hiển thị lưới 10 thẻ trạng thái cho 10 kênh tương ứng.

   - Thẻ hiển thị rõ: Tên Kênh, Template Engine được gán, Góc nhìn (Angle), Tiến độ tải ảnh AI, và Video preview khi render xong.

---

# 9. LỘ TRÌNH TRIỂN KHAI CHI TIẾT CHO CODEX (SPRINT 0 → 8)

Codex thực thi tuần tự. Không được nhảy sprint khi acceptance của sprint trước chưa PASS.

```text
SPRINT 0: Codebase Audit & Interface Contracts — HOÀN THÀNH
├── [x] Audit toàn bộ engine, bridge, image, voice, render, publish hiện có
├── [x] Sinh CODEBASE_AUDIT.md
├── [x] Ghi rõ interface thực tế, reusable modules và technical limitations
└── [x] Acceptance: Audit PASS trước khi tiếp tục implementation

SPRINT 1: Config, Channel DNA & Compatibility Matrix — HOÀN THÀNH
├── [x] Tạo config/{niches,channels,blueprints,styles}
├── [x] compatibility_matrix.yaml (18 niches × 10 engines)
├── [x] JSON/YAML schema validation cho toàn bộ 17 config YAML và cross-reference
├── [x] config_version + resolver YAML → active DB config (10 pilot channels, snapshot + SHA-256)
└── [x] Acceptance: validate toàn bộ config và đồng bộ 10 pilot channels vào active DB schema

SPRINT 2: Database, Lock/Lease & Job Orchestrator — HOÀN THÀNH
├── [x] matrix_db.py: 7 bảng, WAL, migration tương thích schema cũ
├── [x] job-manager.mjs + scene-resumer.mjs
├── [x] Worker lease atomically, heartbeat, expiry/reclaim và ownership checks
├── [x] Retry exponential backoff, FAILED/DEAD_LETTER và batch counters
├── [x] scene_artifacts có checksum; manifest-first resume giữ artifact hợp lệ
└── [x] Acceptance: concurrent workers không claim trùng; test fail scene 5 giữ scene 1–4 và trả resume từ scene 5–12.

SPRINT 3: Story Engine — HOÀN THÀNH
├── [x] angle-generator.mjs: tối đa 10 angle, kiểm soát khác biệt hook/evidence/narrative
├── [x] template-selector.mjs: chọn engine theo compatibility và preferred engines
├── [x] blueprint-engine.mjs: phân bổ beat theo pacing, không chia đều thời lượng scene
├── [x] script-generator.mjs: tạo thoại/visual intent và ước lượng duration theo từng câu
└── [x] Acceptance: 1 topic → 10 angle fixture khác biệt; pilot selector chỉ trả 5 kênh/niche hiện có, không nhân bản channel.

SPRINT 4: Content Registry & Script QA — HOÀN THÀNH
├── [x] Exact normalized script hash check
├── [x] N-gram/Jaccard similarity
├── [x] TF-IDF candidate shortlist trước optional embedding cosine
├── [x] Threshold/policy version theo niche trong qa_thresholds.yaml
├── [x] script-qa.mjs: thời lượng, hook ≤3s, cấu trúc và phrase policy
├── [x] Content Registry chỉ nhận script có similarity PASS và script QA PASS
└── [x] Acceptance: exact/near duplicate bị reject; threshold deep_space 0.62 và unsolved_mysteries 0.65 được kiểm thử.

SPRINT 5: Creative & Asset Pipeline — HOÀN THÀNH
├── [x] visual-director.mjs: chọn asset_type và Style Bible theo Channel DNA
├── [x] prompt-compiler.mjs: compile prompt 9:16, palette, camera và negative prompt
├── [x] asset-manager.mjs: IMAGE_AI đi qua Antigravity; placeholder/pending không được ghi là READY
├── [x] audio-orchestrator.mjs: TTS provider tường minh, pitch, duration đo thật, SFX/BGM theo soundscape
├── [x] asset_type routing: IMAGE_AI/CANVAS/SVG/TEXT/MAP/CHART/EXISTING_ASSET, không fallback ẩn
└── [x] Acceptance: test 7 kiểu asset theo manifest, ảnh 9:16, audio scene timing đo riêng; không hard-code 12 ảnh/video. Native engine adapter được nối ở Sprint 6.

SPRINT 6: Render, Video QA & Matrix CLI — ĐANG THỰC HIỆN
├── [x] batch-matrix.mjs chỉ làm command wrapper: dry-run, tạo batch, resume và render theo phê duyệt tường minh
├── [x] queue orchestration: SQLite leases/heartbeat, claim theo batch, defer ảnh pending không tốn retry budget
├── [x] native engine adapter cho 6 engine của 10 pilot channels; dùng media đã chuẩn bị, không gọi lại AI/TTS
├── [x] video-qa.mjs: duration, video/audio stream, 9:16, black segment và audio clipping/silence
├── [x] scene/full-render resume theo capability audit: scene assets tái sử dụng; MP4 native chỉ render lại full composition
├── [x] Test giả lập: pilot jobs claim một lần, render có approval, retry idempotent và không render trùng
└── [ ] Acceptance: pilot MP4 render thật + Video QA chưa chạy; cần provider TTS/Antigravity hoạt động và review/phê duyệt render trước khi đánh dấu Sprint 6 hoàn thành

SPRINT 7: UI & Publish Manager — HOÀN THÀNH TRIỂN KHAI
├── [x] Matrix Create Modal
├── [x] Matrix Monitor
├── [x] publish_flow.py integration
├── [x] publish manifest + schedule state
└── [ ] Acceptance: UI tạo batch → render → READY_TO_PUBLISH/SCHEDULED theo đúng state machine
       (cần xác nhận end-to-end với provider TTS/Antigravity, render MP4 thật và kênh TikTok được chọn rõ ràng)

SPRINT 8: Analytics & Learning Loop — HOÀN THÀNH
├── [x] AnalyticsProvider interface
├── [x] metrics snapshot storage
├── [x] feature tracking
├── [x] conservative weight update
└── [x] Acceptance: metrics có thể ingest/replay; strategy update versioned và không làm thay đổi job cũ
```

**Pilot scope mặc định**:

```text
2 niches
× 5 channels
= 10 channels
```

Chỉ scale lên 30–50 rồi tối đa 180 sau khi pilot chứng minh:

```text
stable queue
stable cost
acceptable QA failure rate
recoverable jobs
consistent content quality
reliable publish lifecycle
```

---

## 9.1 Implementation Guardrails for Codex

Codex phải tuân thủ các guardrail sau trong mọi sprint:

1. **Audit before create** — tìm và reuse module hiện có trước khi tạo module mới.
2. **Backward compatible** — không phá CLI, API route hoặc UI flow đang chạy.
3. **Idempotent jobs** — retry cùng `job_id` không tạo duplicate content/render/publish record.
4. **Lease-based workers** — worker phải acquire lease atomically, heartbeat và release/expire an toàn.
5. **Version everything** — lưu version của Channel DNA, blueprint, style, prompt compiler và renderer trong manifest.
6. **No hidden fallback** — khi provider/image/TTS/render lỗi phải ghi rõ error; không âm thầm đổi provider hoặc asset type.
7. **Manifest-first** — storyboard/asset/render/publish đều phải có manifest để resume và audit.
8. **Feature flag** — module matrix mới phải có thể bật/tắt độc lập với flow cũ.
9. **Test before next sprint** — unit/integration test + acceptance report phải PASS trước khi sang sprint sau.
10. **Pilot before scale** — chỉ mở rộng từ 10 → 30–50 → tối đa 180 channel sau khi hệ thống đạt tiêu chí ổn định đã định nghĩa.

---

# 10. KẾT LUẬN & CHUẨN BỊ BÀN GIAO CHO CODEX

Tài liệu đặc tả kỹ thuật này là **bản thiết kế thi công production-oriented (blueprint)**.  

Mọi module, class, hàm, cấu trúc dữ liệu và logic kết nối giữa `Python (FastAPI)` và `Node.js (HyperFrames Canvas)` đã được phân định ranh giới rõ ràng.

Codex có thể lấy trực tiếp tài liệu này và triển khai code từ **Sprint 1** tới **Sprint 7** theo đúng trật tự đã định nghĩa, mục tiêu hướng tới khả năng scale tối đa 180 kênh sau khi pilot và từng giai đoạn mở rộng đạt acceptance criteria; không coi quy mô 180 kênh là mặc định ngay từ MVP.
