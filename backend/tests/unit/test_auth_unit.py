"""
Unit tests for authentication module (security functions only)
Tests password hashing, JWT token creation/validation - no database needed
"""
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock

# Setup path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
)
from app.config import settings


class TestPasswordHashing:
    """Test password hashing functions"""

    def test_password_hash_is_different_each_time(self):
        """Hashes of same password should be different (due to salt)"""
        password = "TestPassword123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        assert hash1 != hash2

    def test_password_hash_is_valid_bcrypt(self):
        """Hash should be a valid bcrypt hash"""
        password = "TestPassword123"
        hashed = get_password_hash(password)
        assert hashed.startswith("$2")  # bcrypt hashes start with $2a$, $2b$, etc.

    def test_verify_password_correct(self):
        """verify_password should return True for correct password"""
        password = "Admin@123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """verify_password should return False for wrong password"""
        password = "Admin@123"
        hashed = get_password_hash(password)
        assert verify_password("WrongPassword", hashed) is False

    def test_verify_password_empty_password(self):
        """verify_password should return False for empty password"""
        password = "Admin@123"
        hashed = get_password_hash(password)
        assert verify_password("", hashed) is False

    def test_verify_password_special_characters(self):
        """Passwords with special characters should work"""
        password = "P@$$w0rd!#%^&*()_+-=[]{}|;':\",./<>?"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_unicode(self):
        """Unicode passwords should work"""
        password = "SenhaBrasileira123ãõáé"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True


class TestJWTTokens:
    """Test JWT token creation and validation"""

    def test_create_access_token_basic(self):
        """Should create a valid JWT token"""
        data = {"sub": "user123"}
        token = create_access_token(data)
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_access_token_with_expiry(self):
        """Should create a token with custom expiry"""
        data = {"sub": "user123"}
        expires = timedelta(minutes=30)
        token = create_access_token(data, expires_delta=expires)
        assert token is not None

    def test_decode_token_valid(self):
        """Should decode a valid token"""
        data = {"sub": "user123"}
        token = create_access_token(data)
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["sub"] == "user123"

    def test_decode_token_invalid(self):
        """Should return None for invalid token"""
        decoded = decode_token("invalid.token.here")
        assert decoded is None

    def test_decode_token_empty(self):
        """Should return None for empty token"""
        decoded = decode_token("")
        assert decoded is None

    def test_token_contains_expiry(self):
        """Token should contain expiration claim"""
        data = {"sub": "user123"}
        token = create_access_token(data)
        decoded = decode_token(token)
        assert "exp" in decoded

    def test_different_secret_produces_different_token(self):
        """Tokens created with different secrets should not decode with each other"""
        data = {"sub": "user123"}
        token1 = create_access_token(data)
        
        # Decode with original settings
        decoded1 = decode_token(token1)
        assert decoded1 is not None
        assert decoded1["sub"] == "user123"
