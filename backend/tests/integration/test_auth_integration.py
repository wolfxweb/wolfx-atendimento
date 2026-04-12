"""
Integration tests for authentication API endpoints
Tests login, register, me endpoints with test database
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import uuid

# Setup path
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app
from app.database import Base, get_db
from app.models.models import User, Customer
from app.core.security import get_password_hash


# Create in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing"""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    
    # Create test customer
    customer = Customer(
        id=uuid.uuid4(),
        name="Test Company",
        email="test@test.com",
        is_active=True
    )
    db.add(customer)
    db.commit()
    
    yield db
    
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create test client with database override"""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_user(db_session):
    """Create a test user in the database"""
    customer = db_session.query(Customer).first()
    user = User(
        id=uuid.uuid4(),
        customer_id=customer.id,
        email="test@example.com",
        password_hash=get_password_hash("TestPassword123"),
        name="Test User",
        role="customer",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def inactive_user(db_session):
    """Create an inactive test user"""
    customer = db_session.query(Customer).first()
    user = User(
        id=uuid.uuid4(),
        customer_id=customer.id,
        email="inactive@example.com",
        password_hash=get_password_hash("TestPassword123"),
        name="Inactive User",
        role="customer",
        is_active=False
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


class TestLoginEndpoint:
    """Test POST /api/v1/auth/login"""

    def test_login_success(self, client, test_user):
        """Should return access token for valid credentials"""
        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "test@example.com",
                "password": "TestPassword123"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_invalid_password(self, client, test_user):
        """Should return 401 for wrong password"""
        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "test@example.com",
                "password": "WrongPassword"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 401
        assert "Incorrect email or password" in response.json()["detail"]

    def test_login_nonexistent_user(self, client, db_session):
        """Should return 401 for non-existent user"""
        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "nonexistent@example.com",
                "password": "SomePassword123"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 401
        assert "Incorrect email or password" in response.json()["detail"]

    def test_login_inactive_user(self, client, inactive_user):
        """Should return 400 for inactive user"""
        response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "inactive@example.com",
                "password": "TestPassword123"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 400
        assert "Inactive user" in response.json()["detail"]

    def test_login_missing_credentials(self, client):
        """Should return 422 for missing credentials"""
        response = client.post(
            "/api/v1/auth/login",
            data={},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422

    def test_login_missing_password(self, client):
        """Should return 422 for missing password"""
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "test@example.com"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422

    def test_login_empty_username(self, client):
        """Should return 422 for empty username"""
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "", "password": "password"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 422


class TestMeEndpoint:
    """Test GET /api/v1/auth/me"""

    def test_me_authenticated(self, client, test_user):
        """Should return user info for authenticated user"""
        # First login
        login_response = client.post(
            "/api/v1/auth/login",
            data={
                "username": "test@example.com",
                "password": "TestPassword123"
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        token = login_response.json()["access_token"]

        # Get me
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"
        assert data["role"] == "customer"

    def test_me_unauthenticated(self, client):
        """Should return 401 for unauthenticated request"""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401

    def test_me_invalid_token(self, client):
        """Should return 401 for invalid token"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401

    def test_me_malformed_header(self, client):
        """Should return 401 for malformed authorization header"""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "NotBearer token"}
        )
        assert response.status_code == 401


class TestRegisterEndpoint:
    """Test POST /api/v1/auth/register"""

    def test_register_success(self, client):
        """Should register a new user successfully"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "NewPassword123",
                "name": "New User",
                "role": "customer"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["name"] == "New User"
        assert data["role"] == "customer"
        assert "id" in data

    def test_register_duplicate_email(self, client, test_user):
        """Should return 400 for existing email"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",  # Already exists
                "password": "NewPassword123",
                "name": "Another User",
                "role": "customer"
            }
        )
        assert response.status_code == 400
        assert "Email already registered" in response.json()["detail"]

    def test_register_missing_fields(self, client):
        """Should return 422 for missing required fields"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "incomplete@example.com"
                # Missing password, name, role
            }
        )
        assert response.status_code == 422

    def test_register_invalid_email(self, client):
        """Should return 422 for invalid email format"""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "password": "Password123",
                "name": "Test User",
                "role": "customer"
            }
        )
        assert response.status_code == 422
