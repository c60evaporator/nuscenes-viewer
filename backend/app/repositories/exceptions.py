"""Repository 層のカスタム例外."""

class OptimisticLockError(Exception):
    """楽観的ロックの競合発生時に投げる."""
    def __init__(self, current_version: int, expected_version: int | None):
        self.current_version  = current_version
        self.expected_version = expected_version
        super().__init__(
            f"Optimistic lock conflict: expected version={expected_version}, "
            f"but current version={current_version}"
        )
