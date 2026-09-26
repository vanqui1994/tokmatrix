# MASTER PLAN — AI VIDEO FACTORY FOR 180 TIKTOK CHANNELS

## 0. Mục tiêu

Xây dựng một **AI Video Factory / Multi-Channel Content Operating System** trên nền tảng `compare_studio` + `bkt_web`, có khả năng:

- Quản lý tối đa **180 kênh TikTok**
- Chia thành **18 niche × tối đa 10 channel/niche**
- Tự động hóa:
  - Topic planning
  - Angle generation
  - Script
  - Storyboard
  - AI image
  - TTS
  - Sound design
  - Native Canvas render
  - QA
  - Scheduling / publishing
  - Analytics
  - Learning loop
- Tận dụng tối đa các engine đã có trong Xưởng Video AI.
- Mỗi channel có identity riêng, không chỉ đổi template.
- Không khóa cứng một channel vào một template nếu template đó không phù hợp với niche.
- Ưu tiên originality, chất lượng nội dung và khả năng vận hành ổn định ở quy mô lớn.

---

# 1. Quy mô hệ thống

## 1.1 Tổng quan

```text
18 Niches
   ×
tối đa 10 Channels / Niche
   =
180 Channels
```

Mỗi channel có:

```text
Channel DNA
+
Content Strategy
+
Template Preferences
+
Voice Profile
+
Visual Style
+
Publishing Rules
+
Performance History
```

Không xem hệ thống đơn giản là:

```text
18 topic × 10 template = 180 skin khác nhau
```

Mà phải là:

```text
180 channel = 180 content identities
```

---

# 2. 10 Native Video Engines

Hệ thống tiếp tục tận dụng 10 format đã có trong `compare_studio`.

| ID | Engine | Mục tiêu |
|---|---|---|
| `folklore` | Folklore | Tâm linh, truyền thuyết, dân gian, supernatural storytelling |
| `mystery` | Mystery | Hồ sơ bí ẩn, điều tra, cold case |
| `newspaper` | Newspaper | Báo cổ, hồ sơ lịch sử, archival storytelling |
| `vox` | Vox | Explainer, phân tích, editorial motion graphics |
| `chalk` | Chalk | Bảng phấn, chiến lược, sơ đồ, map explain |
| `science` | Science | Vũ trụ, khoa học, vật lý, biological visualization |
| `survival` | Survival | Tình huống nguy hiểm, mô phỏng sinh tồn |
| `tierlist` | Tierlist | Ranking, comparison, debate-driven content |
| `kinetic` | Kinetic | Typography nhanh, facts, countdown |
| `wildlife` | Wildlife / Compare | Động vật, tự nhiên, đối đầu, comparison |

Các script / route hiện có hoặc dự kiến:

```text
create-folklore-video.mjs
create-mystery-video.mjs
create-newspaper-video.mjs
create-vox-video.mjs
create-chalk-video.mjs
create-science-video.mjs
create-survival-video.mjs
create-tierlist-video.mjs
create-kinetic-video.mjs
create-wildlife-video.mjs
create-video.mjs
```

---

# 3. 18 Niche Chính

## Niche 01 — Dân Gian & Tâm Linh Bản Địa
Ưu tiên:

```text
folklore
mystery
newspaper
kinetic
```

---

## Niche 02 — Bí Ẩn Chưa Lời Giải & Vụ Án Lịch Sử
Ưu tiên:

```text
mystery
newspaper
vox
kinetic
```

---

## Niche 03 — Vũ Trụ Sâu & Vật Lý Cực Hạn
Ưu tiên:

```text
science
vox
kinetic
tierlist
survival
```

---

## Niche 04 — Động Vật Kỳ Dị & Sinh Vật Biển Sâu
Ưu tiên:

```text
wildlife
science
tierlist
survival
```

---

## Niche 05 — Địa Chính Trị & Chiến Lược Biên Giới
Ưu tiên:

```text
chalk
vox
newspaper
```

---

## Niche 06 — Tâm Lý Học & Hành Vi Con Người
Ưu tiên:

```text
vox
kinetic
mystery
chalk
```

---

## Niche 07 — Kỹ Năng Sinh Tồn & Giả Lập Thảm Hoạ
Ưu tiên:

```text
survival
science
chalk
kinetic
```

---

## Niche 08 — Công Nghệ & Trí Tuệ Nhân Tạo
Ưu tiên:

```text
vox
kinetic
science
compare
```

---

## Niche 09 — Kinh Tế & Đế Chế Thương Trường
Ưu tiên:

```text
vox
newspaper
tierlist
chalk
```

---

## Niche 10 — Nền Văn Minh Cổ Đại
Ưu tiên:

```text
newspaper
folklore
science
mystery
```

---

## Niche 11 — Y Học Kỳ Dị & Sinh Học
Ưu tiên:

```text
science
mystery
vox
```

---

## Niche 12 — Đại Thảm Hoạ & Hậu Tận Thế
Ưu tiên:

```text
survival
science
kinetic
newspaper
```

---

## Niche 13 — Nhân Vật Lịch Sử
Ưu tiên:

```text
newspaper
chalk
tierlist
vox
```

---

## Niche 14 — Những Thí Nghiệm Khoa Học Tranh Cãi
Ưu tiên:

```text
science
mystery
newspaper
vox
```

---

## Niche 15 — Đại Dương Học & Biển Sâu
Ưu tiên:

```text
wildlife
science
survival
```

---

## Niche 16 — Nghịch Lý Triết Học & Bẫy Tư Duy
Ưu tiên:

```text
kinetic
vox
chalk
tierlist
```

---

## Niche 17 — Công Nghệ Quân Sự & Khí Tài
Ưu tiên:

```text
chalk
tierlist
compare
newspaper
```

---

## Niche 18 — Thần Thoại & Các Cổ Mẫu Siêu Nhiên
Ưu tiên:

```text
folklore
tierlist
mystery
newspaper
```

---

# 4. Thay đổi kiến trúc quan trọng

## Không khóa:

```text
Acc01 = Folklore
Acc02 = Mystery
Acc03 = Newspaper
...
```

Cách này dễ tạo ra combination không phù hợp.

Ví dụ:

```text
Deep Space + Folklore
Geopolitics + Wildlife
Philosophy + Wildlife
```

có thể rất gượng.

Thay vào đó, sử dụng:

# Compatibility Matrix

```text
Niche
  ↓
Topic
  ↓
Angle
  ↓
Template Compatibility Scoring
  ↓
Channel DNA
  ↓
Video
```

---

# 5. Compatibility Matrix

Ví dụ:

```yaml
niche: deep_space

templates:
  science:
    score: 1.00

  vox:
    score: 0.95

  kinetic:
    score: 0.85

  tierlist:
    score: 0.80

  survival:
    score: 0.75

  mystery:
    score: 0.60

  newspaper:
    score: 0.50

  chalk:
    score: 0.45

  folklore:
    score: 0.15

  wildlife:
    score: 0.10
```

Planner chỉ chọn engine:

```text
score >= template_min_score
```

Ví dụ:

```yaml
template_min_score: 0.55
```

---

# 6. Channel DNA

Đây là thành phần bắt buộc.

Mỗi channel có file config riêng.

Ví dụ:

```yaml
channel_id: space_07

name: Cosmic Impossible

niche:
  id: deep_space

persona:
  tone: curious
  personality: mysterious
  complexity: medium
  humor: low

audience:
  age:
    min: 18
    max: 34

story:
  hook_style:
    - impossible_question
    - shocking_scale
    - hidden_fact

  pacing: progressive_reveal

  duration:
    min: 35
    max: 55

visual:
  preferred_engines:
    - science
    - vox
    - kinetic

  style: cinematic_space

  palette:
    - deep_black
    - cosmic_blue
    - violet

  cut_rate_seconds: 2.8

voice:
  voice_id: male_03
  speed: 1.05
  pitch: -1

audio:
  music_family: cosmic_ambient
  sfx_density: medium

editorial:
  source_required: true
  min_sources: 2

publishing:
  language: en
  timezone: Europe/Berlin

analytics:
  learning_enabled: true
```

---

# 7. Kiến trúc tổng thể 8 Layer

```text
┌────────────────────────────────────────┐
│ 1. TOPIC INTELLIGENCE                  │
│ topic pool / trend / evergreen         │
├────────────────────────────────────────┤
│ 2. CHANNEL DNA                         │
│ identity / persona / audience          │
├────────────────────────────────────────┤
│ 3. STORY ENGINE                        │
│ angle / hook / script / storyboard     │
├────────────────────────────────────────┤
│ 4. CREATIVE ENGINE                     │
│ image / canvas / TTS / music / SFX     │
├────────────────────────────────────────┤
│ 5. QA ENGINE                           │
│ originality / facts / visual / audio   │
├────────────────────────────────────────┤
│ 6. RENDER ORCHESTRATOR                 │
│ queue / retry / resume / manifest      │
├────────────────────────────────────────┤
│ 7. PUBLISH MANAGER                     │
│ schedule / metadata / audit            │
├────────────────────────────────────────┤
│ 8. ANALYTICS & LEARNING                │
│ metrics → update Channel DNA           │
└────────────────────────────────────────┘
```

---

# 8. Layer 1 — Topic Intelligence

Nhiệm vụ:

```text
discover topic
score topic
deduplicate topic
assign niche
assign channel
generate angles
```

Topic object:

```json
{
  "topic_id": "bermuda_triangle",
  "title": "Bermuda Triangle",
  "niche": "historical_mystery",
  "type": "evergreen",
  "priority": 0.82,
  "status": "READY"
}
```

Topic pool:

```text
topics
├── trending
├── evergreen
├── seasonal
├── series
└── manual
```

---

# 9. Layer 2 — Channel DNA

Channel DNA quyết định:

```text
Who is speaking?
For whom?
How?
With what visual identity?
At what pace?
Using which engines?
```

Một topic có thể được dùng bởi nhiều channel nếu:

```text
angle khác
story structure khác
visual language khác
voice khác
channel identity khác
```

---

# 10. Layer 3 — Story Engine

Pipeline:

```text
Topic
 ↓
Angle Generator
 ↓
Hook Generator
 ↓
Story Blueprint
 ↓
Script
 ↓
Storyboard
```

## Angle Generator

Ví dụ:

```text
Topic:
Bermuda Triangle
```

Sinh:

```text
Angle 01:
Flight 19

Angle 02:
Methane hypothesis

Angle 03:
Compass anomaly

Angle 04:
Famous ship disappearances

Angle 05:
Scientific explanation
```

---

# 11. Story Blueprint

Không để AI tự viết hoàn toàn tự do.

Dùng blueprint.

Ví dụ:

```yaml
blueprint: mystery_reveal

beats:
  - hook
  - setup
  - anomaly
  - clue_1
  - clue_2
  - contradiction
  - reveal
  - unresolved_question
```

Hoặc:

```yaml
blueprint: science_explainer

beats:
  - impossible_question
  - simple_explanation
  - scale_comparison
  - mechanism
  - consequence
  - final_fact
```

---

# 12. Layer 4 — Creative Engine

Bao gồm:

```text
Image AI
Canvas
Typography
TTS
Music
SFX
Subtitle
Transitions
```

---

# 13. Visual Director

Không nên:

```text
Scene
 ↓
Prompt
 ↓
AI Image
```

Nên:

```text
Scene Intent
 ↓
Visual Director
 ↓
Style Bible
 ↓
Prompt Compiler
 ↓
Image Generator
 ↓
Image QA
```

---

# 14. Style Bible

Ví dụ cho Mystery:

```yaml
style_id: mystery_dark_v1

palette:
  - desaturated_blue
  - charcoal
  - dirty_white

camera:
  - evidence_macro
  - overhead_desk
  - close_up

lighting:
  - low_key
  - single_source

texture:
  - film_grain
  - paper
  - dust

avoid:
  - anime
  - cartoon
  - bright_neon
  - oversaturated
```

---

# 15. Image Generation Pipeline

Sử dụng:

```text
image_routes.py
antigravity-images.mjs
```

Pipeline:

```text
Storyboard
 ↓
Visual Prompt Compiler
 ↓
Antigravity Queue
 ↓
Image
 ↓
Image QA
 ↓
Asset Registry
```

Ảnh mặc định:

```text
Aspect Ratio: 9:16
```

---

# 16. Audio Engine

Bao gồm:

```text
TTS
music
ambient
SFX
audio ducking
normalization
```

Config:

```yaml
voice:
  provider: capcut
  voice_id: male_03
  speed: 1.05

music:
  family: cinematic_dark
  volume: -22

sfx:
  density: medium

ducking:
  enabled: true
```

---

# 17. Layer 5 — QA Engine

QA phải có nhiều tầng.

---

# 18. Script QA

Kiểm tra:

```text
hook
logic
duplicate ideas
duration
grammar
factual claims
unsafe claims
story completeness
channel tone
```

Output:

```json
{
  "status": "PASS",
  "score": 0.91
}
```

---

# 19. Content Registry

Mục tiêu:

- Không để mạng lưới tự tạo quá nhiều video gần giống nhau.
- Theo dõi lịch sử nội dung.
- Phát hiện topic / angle / hook / script lặp lại.

Schema:

```text
content_registry
├── content_id
├── channel_id
├── topic
├── angle
├── hook
├── blueprint
├── script
├── script_embedding
├── scene_structure
├── visual_style
├── prompts
├── voice
├── publish_date
└── performance
```

---

# 20. Originality Check

Trước render:

```text
New Script
   ↓
Similarity Engine
   ↓
┌───────────────┐
│ Similarity OK │ → Render
└───────────────┘

hoặc

┌──────────────────┐
│ Similarity High  │
└──────────────────┘
        ↓
 Regenerate Angle
```

Kiểm tra:

```text
topic similarity
angle similarity
hook similarity
semantic script similarity
scene structure similarity
visual prompt similarity
caption similarity
```

---

# 21. Asset QA

Kiểm tra:

```text
missing image
wrong ratio
broken file
bad crop
text unreadable
style mismatch
visual inconsistency
```

---

# 22. Video QA

Sau render:

```text
9:16
audio exists
subtitle visible
safe margin
no black frames
no missing asset
no clipping
correct duration
no duplicate scene
no broken transition
```

Chỉ video đạt QA mới được chuyển:

```text
READY_TO_PUBLISH
```

---

# 23. Layer 6 — Render Orchestrator

Không dùng duy nhất một CLI script để điều khiển toàn bộ production.

`batch-matrix.mjs` vẫn giữ lại như command interface.

Nhưng phía sau cần:

```text
JOB ORCHESTRATOR
```

---

# 24. Production Flow

```text
                 TOPIC POOL
                     │
                     ▼
             CONTENT PLANNER
                     │
                     ▼
              JOB ORCHESTRATOR
                     │
       ┌─────────────┼──────────────┐
       ▼             ▼              ▼
 SCRIPT QUEUE     IMAGE QUEUE    AUDIO QUEUE
       │             │              │
       └─────────────┼──────────────┘
                     ▼
                 QA GATE
                     │
                     ▼
              RENDER QUEUE
                     │
                     ▼
                VIDEO QA
                     │
                     ▼
               PUBLISH QUEUE
                     │
                     ▼
                 ANALYTICS
```

---

# 25. Job State Machine

```text
CREATED
 ↓
SCRIPTING
 ↓
SCRIPT_READY
 ↓
ASSET_GENERATING
 ↓
ASSET_READY
 ↓
QA_PENDING
 ↓
READY_TO_RENDER
 ↓
RENDERING
 ↓
VIDEO_QA
 ↓
READY_TO_PUBLISH
 ↓
PUBLISHED
```

Failure:

```text
FAILED
RETRYING
DEAD_LETTER
```

---

# 26. Job Schema

```json
{
  "job_id": "20260923_space_038",

  "channel_id": "space_07",

  "topic_id": "black_hole_038",

  "engine": "science",

  "state": "RENDERING",

  "script_version": "v3",

  "prompt_version": "science_v7",

  "renderer_version": "2.4.1",

  "retry": 1
}
```

---

# 27. Orchestrator Requirements

Bắt buộc có:

```text
queue
retry
dead letter queue
idempotency
concurrency limit
resume failed jobs
job timeout
cost accounting
asset manifest
prompt version
render version
audit log
```

---

# 28. Resume Render

Ví dụ video 12 scene:

```text
scene 01 ✓
scene 02 ✓
scene 03 ✓
...
scene 07 ✓
scene 08 ✗
```

System phải resume:

```text
scene 08
```

Không regenerate lại toàn bộ video.

---

# 29. Batch Matrix CLI

Giữ command:

```bash
node compare_studio/tools/batch-matrix.mjs \
"Tam Giác Quỷ Bermuda" \
--topic-id 2 \
--render
```

Nhưng CLI chỉ có nhiệm vụ:

```text
create batch
 ↓
push jobs
 ↓
display status
```

Không trực tiếp xử lý toàn bộ pipeline.

---

# 30. Ví dụ Bermuda Matrix

Topic:

```text
Tam Giác Quỷ Bermuda
```

Có thể sinh:

```text
Mystery
→ Flight 19

Newspaper
→ Newspapers from 1945

Vox
→ Scientific explanations

Chalk
→ Gulf Stream map

Science
→ Magnetic anomaly

Survival
→ Survive a sinking ship

Tierlist
→ 5 famous disappearances

Kinetic
→ 3 Bermuda facts

Wildlife
→ Deep sea creatures

Folklore
→ Sailor legends
```

Không bắt buộc tất cả 10 engine phải được dùng.

Planner chỉ chọn các engine đủ compatibility score.

---

# 31. Layer 7 — Publish Manager

Publish Manager chịu trách nhiệm:

```text
channel assignment
schedule
caption
hashtags
publishing status
retry
audit
```

Database hiện tại:

```text
bkt_channels.db
```

Có thể giữ lại nhưng nên chuẩn hóa thành:

```text
channels
publish_jobs
publish_logs
credentials
platform_status
```

---

# 32. Publish Manifest

Ví dụ:

```json
{
  "video_id": "vid_00038",
  "channel_id": "space_07",

  "caption": "What happens inside a black hole?",

  "hashtags": [
    "space",
    "science",
    "blackhole"
  ],

  "publish_at": "2026-09-25T18:30:00Z",

  "ai_generated": true,

  "requires_ai_label": true,

  "status": "SCHEDULED"
}
```

---

# 33. Layer 8 — Analytics & Learning

Đây là loop quan trọng nhất.

```text
Generate
 ↓
Publish
 ↓
Collect Metrics
 ↓
Analyze
 ↓
Update Channel Strategy
 ↓
Generate Next Video
```

---

# 34. Metrics

Thu thập:

```text
views
watch_time
avg_watch_time
completion_rate
rewatch_rate
likes
comments
shares
favorites
followers_gain
```

---

# 35. Content Feature Tracking

Không chỉ lưu video performance.

Lưu feature:

```text
hook_style
blueprint
duration
voice
engine
visual_style
cut_rate
music_family
topic_type
CTA
```

---

# 36. Learning Example

Ví dụ:

```text
Hook A
completion = 31%

Hook B
completion = 47%

Hook C
completion = 64%
```

Planner update:

```text
Hook C probability ↑
Hook B probability →
Hook A probability ↓
```

Không hard-code winner.

Sử dụng weighted exploration để tránh channel bị lặp công thức.

---

# 37. Risk Level Theo Niche

## Level 1

```text
Animals
Space
Ancient Civilization
Ocean
Philosophy
```

QA thông thường.

---

## Level 2

```text
Mystery
Folklore
Economics
AI
Survival
```

Cần source / claim check ở mức trung bình.

---

## Level 3

```text
Medicine
Current Geopolitics
Military
Crime
Disasters
```

Yêu cầu:

```text
source verification
date verification
claim classification
human review option
```

---

# 38. Data Model

Khuyến nghị database:

```text
channels
channel_dna
topics
topic_angles
content_jobs
scripts
storyboards
assets
renders
content_registry
publish_jobs
analytics
experiments
```

---

# 39. Suggested Folder Structure

```text
compare_studio/
│
├── config/
│   ├── channels/
│   │   ├── space_01.yaml
│   │   ├── space_02.yaml
│   │   └── ...
│   │
│   ├── niches/
│   │   ├── deep_space.yaml
│   │   └── ...
│   │
│   ├── styles/
│   │   ├── mystery_dark_v1.yaml
│   │   └── ...
│   │
│   └── compatibility/
│       └── matrix.yaml
│
├── planner/
│   ├── topic-planner.mjs
│   ├── angle-generator.mjs
│   ├── template-selector.mjs
│   └── channel-selector.mjs
│
├── story/
│   ├── hook-generator.mjs
│   ├── blueprint-engine.mjs
│   ├── script-generator.mjs
│   └── storyboard-generator.mjs
│
├── creative/
│   ├── visual-director.mjs
│   ├── prompt-compiler.mjs
│   ├── image-generator.mjs
│   ├── audio-engine.mjs
│   └── subtitle-engine.mjs
│
├── qa/
│   ├── script-qa.mjs
│   ├── similarity-check.mjs
│   ├── asset-qa.mjs
│   └── video-qa.mjs
│
├── orchestrator/
│   ├── job-manager.mjs
│   ├── queue.mjs
│   ├── retry.mjs
│   └── worker.mjs
│
├── render/
│   ├── folklore/
│   ├── mystery/
│   ├── newspaper/
│   ├── vox/
│   ├── chalk/
│   ├── science/
│   ├── survival/
│   ├── tierlist/
│   ├── kinetic/
│   └── wildlife/
│
├── publish/
│   ├── publish-manager.py
│   ├── publish-flow.py
│   └── publish-kit.py
│
├── analytics/
│   ├── collector.py
│   ├── analyzer.py
│   └── strategy-updater.py
│
└── tools/
    ├── batch-matrix.mjs
    └── batch-global.mjs
```

---

# 40. API Đề Xuất

## Create Topic

```http
POST /api/topics
```

---

## Generate Angles

```http
POST /api/topics/:id/angles
```

---

## Create Matrix

```http
POST /api/matrix/generate
```

Body:

```json
{
  "topic_id": "bermuda_triangle",
  "channels": 10,
  "render": true
}
```

---

## Job Status

```http
GET /api/jobs/:job_id
```

---

## Batch Status

```http
GET /api/batches/:batch_id
```

---

## Retry Job

```http
POST /api/jobs/:job_id/retry
```

---

# 41. UI — Xưởng Video AI

Thêm button:

```text
TẠO MA TRẬN VIDEO
```

Modal:

```text
Topic

Niche

Number of Videos

Preferred Channels

Preferred Engines

Generate Script
Generate Assets
Render
Schedule
```

---

# 42. Matrix Dashboard

Ví dụ:

```text
Topic:
Bermuda Triangle

┌────────────┬────────────┬────────────┐
│ Channel    │ Engine     │ Status     │
├────────────┼────────────┼────────────┤
│ mystery_01 │ Mystery    │ Rendered   │
│ science_02 │ Science    │ Rendering  │
│ vox_03     │ Vox        │ QA         │
│ kinetic_04 │ Kinetic    │ Queued     │
└────────────┴────────────┴────────────┘
```

---

# 43. Cost Tracking

Mỗi job phải ghi:

```text
LLM tokens
image generation
TTS
render time
storage
publishing
```

Schema:

```json
{
  "job_id": "job_001",

  "cost": {
    "llm": 0.04,
    "images": 0.18,
    "tts": 0.03,
    "render": 0.02
  },

  "total": 0.27
}
```

---

# 44. Rollout Plan

Không triển khai 180 channel ngay.

---

## Phase 1 — Pilot

```text
2 niches
×
5 channels
=
10 channels
```

Khuyến nghị:

```text
Deep Space
+
Mystery
```

Test:

```text
20 video / channel
```

Tổng:

```text
~200 videos
```

Mục tiêu:

```text
validate pipeline
validate queue
validate QA
validate cost
validate styles
validate analytics
```

---

# 45. Phase 2 — Scale 30–50 Channels

```text
6 niches
×
5–8 channels
≈
30–48 channels
```

Mục tiêu:

```text
stress test
scheduler
job recovery
asset storage
analytics
```

---

# 46. Phase 3 — Full Network

Sau khi Phase 2 ổn:

```text
18 niches
up to
180 channels
```

Không bắt buộc mọi niche phải có đủ 10 channel.

Chỉ scale niche có:

```text
content supply
consistent quality
manageable production cost
stable pipeline
```

---

# 47. Development Roadmap

## Sprint 1

Build:

```text
Channel DNA
Compatibility Matrix
Topic Planner
```

---

## Sprint 2

Build:

```text
Angle Generator
Blueprint Engine
Script Generator
```

---

## Sprint 3

Build:

```text
Visual Director
Prompt Compiler
Style Bible
```

---

## Sprint 4

Build:

```text
Job Orchestrator
Queue
Retry
Resume
```

---

## Sprint 5

Build:

```text
Content Registry
Similarity QA
Asset QA
Video QA
```

---

## Sprint 6

Build:

```text
Publish Manager
Scheduler
Audit Log
```

---

## Sprint 7

Build:

```text
Analytics
Performance Features
Learning Loop
```

---

# 48. MVP Definition

MVP không phải 180 channel.

MVP là:

```text
1 Topic
 ↓
5 Channels
 ↓
5 Different Angles
 ↓
5 Compatible Templates
 ↓
5 Scripts
 ↓
Assets
 ↓
QA
 ↓
Render
 ↓
Ready to Publish
```

Chạy hoàn toàn tự động.

---

# 49. MVP Acceptance Criteria

MVP đạt nếu:

```text
✓ 1 topic tạo được 5 video khác nhau

✓ không có script duplicate rõ ràng

✓ mỗi video đúng Channel DNA

✓ engine được chọn đúng compatibility

✓ image generation chạy tự động

✓ TTS tự động

✓ subtitles tự động

✓ render 9:16 thành công

✓ failed job resume được

✓ QA detect missing asset

✓ content registry hoạt động

✓ publish manifest được tạo

✓ analytics schema sẵn sàng
```

---

# 50. Bước code đầu tiên

Ưu tiên không viết `batch-matrix.mjs` ngay.

Thứ tự nên là:

```text
1. Channel DNA schema

2. Niche schema

3. Compatibility Matrix

4. Template Selector

5. Angle Generator

6. Job schema

7. Job Orchestrator

8. batch-matrix.mjs
```

`batch-matrix.mjs` chỉ là interface phía trên hệ thống.

---

# 51. Kiến trúc cuối cùng

```text
                     TOPIC INTELLIGENCE
                             │
                             ▼
                        TOPIC POOL
                             │
                             ▼
                       ANGLE ENGINE
                             │
                             ▼
                    CHANNEL SELECTOR
                             │
                             ▼
                  COMPATIBILITY MATRIX
                             │
                             ▼
                       CHANNEL DNA
                             │
                             ▼
                       STORY ENGINE
                             │
                             ▼
                     VISUAL DIRECTOR
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
            IMAGE           TTS            SFX
               │             │             │
               └─────────────┼─────────────┘
                             ▼
                          QA GATE
                             │
                             ▼
                     RENDER ORCHESTRATOR
                             │
                             ▼
                         VIDEO QA
                             │
                             ▼
                      PUBLISH MANAGER
                             │
                             ▼
                         ANALYTICS
                             │
                             ▼
                     STRATEGY LEARNING
                             │
                             └──────→ CHANNEL DNA
```

---

# 52. Kết luận

Mục tiêu cuối cùng không phải chỉ xây một:

```text
AI Video Generator
```

mà là:

```text
AUTONOMOUS MULTI-CHANNEL
AI CONTENT OPERATING SYSTEM
```

Trong đó:

```text
Topic
+
Channel DNA
+
Story Engine
+
Creative Engine
+
QA
+
Render
+
Publish
+
Analytics
+
Learning
```

tạo thành một vòng sản xuất khép kín.

Điểm cốt lõi:

1. Không khóa `Acc ID = Template`.
2. Dùng Compatibility Matrix.
3. Mỗi channel có Channel DNA.
4. `batch-matrix.mjs` chỉ là command layer.
5. Production phải chạy qua Job Orchestrator.
6. Có Content Registry + Originality QA.
7. Có nhiều tầng QA trước khi publish.
8. Có Analytics Feedback Loop.
9. Rollout 10 → 30–50 → tối đa 180 channel.
10. Chỉ scale những niche chứng minh được chất lượng và tính ổn định.
