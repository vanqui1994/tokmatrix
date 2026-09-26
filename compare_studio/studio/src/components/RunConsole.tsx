import { useEffect, useRef } from "react";
import { CircleCheck } from "lucide-react";
import type { LogLine, Task } from "../api";
import { Badge, Button, Card } from "./ui";
import { cn } from "../lib/utils";

const TASK_LABEL: Record<Task, string> = { check: "check", render: "render", vo: "sinh VO", fit: "khớp thời lượng", create: "tạo video mới", batch_global: "tạo 6 video toàn cầu" };

export function RunConsole({
  task,
  lines,
  running,
  exitCode,
  onStop,
}: {
  task: Task | null;
  lines: LogLine[];
  running: boolean;
  exitCode: number | null;
  onStop: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail, but stop fighting the user the moment they scroll up.
  useEffect(() => {
    const el = boxRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const status = running
    ? `Đang chạy ${task ? TASK_LABEL[task] : ""}`
    : exitCode == null
      ? "Chưa chạy lệnh nào"
      : exitCode === 0
        ? `Xong: ${task ? TASK_LABEL[task] : ""} thành công`
        : `Lỗi: ${task ? TASK_LABEL[task] : ""} thoát với mã ${exitCode}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2">
          {running ? (
            <span className="size-2.5 animate-pulse rounded-full bg-gold" aria-hidden="true" />
          ) : exitCode === 0 ? (
            <CircleCheck className="size-4 text-sage" aria-hidden="true" />
          ) : exitCode == null ? (
            <span className="size-2.5 rounded-full bg-line-strong" aria-hidden="true" />
          ) : (
            <span className="size-2.5 rounded-full bg-terra" aria-hidden="true" />
          )}
          {/* One atomic status message rather than a bare live number */}
          <span role="status" aria-atomic="true" className="text-sm font-semibold">
            {status}
          </span>
          <Badge tone="neutral">{lines.length} dòng log</Badge>
        </div>
        {running && (
          <Button size="sm" variant="danger" onClick={onStop}>
            Dừng
          </Button>
        )}
      </div>
      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="scroll-thin h-72 overflow-y-auto bg-[#332a20] px-4 py-3 font-mono text-[12.5px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <p className="text-[#a2937c]">
            Log sẽ hiện ở đây. Bấm <span className="text-[#e7d9b4]">Check</span>,{" "}
            <span className="text-[#e7d9b4]">Render</span> hoặc{" "}
            <span className="text-[#e7d9b4]">Sinh lại VO</span> để bắt đầu.
          </p>
        ) : (
          lines.map((l, i) => (
            <div
              key={i}
              className={cn("whitespace-pre-wrap break-words", l.stream === "err" ? "text-[#f0a58a]" : "text-[#ece6c2]")}
            >
              {l.line}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
