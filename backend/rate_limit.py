"""
A minimal in-memory rate limiter — good enough for a single-process deployment.

Note: state lives in this process's memory, so it resets on every restart/deploy,
and won't be shared if this is ever scaled to multiple instances behind a load
balancer. If that ever happens, swap this for a Redis-backed limiter (or the
`slowapi` package) so the counters are shared across processes.
"""
import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

# key -> list of timestamps (seconds) of recent attempts
_attempts: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_attempts: int = 5, window_seconds: int = 60):
    """FastAPI dependency factory: allows `max_attempts` calls per `window_seconds`
    per (route, client IP). Raises 429 once the limit is exceeded."""

    def dependency(request: Request):
        client_ip = request.client.host if request.client else "unknown"
        key = f"{request.url.path}:{client_ip}"
        now = time.time()
        window_start = now - window_seconds

        recent = [t for t in _attempts[key] if t > window_start]
        if len(recent) >= max_attempts:
            retry_in = int(window_seconds - (now - recent[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {max(retry_in, 1)}s.",
            )

        recent.append(now)
        _attempts[key] = recent

    return dependency
