"""
Pytest configuration and shared fixtures for backend tests
"""
import sys
import os

# Add backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
