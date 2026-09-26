# TokMatrix ↔ Antigravity Script Bridge

1. TokMatrix đưa yêu cầu kịch bản vào hàng đợi Antigravity.
2. Chạy `python3 bkt_web/antigravity_scriptwriter.py pull` để claim và tạo file trong `inbox/`.
3. Agent Antigravity đọc file `.md`, viết kịch bản theo yêu cầu.
4. Agent xuất JSON kịch bản vào `outbox/`.
5. Chạy `python3 bkt_web/antigravity_scriptwriter.py watch` để tự nhập và đóng task.

Không cần API key. Agent viết kịch bản trực tiếp.
