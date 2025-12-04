# traffic_prediction.py
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
from prophet import Prophet
import sqlite3

router = APIRouter()

class TrafficData(BaseModel):
    user_id: int
    location_lat: float
    location_lng: float
    vehicle_count: int

@router.post("/update_traffic")
def update_traffic(data: TrafficData):
    conn = sqlite3.connect("traffic.db")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO traffic_history (user_id, location_lat, location_lng, vehicle_count, timestamp)
        VALUES (?, ?, ?, ?, ?)
    """, (data.user_id, data.location_lat, data.location_lng, data.vehicle_count, datetime.now()))
    conn.commit()
    conn.close()
    return {"status": "ok"}

@router.get("/predict_traffic")
def predict_traffic(lat: float, lng: float):
    conn = sqlite3.connect("traffic.db")
    df = pd.read_sql_query(f"""
        SELECT timestamp as ds, vehicle_count as y
        FROM traffic_history
        WHERE location_lat={lat} AND location_lng={lng}
        ORDER BY timestamp ASC
    """, conn)
    conn.close()

    if len(df) < 5:
        return {"prediction": "Not enough data"}

    model = Prophet()
    model.fit(df)
    future = model.make_future_dataframe(periods=3, freq='5min')
    forecast = model.predict(future)
    next_15 = forecast[['ds', 'yhat']].tail(3).to_dict(orient='records')
    return {"prediction": next_15}
