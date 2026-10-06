import fs from "node:fs";
import path from "node:path";

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket RPM + TPM lưu trong một file JSON, dùng chung cho mọi process trên máy.
 *
 * Autopilot chạy nhiều `batch-matrix` song song, mỗi cái có nhiều worker; nếu mỗi process
 * tự đếm hạn mức thì tổng vẫn vượt quota. Khoá bằng file tạo với cờ `wx` (nguyên tử trên
 * cùng một ổ đĩa); khoá bị bỏ lại quá `lockStaleMs` (process chết khi đang giữ) sẽ bị gỡ.
 * `cooldown()` khiến mọi process cùng dừng khi một process nhận 429.
 */
export class FileTokenBucket {
  constructor({
    statePath, rpm, tpm, lockStaleMs = 10_000, lockTimeoutMs = 30_000,
    now = Date.now, sleep = sleepMs, random = Math.random,
  }) {
    if (!statePath) throw new Error("statePath is required");
    if (!(rpm > 0) || !(tpm > 0)) throw new Error("rpm and tpm must be positive");
    Object.assign(this, { statePath, rpm, tpm, lockStaleMs, lockTimeoutMs, now, sleep, random });
    this.lockPath = `${statePath}.lock`;
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  }

  async #withLock(task) {
    const started = this.now();
    for (;;) {
      let fd;
      try {
        fd = fs.openSync(this.lockPath, "wx");
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (this.now() - fs.statSync(this.lockPath).mtimeMs > this.lockStaleMs) fs.rmSync(this.lockPath, { force: true });
        } catch { /* khoá vừa được nhả */ }
        if (this.now() - started > this.lockTimeoutMs) throw new Error(`rate limiter lock timeout: ${this.lockPath}`);
        await this.sleep(5 + this.random() * 20);
        continue;
      }
      try {
        return task();
      } finally {
        fs.closeSync(fd);
        fs.rmSync(this.lockPath, { force: true });
      }
    }
  }

  #read(now) {
    let state = {};
    try {
      state = JSON.parse(fs.readFileSync(this.statePath, "utf8"));
    } catch { /* file mới hoặc hỏng → bắt đầu đầy */ }
    const elapsedMin = Math.max(0, now - (Number(state.updated_at) || now)) / 60_000;
    return {
      requests: Math.min(this.rpm, (Number.isFinite(state.requests) ? state.requests : this.rpm) + elapsedMin * this.rpm),
      tokens: Math.min(this.tpm, (Number.isFinite(state.tokens) ? state.tokens : this.tpm) + elapsedMin * this.tpm),
      blocked_until: Number(state.blocked_until) || 0,
      updated_at: now,
    };
  }

  #write(state) {
    const temp = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state));
    fs.renameSync(temp, this.statePath);
  }

  /** Trừ hạn mức nếu đủ và trả 0; không đủ thì trả số ms cần chờ. */
  async tryAcquire(tokens) {
    const need = Math.min(Math.max(1, tokens), this.tpm);
    return this.#withLock(() => {
      const now = this.now();
      const state = this.#read(now);
      let wait = Math.max(0, state.blocked_until - now);
      if (!wait) {
        const requestWait = state.requests >= 1 ? 0 : ((1 - state.requests) / this.rpm) * 60_000;
        const tokenWait = state.tokens >= need ? 0 : ((need - state.tokens) / this.tpm) * 60_000;
        wait = Math.max(requestWait, tokenWait);
        if (!wait) {
          state.requests -= 1;
          state.tokens -= need;
        }
      }
      this.#write(state);
      return Math.ceil(wait);
    });
  }

  async acquire(tokens = 1) {
    for (;;) {
      const wait = await this.tryAcquire(tokens);
      if (!wait) return;
      await this.sleep(Math.min(wait, 5_000) + this.random() * 250);
    }
  }

  /** Còn bị chặn bao lâu (ms) do 429 trước đó; 0 = không bị chặn. */
  async blockedMs() {
    return this.#withLock(() => {
      const now = this.now();
      return Math.max(0, (this.#read(now).blocked_until || 0) - now);
    });
  }

  /** Nhận 429: chặn mọi process tới `ms` nữa (không rút ngắn cooldown đang có). */
  async cooldown(ms) {
    return this.#withLock(() => {
      const now = this.now();
      const state = this.#read(now);
      state.blocked_until = Math.max(state.blocked_until, now + Math.max(0, ms));
      this.#write(state);
    });
  }
}

export const unlimited = { acquire: async () => {}, cooldown: async () => {}, blockedMs: async () => 0 };
