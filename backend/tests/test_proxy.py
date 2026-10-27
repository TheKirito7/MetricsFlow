import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import Settings


def test_forwarding_headers_only_apply_from_explicitly_trusted_proxy():
    probe = FastAPI()

    @probe.get("/")
    def inspect(request: Request):
        return {"client": request.client.host, "scheme": request.url.scheme}

    wrapped = ProxyHeadersMiddleware(probe, trusted_hosts=["172.30.0.10"])
    headers = {"X-Forwarded-For": "203.0.113.42", "X-Forwarded-Proto": "https"}
    with TestClient(wrapped, client=("172.30.0.10", 1234)) as trusted:
        assert trusted.get("/", headers=headers).json() == {"client": "203.0.113.42", "scheme": "https"}
    with TestClient(wrapped, client=("198.51.100.1", 1234)) as untrusted:
        assert untrusted.get("/", headers=headers).json() == {"client": "198.51.100.1", "scheme": "http"}


def test_production_refuses_wildcard_forwarded_trust():
    with pytest.raises(ValueError, match="explicit proxy"):
        Settings(_env_file=None, app_env="production", cookie_secure=True, forwarded_allow_ips="*")
