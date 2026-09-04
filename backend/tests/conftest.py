import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from database import Base  # noqa: E402


@pytest.fixture
def test_db():
    """Temporary test database."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name

    engine = create_engine(f'sqlite:///{db_path}')
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)

    yield SessionLocal()

    try:
        os.unlink(db_path)
    except Exception:
        pass
