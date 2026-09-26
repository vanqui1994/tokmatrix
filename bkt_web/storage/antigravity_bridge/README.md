# TokMatrix ↔ Antigravity IDE bridge

1. TokMatrix đưa yêu cầu ảnh vào hàng đợi Antigravity.
2. Chạy `python3 bkt_web/antigravity_agent.py pull` để claim và tạo file trong `inbox/`.
3. Agent Antigravity đọc file `.md`, tạo ảnh bằng công cụ trong IDE.
4. Agent xuất ảnh đúng tên task vào `outbox/`.
5. Chạy `python3 bkt_web/antigravity_agent.py watch` để tự nhập ảnh và đóng task.

`agentapi` không được dùng để sinh ảnh; nó chỉ là language server của IDE.
Không đặt API key vào inbox/outbox.
