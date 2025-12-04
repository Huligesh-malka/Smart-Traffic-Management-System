import sqlite3

conn = sqlite3.connect("traffic.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS traffic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    location_lat FLOAT,
    location_lng FLOAT,
    vehicle_count INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()
conn.close()
