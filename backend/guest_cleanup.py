"""
Background sweep for expired sessions and the abandoned guest accounts
they leave behind.

Guest accounts are meant to be deleted the moment the user logs out (see
POST /auth/logout in routers/auth.py), which also deletes their one
session — but if someone just closes the tab without logging out, that
deletion never fires. This sweep is the safety net: it periodically
deletes expired session rows, then deletes any guest account left with no
sessions at all (a guest never logs back in, so once its one session is
gone it can no longer be reached). Cascades through matches/points via
the same ORM + DB-level cascade as an explicit logout.

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
from datetime import datetime

from database import SessionLocal
import models

logger = logging.getLogger("guest_cleanup")

SWEEP_INTERVAL_SECONDS = 30 * 60   # run every 30 minutes


def cleanup_expired_guests():
    """Delete expired session rows, then any guest account left with none."""
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        expired_sessions = db.query(models.Session).filter(models.Session.expires_at < now).all()
        for session in expired_sessions:
            db.delete(session)
        if expired_sessions:
            db.commit()
            logger.info("Swept %d expired session(s)", len(expired_sessions))

        orphaned_guests = (
            db.query(models.User)
            .filter(models.User.is_guest == True)  # noqa: E712
            .filter(~models.User.sessions.any())
            .all()
        )
        for guest in orphaned_guests:
            db.delete(guest)
        if orphaned_guests:
            db.commit()
            logger.info("Swept %d abandoned guest account(s)", len(orphaned_guests))
    finally:
        db.close()


async def run_periodic_sweep():
    while True:
        try:
            cleanup_expired_guests()
        except Exception:
            logger.exception("Guest cleanup sweep failed")
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)
