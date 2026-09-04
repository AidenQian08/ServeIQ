"""
Login rate limiter — brute-force protection.

Combines two independent trackers (rather than a single combined
"IP_email" key), because each catches a different attack pattern:

- Account-level (keyed by email): locks the specific account for
  ACCOUNT_LOCKOUT_SECONDS after ACCOUNT_MAX_ATTEMPTS consecutive failed
  logins — regardless of which IP the attempts come from. This is what
  stops a botnet that spreads guesses for one account across many IPs to
  dodge a pure IP-based limit.
- IP-level (keyed by client IP): a generic flood guard — at most
  IP_MAX_ATTEMPTS requests per IP_WINDOW_SECONDS, regardless of which
  account is targeted. This stops one IP from spraying guesses across many
  different accounts.

A request is blocked if EITHER tracker is tripped. The account lock is
checked BEFORE the password is even verified, so a correct password can
never bypass an active lockout — the wait must be served out in full.
A success clears the account's failure counter, but only if no lockout is
currently active (a legit user who mistypes a password once or twice isn't
punished once they get it right).

State lives in this process's memory — resets on restart, and won't be
shared across multiple worker processes/instances. For production, swap
this for a Redis-backed store (e.g. via `redis` + a Lua script, or the
`slowapi` package) so counts are shared and durable.
"""
import time
from collections import defaultdict
from fastapi import HTTPException, status

ACCOUNT_MAX_ATTEMPTS = 5
ACCOUNT_LOCKOUT_SECONDS = 15 * 60   # 15 minutes

IP_MAX_ATTEMPTS = 10
IP_WINDOW_SECONDS = 60             # 10 attempts/minute per IP, any account

_account_failures: dict[str, int] = defaultdict(int)
_account_locked_until: dict[str, float] = {}

_ip_attempts: dict[str, list[float]] = defaultdict(list)


def _check_account_lock(email: str):
    locked_until = _account_locked_until.get(email)
    if locked_until is None:
        return
    now = time.time()
    if now < locked_until:
        retry_in = int(locked_until - now)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts on this account. Try again in {max(retry_in, 1)}s.",
        )
    # Lockout period has fully elapsed — clear it and start fresh.
    del _account_locked_until[email]
    _account_failures.pop(email, None)


def check_ip_flood(client_ip: str):
    """Generic per-IP flood guard, independent of any account. Used
    directly by routes (like /register) that have no per-account concept,
    and also called from check_rate_limit() for the login route."""
    now = time.time()
    window_start = now - IP_WINDOW_SECONDS
    recent = [t for t in _ip_attempts[client_ip] if t > window_start]
    _ip_attempts[client_ip] = recent
    if len(recent) >= IP_MAX_ATTEMPTS:
        retry_in = int(IP_WINDOW_SECONDS - (now - recent[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests from this network. Try again in {max(retry_in, 1)}s.",
        )


def check_rate_limit(client_ip: str, email: str):
    """Call at the top of the login route, before touching the DB or
    verifying the password. Raises 429 if either the account or the IP is
    currently rate-limited."""
    _check_account_lock(email)
    check_ip_flood(client_ip)


def record_attempt(client_ip: str):
    """Call for every login attempt (success or failure) to count it
    against the IP-level flood guard."""
    _ip_attempts[client_ip].append(time.time())


def record_failure(email: str):
    """Call after a failed auth attempt. Locks the account for
    ACCOUNT_LOCKOUT_SECONDS once ACCOUNT_MAX_ATTEMPTS is reached."""
    _account_failures[email] += 1
    if _account_failures[email] >= ACCOUNT_MAX_ATTEMPTS:
        _account_locked_until[email] = time.time() + ACCOUNT_LOCKOUT_SECONDS
        _account_failures.pop(email, None)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts on this account. Try again in {ACCOUNT_LOCKOUT_SECONDS}s.",
        )


def record_success(email: str):
    """Call after a successful login. Clears the account's failure count.
    (If a lockout is somehow already active, check_rate_limit already
    blocked the request before this can even run.)"""
    _account_failures.pop(email, None)
