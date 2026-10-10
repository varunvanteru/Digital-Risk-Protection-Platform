"""
TLS trust for outbound calls.

Some networks (campus and corporate firewalls such as FortiGate) re-sign HTTPS
traffic with their own certificate authority. Set CA_BUNDLE in .env to that
CA's PEM file to trust it in addition to the public roots. Verification is
never switched off.
"""

from __future__ import annotations

import ssl
from functools import lru_cache

import certifi

from .config import settings


@lru_cache(maxsize=1)
def tls_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context(cafile=certifi.where())
    if settings.ca_bundle:
        ctx.load_verify_locations(cafile=settings.ca_bundle)
    return ctx


def install_default_context() -> None:
    """urllib-based libraries (google-play-scraper) use the module default context."""
    if settings.ca_bundle:
        ssl._create_default_https_context = tls_context  # noqa: SLF001
