"""
Login/register rate limiter — locks out an IP for `lockout_seconds` once it
racks up `max_attempts` failed attempts within `window_seconds`.

Design notes (important — this replaces a pure sliding-window counter):
- Only FAILED attempts count against the limit. A successful login clears
  the failure history for that key, but does NOT clear an already-active
  lockout — a lockout must be waited out in full even if the correct
  password is entered partway through.
- Once a lockout is triggered it holds for the full `lockout_seconds`,
  regardless of request activity in the meantime. It does not "reset" just
  because older failed timestamps have aged out of the counting window —
  that was the bug: a pure rolling window lets the count drop back under
  the threshold mid-lockout, which both flips the error message back to
  "Invalid email or password" and lets a well-timed correct attempt slip
  through.

State lives in this process's memory: it resets on restart and won't be
shared across multiple worker processes/instances. Swap for a Redis-backed
limiter (or the `slowapi` package) if this ever scales to multiple processes.
"""
import time
from collections import defaultdict
from fastapi import Request, HTTPException, status

_failures: dict[str, list[float]] = defaultdict(list)
_locked_until: dict[str, float] = {}


def _key(request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    return f"{request.url.path}:{client_ip}"


def check_lockout(request: Request) -> str:
    """FastAPI dependency: call at the top of a route. Raises 429 if the
    caller is currently locked out. Returns the rate-limit key so the route
    can report a failure or a success afterward."""
    key = _key(request)
    now = time.time()
    locked_until = _locked_until.get(key)

    if locked_until is not None:
        if now < locked_until:
            retry_in = int(locked_until - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {max(retry_in, 1)}s.",
            )
        # Lockout period has fully elapsed — clear it and start fresh.
        del _locked_until[key]
        _failures.pop(key, None)

    return key


def record_failure(key: str, max_attempts: int = 5, window_seconds: int = 60, lockout_seconds: int = 60):
    """Call after a failed auth attempt. Raises 429 immediately if this
    failure tips the count over the threshold, and starts a lockout that
    holds for `lockout_seconds` no matter what happens afterward."""
    now = time.time()
    window_start = now - window_seconds
    recent = [t for t in _failures[key] if t > window_start]
    recent.append(now)
    _failures[key] = recent

    if len(recent) >= max_attempts:
        _locked_until[key] = now + lockout_seconds
        _failures.pop(key, None)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {lockout_seconds}s.",
        )


def clear_failures(key: str):
    """Call after a successful auth. Resets the failure counter. Does NOT
    clear an active lockout — see module docstring."""
    _failures.pop(key, None)