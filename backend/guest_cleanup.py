"""
Background sweep for abandoned guest accounts.

Guest accounts are meant to be deleted the moment the user logs out (see
POST /auth/logout in routers/auth.py) — but if someone just closes the
tab without logging out, that deletion never fires. This sweep is the
safety net: it periodically deletes any guest account older than one
token lifetime (so it can't still be in active use), cascading through
its matches/points via the same ORM + DB-level cascade as an explicit
logout.

This runs as an in-process background task rather than a separate cron
job, for simplicity. The tradeoff: it only runs while the app itself is
warm, which matters on a host like Render's free tier that spins down
when idle — an abandoned guest created right before the app goes idle
won't be swept until the next request wakes it back up. A dedicated
Render Cron Job would be more robust if abandoned guests ever become a
real problem at the scale this app is running at.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from database import SessionLocal
import models
from auth_utils import TOKEN_EXPIRE_MINUTES

logger = logging.getLogger("guest_cleanup")

SWEEP_INTERVAL_SECONDS = 30 * 60   # run every 30 minutes


def cleanup_expired_guests():
    """Delete any guest account whose token has already expired. Cascades
    through matches/points via the same relationship cascade used by the
    explicit /auth/logout deletion."""
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=TOKEN_EXPIRE_MINUTES)
        stale_guests = (
            db.query(models.User)
            .filter(models.User.is_guest == True, models.User.created_at < cutoff)  # noqa: E712
            .all()
        )
        for guest in stale_guests:
            db.delete(guest)
        if stale_guests:
            db.commit()
            logger.info("Swept %d abandoned guest account(s)", len(stale_guests))
    finally:
        db.close()


async def run_periodic_sweep():
    while True:
        try:
            cleanup_expired_guests()
        except Exception:
            logger.exception("Guest cleanup sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)