"""Canonical upload task states shared by scheduler, publisher and dashboards."""

PENDING = "PENDING"
QUEUED = "QUEUED"
UPLOADING = "UPLOADING"
SUCCESS = "SUCCESS"
ERROR = "ERROR"
WAITING_RENDER = "WAITING_RENDER"
NEEDS_CHECK = "NEEDS_CHECK"
CANCELLED = "CANCELLED"

QUEUE_STATES = (QUEUED, PENDING)
SLOT_BLOCKING_STATES = (QUEUED, PENDING, UPLOADING, SUCCESS, WAITING_RENDER, NEEDS_CHECK)
ISSUE_STATES = (ERROR, NEEDS_CHECK)
TERMINAL_STATES = (SUCCESS, ERROR, CANCELLED)

ALL_STATES = frozenset({
    PENDING, QUEUED, UPLOADING, SUCCESS, ERROR, WAITING_RENDER, NEEDS_CHECK, CANCELLED,
})


def sql_marks(values) -> str:
    """Return a safe placeholder list for a non-empty tuple/list of SQL values."""
    values = tuple(values)
    if not values:
        raise ValueError("values must not be empty")
    return ",".join("?" for _ in values)
