"""Dependency-injection providers shared across routers."""

from __future__ import annotations

from functools import lru_cache

from .config import Settings, get_settings
from .services.credentials import CredentialStore, default_config_dir
from .services.llm.registry import ProviderRegistry
from .services.security_service import SecurityService
from .services.usage_service import UsageService


@lru_cache
def get_credential_store() -> CredentialStore:
    # Outside the repo: this checkout may sit on exFAT, which ignores chmod.
    return CredentialStore(default_config_dir())


@lru_cache
def get_usage_service() -> UsageService:
    return UsageService()


@lru_cache
def get_registry() -> ProviderRegistry:
    return ProviderRegistry(get_settings(), get_credential_store())


@lru_cache
def get_security_service() -> SecurityService:
    return SecurityService(get_settings())


def get_app_settings() -> Settings:
    return get_settings()


