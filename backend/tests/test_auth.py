import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def _unique_email():
    """Generate a unique email for test isolation."""
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


def test_health():
    """Health check works."""
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_register_valid():
    """Registration with valid email/password succeeds."""
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "name": "Test User", "password": "password123"},
    )
    assert r.status_code == 200
    assert "user_id" in r.json()
    assert r.json()["name"] == "Test User"
    assert r.json()["is_guest"] is False


def test_register_short_password():
    """Registration with short password fails."""
    r = client.post(
        "/auth/register",
        json={"email": _unique_email(), "name": "Test User", "password": "short"},
    )
    assert r.status_code == 400


def test_register_duplicate_email():
    """Registering twice with same email fails."""
    email = _unique_email()
    client.post(
        "/auth/register",
        json={"email": email, "name": "First", "password": "password123"},
    )
    r = client.post(
        "/auth/register",
        json={"email": email, "name": "Second", "password": "password123"},
    )
    assert r.status_code == 400


def test_guest_login():
    """Guest login succeeds."""
    r = client.post("/auth/guest")
    assert r.status_code == 200
    assert r.json()["is_guest"] is True
    assert r.json()["name"] == "Guest"


def test_no_auth_401():
    """Unauthenticated request to /auth/me returns 401."""
    fresh_client = TestClient(app)
    r = fresh_client.get("/auth/me")
    assert r.status_code == 401
