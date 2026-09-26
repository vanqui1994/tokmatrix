"""
Bộ chạy kịch bản trên Chrome — port từ ChromeAiVisionRunner của nuoinickbaosam 11.10.14.

Giữ đúng các quy ước của bản gốc:
  - Toạ độ trong bước và toạ độ AI trả về đều theo thang TỈ LỆ 0-1000, quy đổi
    sang pixel theo kích thước khung nhìn ngay trước khi thao tác.
  - Sau khi quy đổi, điểm bấm được nắn về tâm phần tử thật dưới điểm đó (JS gốc).
  - Bước AiGoal lặp tối đa MaxSteps vòng, mỗi vòng chụp màn hình + liệt kê phần
    tử rồi hỏi AI một hành động duy nhất, dừng khi AI trả về "done".
  - Xoá ô nhập trước khi gõ bằng đúng chuỗi phím của bản gốc.
"""

import asyncio
import random
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    from bkt_web.ai_vision import (
        AiVisionError, AiVisionFlowStep, AiVisionSettings, AiVisionStepType,
        AiVisionTargetKind, decide_next_action, random_delay,
    )
    from bkt_web.browser_engine import collect_elements, slow_mouse_move, snap_to_element
except ImportError:
    from ai_vision import (
        AiVisionError, AiVisionFlowStep, AiVisionSettings, AiVisionStepType,
        AiVisionTargetKind, decide_next_action, random_delay,
    )
    from browser_engine import collect_elements, slow_mouse_move, snap_to_element

COORD_SCALE = 1000
DEFAULT_MAX_AI_STEPS = 25


@dataclass
class StepLog:
    """AiVisionStepLog"""
    index: int
    step_type: str
    message: str
    ok: bool = True
    at: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "index": self.index,
            "step_type": self.step_type,
            "message": self.message,
            "ok": self.ok,
            "at": self.at,
        }


@dataclass
class RunResult:
    """AiVisionRunResult"""
    success: bool = False
    message: str = ""
    logs: List[StepLog] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "message": self.message,
            "logs": [log.to_dict() for log in self.logs],
        }


_VARIABLE_RE = re.compile(r"\{([A-Za-z0-9_]+)\}")


def substitute(text: str, variables: Dict[str, str]) -> str:
    """AiVisionVariables — thay {ten_bien} bằng giá trị, giữ nguyên nếu chưa khai báo."""
    if not text:
        return ""
    return _VARIABLE_RE.sub(lambda m: str(variables.get(m.group(1), m.group(0))), text)


async def _viewport(page) -> tuple:
    size = page.viewport_size
    if size and size.get("width") and size.get("height"):
        return int(size["width"]), int(size["height"])
    dims = await page.evaluate("() => [window.innerWidth, window.innerHeight]")
    return int(dims[0]), int(dims[1])


async def to_pixels(page, x: int, y: int) -> tuple:
    """Quy đổi thang 0-1000 sang pixel theo khung nhìn hiện tại."""
    width, height = await _viewport(page)
    return int(x * width / COORD_SCALE), int(y * height / COORD_SCALE)


async def _click_at(page, x_scaled: int, y_scaled: int) -> tuple:
    px, py = await to_pixels(page, x_scaled, y_scaled)
    snapped = await snap_to_element(page, px, py)
    if snapped:
        px, py = snapped
    await slow_mouse_move(page, px, py)
    await page.mouse.click(px, py)
    return px, py


async def _remaining_input_length(page) -> int:
    """Độ dài chữ còn lại trong ô đang focus; -1 nếu không đọc được."""
    try:
        return int(await page.evaluate(
            "() => { const el = document.activeElement;"
            " if (!el) return -1;"
            " if (typeof el.value === 'string') return el.value.length;"
            " if (el.isContentEditable) return (el.textContent || '').length;"
            " return -1; }"
        ))
    except Exception:
        return -1


async def _clear_input(page) -> None:
    """
    Xoá ô nhập: bôi đen toàn bộ rồi Backspace, dự phòng Home/Delete.

    Bản gốc chạy trên Windows nên dùng Ctrl+A. Trên macOS phím bôi đen là Cmd+A,
    còn Ctrl+A chỉ đưa con trỏ về đầu dòng, nên phải dùng ControlOrMeta để
    Playwright tự chọn đúng phím theo hệ điều hành.
    """
    try:
        await page.keyboard.press("ControlOrMeta+A")
        await page.keyboard.press("Backspace")
    except Exception:
        pass

    remaining = await _remaining_input_length(page)
    if remaining == 0:
        return
    # Không đọc được độ dài thì giữ nguyên hạn mức cũ của bản gốc.
    deletes = remaining if remaining > 0 else 60
    try:
        await page.keyboard.press("Home")
        for _ in range(deletes):
            await page.keyboard.press("Delete")
    except Exception:
        pass


async def _run_ai_goal(
    page,
    step: AiVisionFlowStep,
    settings: AiVisionSettings,
    variables: Dict[str, str],
    logs: List[StepLog],
    index: int,
    on_step: Optional[Callable[[StepLog], None]],
) -> None:
    """Vòng lặp mục tiêu AI: chụp → liệt kê phần tử → hỏi AI → thực thi."""
    goal = substitute(step.goal, variables)
    max_steps = step.max_steps if step.max_steps > 0 else DEFAULT_MAX_AI_STEPS
    history: List[str] = []

    def emit(message: str, ok: bool = True) -> None:
        log = StepLog(index=index, step_type=step.type.value, message=message, ok=ok)
        logs.append(log)
        if on_step:
            on_step(log)

    for turn in range(max_steps):
        screenshot = await page.screenshot(type="png")
        elements = await collect_elements(page)
        action = await decide_next_action(
            settings, screenshot, goal, history, elements, AiVisionTargetKind.CHROME
        )

        verb = action.action
        if verb == "done":
            emit(f'Mục tiêu "{goal}" hoàn tất sau {turn} bước AI')
            return
        if verb == "wait":
            history.append(f"wait ({action.reason})")
            emit(f"Chờ tải: {action.reason}")
            await asyncio.sleep(1.0)
            continue
        if verb == "tap":
            if action.element_index is not None and 0 <= action.element_index < len(elements):
                element = elements[action.element_index]
                cx, cy = element.center
                await slow_mouse_move(page, cx, cy)
                await page.mouse.click(cx, cy)
                history.append(f'tap "{element.label}"')
                emit(f'Nhấn phần tử "{element.label}" - {action.reason}')
            else:
                px, py = await _click_at(page, action.x, action.y)
                history.append(f"tap ({action.x},{action.y})")
                emit(f"Nhấn toạ độ ({px},{py}) - {action.reason}")
        elif verb == "text":
            await page.keyboard.type(action.text)
            history.append(f'text "{action.text}"')
            emit(f'Gõ "{action.text}" - {action.reason}')
        elif verb == "keyevent":
            await page.keyboard.press(action.text or "Enter")
            history.append(f"keyevent {action.text}")
            emit(f"Nhấn phím {action.text} - {action.reason}")
        elif verb == "navigate":
            await page.goto(action.text)
            history.append(f"navigate {action.text}")
            emit(f"Mở {action.text} - {action.reason}")
        else:
            emit(f'AI trả về hành động lạ "{verb}", bỏ qua', ok=False)
            history.append(f"unknown {verb}")

        if settings.step_delay_ms:
            await asyncio.sleep(settings.step_delay_ms / 1000)

    raise AiVisionError(f'Mục tiêu "{goal}" chưa xong sau {max_steps} bước AI')


async def run_flow(
    page,
    flow: List[AiVisionFlowStep],
    settings: AiVisionSettings,
    variables: Optional[Dict[str, str]] = None,
    on_step: Optional[Callable[[StepLog], None]] = None,
) -> RunResult:
    """
    ChromeAiVisionRunner.RunFlowForNickAsync — chạy tuần tự các bước, dừng ngay
    khi một bước lỗi và báo đúng bước nào hỏng.
    """
    variables = variables or {}
    logs: List[StepLog] = []

    def emit(index: int, step_type: str, message: str, ok: bool = True) -> None:
        log = StepLog(index=index, step_type=step_type, message=message, ok=ok)
        logs.append(log)
        if on_step:
            on_step(log)

    for index, step in enumerate(flow):
        try:
            if step.type == AiVisionStepType.AI_GOAL:
                await _run_ai_goal(page, step, settings, variables, logs, index, on_step)

            elif step.type == AiVisionStepType.WAIT:
                await asyncio.sleep(step.wait_ms / 1000)
                emit(index, step.type.value, f"Chờ {step.wait_ms}ms")

            elif step.type == AiVisionStepType.RANDOM_WAIT:
                delay = random_delay(step.random_min_ms, step.random_max_ms)
                await asyncio.sleep(delay / 1000)
                emit(index, step.type.value, f"Chờ ngẫu nhiên {delay}ms")

            elif step.type == AiVisionStepType.TAP:
                px, py = await _click_at(page, step.x, step.y)
                emit(index, step.type.value, f"Nhấn ({px},{py})")

            elif step.type == AiVisionStepType.SWIPE:
                x1, y1 = await to_pixels(page, step.x, step.y)
                x2, y2 = await to_pixels(page, step.x2, step.y2)
                await page.mouse.move(x1, y1)
                await page.mouse.down()
                await page.mouse.move(x2, y2, steps=random.randint(14, 28))
                await page.mouse.up()
                emit(index, step.type.value, f"Vuốt ({x1},{y1})→({x2},{y2})")

            elif step.type == AiVisionStepType.TEXT:
                # Bản gốc: nếu bước có đánh dấu ô nhập thì tap ô đó trước khi gõ
                if step.x or step.y:
                    await _click_at(page, step.x, step.y)
                    await _clear_input(page)
                value = substitute(step.text, variables)
                await page.keyboard.type(value)
                emit(index, step.type.value, f'Gõ "{value}"')

            elif step.type == AiVisionStepType.GOTO:
                url = substitute(step.url or step.text, variables)
                await page.goto(url)
                emit(index, step.type.value, f"Mở {url}")

            elif step.type == AiVisionStepType.SCROLL:
                dx, dy = await to_pixels(page, step.x2, step.y2)
                await page.mouse.wheel(dx, dy)
                emit(index, step.type.value, f"Cuộn ({dx},{dy})")

            elif step.type == AiVisionStepType.KEY_PRESS:
                await page.keyboard.press(step.text or "Enter")
                emit(index, step.type.value, f"Nhấn phím {step.text}")

            else:
                emit(index, str(step.type), "Loại bước không hỗ trợ", ok=False)
                return RunResult(False, f"Bước {index + 1} có loại không hỗ trợ", logs)

            if settings.step_delay_ms and step.type != AiVisionStepType.AI_GOAL:
                await asyncio.sleep(settings.step_delay_ms / 1000)

        except Exception as exc:
            emit(index, step.type.value, str(exc), ok=False)
            return RunResult(False, f"Bước {index + 1} ({step.type_label}) lỗi: {exc}", logs)

    return RunResult(True, f"Chạy xong {len(flow)} bước", logs)
