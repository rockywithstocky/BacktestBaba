"""Tests for auth endpoints — covers signup, login, me, and token caching."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def _override_persistence(val: bool):
    import backend.main as m
    m.PERSISTENCE_ENABLED = val


class TestAuthDisabled:
    """When PERSISTENCE_ENABLED=False, all auth endpoints return 501."""

    def setup_method(self):
        _override_persistence(False)
        import backend.main as m
        m._auth_cache.clear()

    def test_signup_returns_501(self):
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text

    def test_login_returns_501(self):
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text

    def test_me_returns_501(self):
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer x"})
        assert resp.status_code == 501
        assert "Auth not configured" in resp.text


class TestAuthEnabled:
    """When PERSISTENCE_ENABLED=True, test real endpoint behavior."""

    def setup_method(self):
        _override_persistence(True)
        import backend.main as m
        m._auth_cache.clear()

    def test_me_missing_header(self):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401
        assert "Missing or invalid auth header" in resp.text

    def test_me_malformed_header(self):
        resp = client.get("/api/auth/me", headers={"Authorization": "NotBearer x"})
        assert resp.status_code == 401
        assert "Missing or invalid auth header" in resp.text

    def test_signup_empty_body_still_calls_auth(self, monkeypatch):
        called = False
        async def mock_signup(email, password, name):
            nonlocal called; called = True; return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_signup", mock_signup)
        resp = client.post("/api/auth/signup", json={})
        assert called
        assert resp.status_code == 502

    def test_signup_with_valid_body(self, monkeypatch):
        async def mock_signup(email, password, name):
            return {"_status": 201, "id": "u1", "email": email}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_signup", mock_signup)
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pass123", "name": "Alice"})
        assert resp.status_code == 201

    def test_signup_backend_returns_none(self, monkeypatch):
        async def mock_signup(email, password, name):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_signup", mock_signup)
        resp = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pass123"})
        assert resp.status_code == 502
        assert "Auth service unavailable" in resp.text

    def test_login_success(self, monkeypatch):
        async def mock_login(email, password):
            return {"token": "tok_abc", "user": {"email": email}}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_login", mock_login)
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "pass123"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["token"] == "tok_abc"

    def test_login_failure(self, monkeypatch):
        async def mock_login(email, password):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_login", mock_login)
        resp = client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"})
        assert resp.status_code == 401
        assert "Invalid credentials" in resp.text

    def test_me_valid_token(self, monkeypatch):
        async def mock_validate(token):
            return {"email": "a@b.com", "is_admin": False}
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
        m._auth_cache.clear()
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer tok_valid"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["user"]["email"] == "a@b.com"

    def test_me_invalid_token(self, monkeypatch):
        async def mock_validate(token):
            return None
        import backend.main as m
        monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
        m._auth_cache.clear()
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer tok_invalid"})
        assert resp.status_code == 401
        assert "Invalid or expired session" in resp.text


@pytest.mark.asyncio
async def test_validate_token_caches_result(monkeypatch):
    call_count = 0
    async def mock_validate(token):
        nonlocal call_count
        call_count += 1
        return {"email": "a@b.com"}

    import backend.main as m
    monkeypatch.setattr(m.persistence_backend, "auth_validate", mock_validate)
    m._auth_cache.clear()
    _override_persistence(True)

    result1 = await m._validate_token("tok_abc")
    assert result1 is not None
    assert call_count == 1

    result2 = await m._validate_token("tok_abc")
    assert result2 is not None
    assert call_count == 1, "Should not call backend again (cached)"
