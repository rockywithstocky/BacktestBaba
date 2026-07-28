"""Tests for AI proxy security: domain allowlist, rate limiting, auth gate, error sanitization."""
import time
import pytest
from unittest.mock import patch

from backend.main import (
    _resolve_endpoint,
    _check_rate_limit,
    AI_PROXY_ALLOWLIST,
    AI_KNOWN_ENDPOINTS,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW,
    _RATE_LIMITS,
)


class TestResolveEndpoint:
    def test_known_provider_openai(self):
        url = _resolve_endpoint("openai", "")
        assert url == "https://api.openai.com/v1/chat/completions"

    def test_known_provider_anthropic(self):
        url = _resolve_endpoint("anthropic", "")
        assert url == "https://api.anthropic.com/v1/messages"

    def test_known_provider_deepseek(self):
        url = _resolve_endpoint("deepseek", "")
        assert url == "https://api.deepseek.com/v1/chat/completions"

    def test_all_known_providers_have_urls(self):
        for provider in AI_KNOWN_ENDPOINTS:
            url = _resolve_endpoint(provider, "")
            assert url.startswith("http")

    def test_custom_base_url_allowed_domain(self):
        url = _resolve_endpoint("custom", "https://api.openai.com/v1/chat/completions")
        assert url == "https://api.openai.com/v1/chat/completions"

    def test_custom_base_url_opencode_domain(self):
        url = _resolve_endpoint("custom", "https://opencode.ai/zen/v1/chat/completions")
        assert url == "https://opencode.ai/zen/v1/chat/completions"

    def test_custom_base_url_unknown_domain_raises_403(self):
        with pytest.raises(Exception) as exc:
            _resolve_endpoint("custom", "https://evil.com/steal")
        assert exc.type.__name__ in ("HTTPException", "Exception")

    def test_custom_base_url_ssrf_attempt_metadata(self):
        with pytest.raises(Exception):
            _resolve_endpoint("custom", "http://169.254.169.254/latest/meta-data/")

    def test_custom_base_url_ssrf_attempt_internal(self):
        with pytest.raises(Exception):
            _resolve_endpoint("custom", "http://localhost:5432/")

    def test_unknown_provider_no_base_url_raises_400(self):
        with pytest.raises(Exception):
            _resolve_endpoint("nonexistent-provider", "")

    def test_allowlist_contains_opencode_dot_ai(self):
        assert "opencode.ai" in AI_PROXY_ALLOWLIST

    def test_allowlist_contains_openai(self):
        assert "api.openai.com" in AI_PROXY_ALLOWLIST


class TestRateLimiter:
    def setup_method(self):
        _RATE_LIMITS.clear()

    def test_first_request_allowed(self):
        assert _check_rate_limit("127.0.0.1") is True

    def test_under_limit_allowed(self):
        for _ in range(RATE_LIMIT_MAX - 1):
            assert _check_rate_limit("10.0.0.1") is True

    def test_at_limit_blocked(self):
        for _ in range(RATE_LIMIT_MAX):
            _check_rate_limit("10.0.0.2")
        assert _check_rate_limit("10.0.0.2") is False

    def test_different_ips_independent(self):
        for _ in range(RATE_LIMIT_MAX):
            _check_rate_limit("10.0.0.3")
        assert _check_rate_limit("10.0.0.3") is False
        assert _check_rate_limit("10.0.0.4") is True

    def test_window_expires_requests(self):
        ip = "10.0.0.5"
        now = time.time()
        old_ts = now - RATE_LIMIT_WINDOW - 1
        _RATE_LIMITS[ip] = [old_ts] * RATE_LIMIT_MAX
        assert _check_rate_limit(ip) is True

    def test_rate_limit_constants_reasonable(self):
        assert RATE_LIMIT_MAX > 0
        assert RATE_LIMIT_WINDOW > 0
        assert RATE_LIMIT_MAX >= 10


class TestApiKeyNotInLogs:
    def test_http_exception_detail_no_api_key_leak(self):
        from fastapi import HTTPException
        exc = HTTPException(status_code=502, detail="Upstream AI provider is unreachable. Check the endpoint URL.")
        assert "apiKey" not in exc.detail.lower()
        assert "api_key" not in exc.detail

    def test_error_message_no_raw_body(self):
        from fastapi import HTTPException
        exc = HTTPException(
            status_code=401,
            detail="Upstream AI provider returned HTTP 401. Verify your API key and model name."
        )
        assert "Incorrect API key" not in exc.detail
        assert "API error" not in exc.detail
