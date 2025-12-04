# traffic_model.py - SIMPLE DATABASE MODEL
from sqlalchemy import create_engine, Column, Integer, Boolean, DateTime, String, Float, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./traffic_data.db")

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    echo=False
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class
Base = declarative_base()

class TrafficData(Base):
    """
    Simple traffic data model
    """
    __tablename__ = "traffic_data"
    
    id = Column(Integer, primary_key=True, index=True)
    lane_1 = Column(Integer, default=0)
    lane_2 = Column(Integer, default=0)
    lane_3 = Column(Integer, default=0)
    ambulance_detected = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    location = Column(String(255), nullable=True)
    user_id = Column(String(100), nullable=True)

def init_db():
    """
    Initialize database - DROP AND RECREATE for simplicity
    """
    try:
        # Drop all tables and recreate
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
        
        # Add a test record
        db = SessionLocal()
        test_data = TrafficData(
            lane_1=5,
            lane_2=3,
            lane_3=2,
            ambulance_detected=False,
            location="Test Intersection",
            user_id="system"
        )
        db.add(test_data)
        db.commit()
        db.close()
        
        print("✅ Test data added")
        
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        raise

def get_db():
    """
    Get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize on import
try:
    init_db()
except Exception as e:
    print(f"Warning: {e}")