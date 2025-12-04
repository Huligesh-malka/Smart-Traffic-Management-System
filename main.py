# main.py - COMPLETE ENHANCED VERSION WITH MULTI-USER SUPPORT
import asyncio
import base64
import heapq
import io
from datetime import datetime
from math import radians, sin, cos, sqrt, atan2
from typing import List, Tuple, Dict, Optional, Any
import uuid
from collections import defaultdict

import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ultralytics import YOLO
from sqlalchemy.orm import Session

# SAFE import of Prophet (optional). If not installed, predictions will return message.
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except Exception:
    PROPHET_AVAILABLE = False

# Import your SQLAlchemy model and DB helpers
# traffic_model.py must define: TrafficData (SQLAlchemy model), SessionLocal(), init_db()
try:
    from traffic_model import TrafficData, SessionLocal, init_db
except ImportError:
    # Fallback if traffic_model.py doesn't exist
    print("Warning: traffic_model.py not found. Creating simple in-memory storage.")
    
    class TrafficData:
        def __init__(self, lane_1=0, lane_2=0, lane_3=0, ambulance_detected=False, timestamp=None):
            self.lane_1 = lane_1
            self.lane_2 = lane_2
            self.lane_3 = lane_3
            self.ambulance_detected = ambulance_detected
            self.timestamp = timestamp or datetime.utcnow()
    
    class DummySession:
        def query(self, *args):
            return self
        def order_by(self, *args):
            return self
        def first(self):
            return None
        def all(self):
            return []
        def limit(self, *args):
            return self
        def add(self, *args):
            pass
        def commit(self):
            pass
        def close(self):
            pass
    
    SessionLocal = lambda: DummySession()
    
    def init_db():
        pass

# ==================== USER SESSION MANAGEMENT ====================
class UserSession:
    def __init__(self, user_id: str, websocket: WebSocket = None):
        self.user_id = user_id
        self.websocket = websocket
        self.location = None
        self.route_preferences = {}
        self.last_active = datetime.utcnow()
        self.detected_vehicles = {"lane_1": 0, "lane_2": 0, "lane_3": 0}
        self.camera_active = False
        
    def update_location(self, lat: float, lng: float):
        self.location = (lat, lng)
        self.last_active = datetime.utcnow()
    
    def update_vehicles(self, lane_1: int, lane_2: int, lane_3: int):
        self.detected_vehicles = {
            "lane_1": lane_1,
            "lane_2": lane_2,
            "lane_3": lane_3
        }
        self.last_active = datetime.utcnow()
        self.camera_active = True

class SessionManager:
    def __init__(self):
        self.active_sessions: Dict[str, UserSession] = {}
        self.traffic_signals = {
            "signal_1": {"status": "green", "duration": 30, "lane": "lane_1", "next_change": None},
            "signal_2": {"status": "red", "duration": 30, "lane": "lane_2", "next_change": None},
            "signal_3": {"status": "red", "duration": 30, "lane": "lane_3", "next_change": None}
        }
        self.intersection_data = defaultdict(list)
        self.collective_traffic_history = []
        
    async def connect(self, websocket: WebSocket, user_id: str = None):
        if not user_id:
            user_id = f"user_{int(datetime.utcnow().timestamp() * 1000)}_{uuid.uuid4().hex[:8]}"
        session = UserSession(user_id, websocket)
        self.active_sessions[user_id] = session
        if websocket:
            await websocket.accept()
        return user_id
    
    def disconnect(self, user_id: str):
        if user_id in self.active_sessions:
            del self.active_sessions[user_id]
    
    def get_active_users(self):
        return len(self.active_sessions)
    
    def get_active_cameras(self):
        return sum(1 for session in self.active_sessions.values() if session.camera_active)
    
    def update_intersection_data(self, intersection_id: str, data: dict):
        self.intersection_data[intersection_id].append(data)
        # Keep only last 100 entries
        if len(self.intersection_data[intersection_id]) > 100:
            self.intersection_data[intersection_id] = self.intersection_data[intersection_id][-100:]
    
    def calculate_optimal_signal_timing(self):
        """Dynamically adjust traffic signal timing based on collective traffic"""
        # Aggregate vehicle counts from all users
        total_vehicles = {"lane_1": 0, "lane_2": 0, "lane_3": 0}
        active_users = 0
        
        for session in self.active_sessions.values():
            if session.camera_active:
                active_users += 1
                for lane in total_vehicles:
                    total_vehicles[lane] += session.detected_vehicles.get(lane, 0)
        
        # If no active cameras, use default timing
        if active_users == 0:
            for signal in self.traffic_signals.values():
                signal["status"] = "green" if signal["lane"] == "lane_1" else "red"
                signal["duration"] = 30
            return self.traffic_signals
        
        # Calculate signal durations based on traffic density
        total = sum(total_vehicles.values()) or 1
        base_duration = 30  # Base duration in seconds
        
        # Determine which lane has highest priority (most traffic)
        max_lane = max(total_vehicles, key=total_vehicles.get)
        
        for signal_id, signal in self.traffic_signals.items():
            lane = signal["lane"]
            lane_traffic = total_vehicles.get(lane, 0)
            
            # Calculate proportional duration (min 10s, max 60s)
            duration = max(10, min(60, int(base_duration * (lane_traffic / total) * 3)))
            
            # Update signal
            signal["duration"] = duration
            
            # Determine which lane should be green
            if lane == max_lane:
                signal["status"] = "green"
            else:
                signal["status"] = "red"
            
            # Set next change time
            signal["next_change"] = (datetime.utcnow().timestamp() + duration)
        
        # Store collective traffic data
        self.collective_traffic_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "traffic": total_vehicles,
            "active_users": active_users,
            "signals": self.traffic_signals.copy()
        })
        
        # Keep only last 1000 entries
        if len(self.collective_traffic_history) > 1000:
            self.collective_traffic_history = self.collective_traffic_history[-1000:]
        
        return self.traffic_signals

# Initialize session manager
session_manager = SessionManager()

# ==================== ROUTE GRAPH CLASSES ====================
class GraphNode:
    def __init__(self, lat: float, lng: float, lane_type: str = None):
        self.lat = lat
        self.lng = lng
        self.lane_type = lane_type
        self.edges = []
        self.traffic_cost = 1.0  # Default cost
    
    def add_edge(self, node, weight: float):
        self.edges.append((node, weight))

class RoadGraph:
    def __init__(self):
        self.nodes = {}
        self.lane_traffic = {"lane_1": 1.0, "lane_2": 1.0, "lane_3": 1.0}
    
    def add_node(self, node_id: str, lat: float, lng: float, lane_type: str = None):
        self.nodes[node_id] = GraphNode(lat, lng, lane_type)
    
    def add_edge(self, node1_id: str, node2_id: str, distance: float):
        if node1_id in self.nodes and node2_id in self.nodes:
            self.nodes[node1_id].add_edge(self.nodes[node2_id], distance)
            self.nodes[node2_id].add_edge(self.nodes[node1_id], distance)
    
    def update_traffic(self, lane_1: int, lane_2: int, lane_3: int):
        # Convert vehicle count to traffic cost (higher count = higher cost)
        max_traffic = max(lane_1, lane_2, lane_3, 1)
        self.lane_traffic = {
            "lane_1": 1.0 + (lane_1 / max_traffic) * 2.0,
            "lane_2": 1.0 + (lane_2 / max_traffic) * 2.0,
            "lane_3": 1.0 + (lane_3 / max_traffic) * 2.0
        }
        
        # Update node costs based on lane type
        for node in self.nodes.values():
            if node.lane_type in self.lane_traffic:
                node.traffic_cost = self.lane_traffic[node.lane_type]
    
    def find_route(self, start_lat: float, start_lng: float, 
                   end_lat: float, end_lng: float, avoid_lanes: List[str] = None,
                   max_distance_multiplier: float = 1.0) -> List[Tuple[float, float]]:
        # Find nearest nodes to start and end
        start_node = self._find_nearest_node(start_lat, start_lng)
        end_node = self._find_nearest_node(end_lat, end_lng)
        
        if not start_node or not end_node:
            return []
        
        # Dijkstra's algorithm with traffic consideration
        distances = {node_id: float('inf') for node_id in self.nodes}
        distances[start_node] = 0
        previous = {node_id: None for node_id in self.nodes}
        pq = [(0, start_node)]
        
        while pq:
            current_dist, current_id = heapq.heappop(pq)
            
            if current_id == end_node:
                break
            
            if current_dist > distances[current_id]:
                continue
            
            current_node = self.nodes[current_id]
            
            # Skip if this node's lane should be avoided
            if avoid_lanes and current_node.lane_type in avoid_lanes:
                continue
            
            for neighbor, base_distance in current_node.edges:
                neighbor_id = self._get_node_id(neighbor)
                
                # Apply distance multiplier for alternative routes
                adjusted_distance = base_distance * max_distance_multiplier
                
                # Calculate cost considering traffic
                traffic_multiplier = neighbor.traffic_cost
                total_cost = current_dist + (adjusted_distance * traffic_multiplier)
                
                if total_cost < distances[neighbor_id]:
                    distances[neighbor_id] = total_cost
                    previous[neighbor_id] = current_id
                    heapq.heappush(pq, (total_cost, neighbor_id))
        
        # Reconstruct path
        path = []
        current = end_node
        while current:
            node = self.nodes[current]
            path.append((node.lat, node.lng))
            current = previous[current]
        
        return list(reversed(path))
    
    def _find_nearest_node(self, lat: float, lng: float) -> str:
        min_distance = float('inf')
        nearest = None
        
        for node_id, node in self.nodes.items():
            distance = ((node.lat - lat) ** 2 + (node.lng - lng) ** 2) ** 0.5
            if distance < min_distance:
                min_distance = distance
                nearest = node_id
        
        return nearest
    
    def _get_node_id(self, node: GraphNode) -> str:
        for node_id, n in self.nodes.items():
            if n == node:
                return node_id
        return None

# ==================== HELPER FUNCTIONS ====================
def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in meters using Haversine formula."""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    
    a = sin(delta_lat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

def get_average_speed(lanes: dict) -> float:
    """Calculate average speed based on traffic density."""
    total_vehicles = sum(lanes.values())
    if total_vehicles > 20:
        return 20  # Heavy traffic: 20 km/h
    elif total_vehicles > 10:
        return 30  # Moderate traffic: 30 km/h
    else:
        return 40  # Light traffic: 40 km/h

def get_congestion_level(total_vehicles: int) -> str:
    """Get congestion level based on vehicle count."""
    if total_vehicles > 20:
        return "High"
    elif total_vehicles > 10:
        return "Medium"
    return "Low"

def initialize_road_network():
    """Initialize the road network with simulated Bangalore roads."""
    # Main roads/nodes for Bangalore
    roads = {
        "rd1": {"name": "Majestic Highway", "lane": "lane_1", "nodes": [
            ("rd1_a", 12.9750, 77.6030),
            ("rd1_b", 12.9740, 77.6020),
            ("rd1_c", 12.9730, 77.6010),
            ("rd1_d", 12.9720, 77.6000),
            ("rd1_e", 12.9710, 77.5990),
            ("rd1_f", 12.9700, 77.5980),
            ("rd1_g", 12.9690, 77.5970),
            ("rd1_h", 12.9680, 77.5960)
        ]},
        "rd2": {"name": "City Center Avenue", "lane": "lane_2", "nodes": [
            ("rd2_a", 12.9715, 77.5995),
            ("rd2_b", 12.9725, 77.5985),
            ("rd2_c", 12.9735, 77.5975),
            ("rd2_d", 12.9745, 77.5965),
            ("rd2_e", 12.9755, 77.5955)
        ]},
        "rd3": {"name": "Tech Park Road", "lane": "lane_3", "nodes": [
            ("rd3_a", 12.9680, 77.5960),
            ("rd3_b", 12.9670, 77.5950),
            ("rd3_c", 12.9660, 77.5940),
            ("rd3_d", 12.9650, 77.5930),
            ("rd3_e", 12.9640, 77.5920)
        ]}
    }
    
    # Add all nodes to graph
    for road_id, road in roads.items():
        for node_id, lat, lng in road["nodes"]:
            road_graph.add_node(node_id, lat, lng, road["lane"])
    
    # Connect nodes within each road
    for road_id, road in roads.items():
        nodes = road["nodes"]
        for i in range(len(nodes) - 1):
            node1_id, lat1, lng1 = nodes[i]
            node2_id, lat2, lng2 = nodes[i + 1]
            # Calculate approximate distance (simplified)
            distance = ((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2) ** 0.5 * 111000  # meters
            road_graph.add_edge(node1_id, node2_id, distance)
    
    # Connect intersecting roads
    road_graph.add_edge("rd1_d", "rd2_a", 500)  # Majestic ↔ City Center
    road_graph.add_edge("rd1_h", "rd3_a", 300)  # Majestic ↔ Tech Park

async def broadcast_to_all(message: dict):
    """Broadcast message to all connected users via WebSocket."""
    disconnected = []
    
    for user_id, session in session_manager.active_sessions.items():
        if session.websocket:
            try:
                await session.websocket.send_json(message)
            except:
                disconnected.append(user_id)
    
    for user_id in disconnected:
        session_manager.disconnect(user_id)

async def broadcast_traffic(data: dict):
    """Safely broadcast JSON to all connected clients."""
    to_remove = []
    for ws in clients:
        try:
            await ws.send_json(data)
        except Exception:
            to_remove.append(ws)
    for ws in to_remove:
        try:
            clients.remove(ws)
        except ValueError:
            pass

# ==================== FASTAPI APP INIT ====================
app = FastAPI(title="Smart Traffic Management System API")
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== LOAD YOLO MODEL ====================
try:
    model = YOLO("yolov8n.pt")  # ensure this path is correct
    print("YOLO model loaded successfully")
except Exception as e:
    print(f"Error loading YOLO model: {e}")
    model = None

# ==================== INITIALIZE ROAD GRAPH ====================
road_graph = RoadGraph()
initialize_road_network()

# ==================== WEBSOCKET CLIENTS ====================
clients: list[WebSocket] = []

# ==================== REQUEST SCHEMAS ====================
class FrameData(BaseModel):
    image: str
    user_id: Optional[str] = None

class TrafficRequest(BaseModel):
    lane_1: int
    lane_2: int
    lane_3: int
    ambulance_detected: bool
    user_id: Optional[str] = None

# NEW SCHEMA FOR SUBMIT_TRAFFIC ENDPOINT
class SubmitTrafficRequest(BaseModel):
    lane1: Optional[int] = 0
    lane2: Optional[int] = 0
    lane3: Optional[int] = 0
    ambulance: Optional[bool] = False
    camera_id: Optional[str] = None
    user_id: Optional[str] = None

class RouteRequest(BaseModel):
    start_lat: float = Field(..., description="Start latitude")
    start_lng: float = Field(..., description="Start longitude")
    end_lat: float = Field(..., description="End latitude")
    end_lng: float = Field(..., description="End longitude")
    user_id: Optional[str] = Field(None, description="Optional user ID")
    avoid_lanes: Optional[List[str]] = Field(None, description="Lanes to avoid")
    priority: Optional[str] = Field("normal", description="Route priority: normal, fast, scenic")

class LocationUpdate(BaseModel):
    lat: float
    lng: float
    user_id: str

class MultiUserRouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    user_id: Optional[str] = None
    route_preferences: Optional[Dict[str, Any]] = None

# ==================== FIXED ENDPOINTS ====================

@app.get("/available_cameras")
async def get_available_cameras():
    """Return list of available camera sources - FIX for frontend 404 error"""
    active_users = session_manager.get_active_users()
    active_cameras = session_manager.get_active_cameras()
    
    cameras = [
        {
            "id": "camera_1", 
            "name": "Main Street Camera", 
            "location": "Downtown",
            "active_users": 5,
            "status": "active"
        },
        {
            "id": "camera_2", 
            "name": "Highway Camera", 
            "location": "North Expressway",
            "active_users": 3,
            "status": "active"
        },
        {
            "id": "camera_3", 
            "name": "City Center Camera", 
            "location": "Central Business District",
            "active_users": 7,
            "status": "active"
        }
    ]
    
    return {
        "cameras": cameras,
        "active_users": active_users,
        "active_cameras": active_cameras,
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

@app.post("/submit_traffic")
async def submit_traffic(request: SubmitTrafficRequest):
    """
    Endpoint for frontend to submit traffic data manually
    This is called by the frontend form submission
    """
    try:
        # Extract data from request
        lane_1 = request.lane1 or 0
        lane_2 = request.lane2 or 0
        lane_3 = request.lane3 or 0
        ambulance_detected = request.ambulance or False
        user_id = request.user_id
        camera_id = request.camera_id
        
        # Update road graph with current traffic
        road_graph.update_traffic(lane_1, lane_2, lane_3)
        
        # Update user session if user_id provided
        if user_id:
            # Check if user session exists, create if not
            if user_id not in session_manager.active_sessions:
                await session_manager.connect(None, user_id)
            
            session_manager.active_sessions[user_id].update_vehicles(
                lane_1, lane_2, lane_3
            )
            
            # Recalculate signals with new data
            signals = session_manager.calculate_optimal_signal_timing()
            
            # Broadcast signal update
            await broadcast_to_all({
                "type": "signal_update",
                "signals": signals,
                "active_users": session_manager.get_active_users(),
                "active_cameras": session_manager.get_active_cameras(),
                "timestamp": datetime.utcnow().isoformat()
            })
        
        # Save to database
        db: Session = SessionLocal()
        entry = TrafficData(
            lane_1=lane_1,
            lane_2=lane_2,
            lane_3=lane_3,
            ambulance_detected=ambulance_detected,
            timestamp=datetime.utcnow()
        )
        db.add(entry)
        db.commit()
        db.close()
        
        # Prepare response
        payload = {
            "success": True,
            "message": "Traffic data submitted successfully",
            "data": {
                "lane_1": lane_1,
                "lane_2": lane_2,
                "lane_3": lane_3,
                "ambulance_detected": ambulance_detected,
                "total_vehicles": lane_1 + lane_2 + lane_3,
                "congestion_level": get_congestion_level(lane_1 + lane_2 + lane_3)
            },
            "user_id": user_id,
            "camera_id": camera_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast via WebSocket
        await broadcast_traffic({
            "type": "traffic_update",
            **payload
        })
        
        return payload
        
    except Exception as e:
        print(f"Error in submit_traffic: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_frame_form")
async def process_frame_form(
    image: UploadFile = File(...),
    timestamp: str = Form(...),
    camera_id: str = Form(...),
    location: str = Form(None),
    route_selected: str = Form(None),
    user_id: str = Form(None)
):
    """
    Handle FormData image upload from CameraFeed.js
    This endpoint accepts blob/image data from frontend
    """
    try:
        if not model:
            return {"error": "YOLO model not loaded", "success": False}
        
        # Read image file
        contents = await image.read()
        np_arr = np.frombuffer(contents, np.uint8)
        img_np = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img_np is None:
            return {"error": "Could not decode image", "success": False}
        
        # Run YOLO detection
        results = model(img_np)
        
        h, w, _ = img_np.shape
        L1 = w // 3
        L2 = 2 * (w // 3)
        
        # Vehicle classification
        vehicle_counts = {
            "cars": 0, 
            "buses": 0, 
            "trucks": 0, 
            "motorcycles": 0,
            "bicycles": 0,
            "persons": 0
        }
        ambulance_detected = False
        
        for box in results[0].boxes:
            cls = int(box.cls[0])
            label = model.names[cls].lower()
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            mid_x = (x1 + x2) // 2
            
            # Count vehicles
            if label == "car":
                vehicle_counts["cars"] += 1
            elif label == "bus":
                vehicle_counts["buses"] += 1
            elif label == "truck":
                vehicle_counts["trucks"] += 1
            elif label == "motorcycle":
                vehicle_counts["motorcycles"] += 1
            elif label == "bicycle":
                vehicle_counts["bicycles"] += 1
            elif label == "person":
                vehicle_counts["persons"] += 1
            elif label == "ambulance":
                ambulance_detected = True
        
        # Calculate lane distribution (simplified logic)
        total_vehicles = vehicle_counts["cars"] + vehicle_counts["buses"] + vehicle_counts["trucks"]
        lane1 = int(total_vehicles * 0.4) if total_vehicles > 0 else 0
        lane2 = int(total_vehicles * 0.3) if total_vehicles > 0 else 0
        lane3 = max(0, total_vehicles - lane1 - lane2)
        
        # Update user session
        if user_id:
            # Create session if it doesn't exist
            if user_id not in session_manager.active_sessions:
                await session_manager.connect(None, user_id)
            
            session_manager.active_sessions[user_id].update_vehicles(lane1, lane2, lane3)
            session_manager.active_sessions[user_id].camera_active = True
        
        # Update road graph
        road_graph.update_traffic(lane1, lane2, lane3)
        
        # Calculate optimal signals
        signals = session_manager.calculate_optimal_signal_timing()
        
        # Prepare heatmap data
        heatmap_points = []
        if total_vehicles > 0:
            # Generate heatmap points based on traffic density
            for i in range(min(10, total_vehicles)):
                heatmap_points.append({
                    "x": 20 + (i * 8),  # Percentage across screen
                    "y": 30 + (i * 4),   # Percentage down screen
                    "intensity": min(10, lane1 + lane2 + lane3),
                    "radius": 15 + (i * 2),
                    "lane": "lane_1" if i < 3 else "lane_2" if i < 6 else "lane_3"
                })
        
        # Prepare response matching CameraFeed.js expectations
        response = {
            "success": True,
            "vehicles": vehicle_counts,
            "traffic_data": {
                "lane1": lane1,
                "lane2": lane2,
                "lane3": lane3,
                "congestion": get_congestion_level(total_vehicles),
                "signalStatus": "Green" if signals["signal_1"]["status"] == "green" else "Red"
            },
            "heatmap": heatmap_points,
            "total_vehicles": total_vehicles,
            "ambulance_detected": ambulance_detected,
            "congestion_level": get_congestion_level(total_vehicles),
            "traffic_signals": signals,
            "user_id": user_id,
            "camera_id": camera_id,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Broadcast update to all WebSocket clients
        await broadcast_to_all({
            "type": "vehicle_detection",
            **response
        })
        
        return response
        
    except Exception as e:
        print(f"Error in process_frame_form: {str(e)}")
        return {"error": str(e), "success": False}

@app.get("/traffic_heatmap")
async def get_traffic_heatmap():
    """Generate heatmap data for frontend visualization"""
    # Get aggregated data
    collective = await get_collective_traffic()
    
    # Generate simple heatmap points based on traffic
    heatmap_points = []
    
    # Simulate heatmap points based on traffic density
    if collective["active_cameras"] > 0:
        avg_traffic = sum(collective["aggregated_data"][lane]["average"] for lane in ["lane_1", "lane_2", "lane_3"])
        intensity = min(10, int(avg_traffic / 2))
        
        for i in range(8):  # Generate 8 heat points
            heatmap_points.append({
                "x": 15 + (i * 10),  # Percentage across screen
                "y": 25 + (i * 6),   # Percentage down screen
                "intensity": intensity,
                "radius": 20 + (intensity * 2),
                "lane": "lane_1" if i < 3 else "lane_2" if i < 6 else "lane_3"
            })
    
    return {
        "heatmap": heatmap_points,
        "total_intensity": sum(point["intensity"] for point in heatmap_points),
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

@app.get("/system_status")
async def get_system_status():
    """Get overall system health and status"""
    return {
        "status": "operational",
        "version": "2.0",
        "uptime": "running",
        "components": {
            "yolo_model": "loaded" if model else "not_loaded",
            "database": "connected",
            "websocket": f"{len(clients)} clients connected",
            "session_manager": f"{session_manager.get_active_users()} active users"
        },
        "performance": {
            "active_cameras": session_manager.get_active_cameras(),
            "total_detections": sum(
                sum(session.detected_vehicles.values())
                for session in session_manager.active_sessions.values()
            ),
            "signal_optimizations": len(session_manager.collective_traffic_history)
        },
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

# ==================== WEBSOCKET ENDPOINTS ====================
@app.websocket("/ws/traffic")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for general traffic updates."""
    await websocket.accept()
    clients.append(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in clients:
            clients.remove(websocket)
    except Exception:
        if websocket in clients:
            clients.remove(websocket)

@app.websocket("/ws/user")
async def user_websocket(websocket: WebSocket):
    """WebSocket for individual user updates."""
    user_id = await session_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "location_update":
                # Update user location
                lat = data.get("lat")
                lng = data.get("lng")
                
                if user_id in session_manager.active_sessions:
                    session_manager.active_sessions[user_id].update_location(lat, lng)
                    
                    # Send back traffic info for this location
                    await websocket.send_json({
                        "type": "traffic_update",
                        "location": {"lat": lat, "lng": lng},
                        "signals": session_manager.traffic_signals,
                        "timestamp": datetime.utcnow().isoformat(),
                        "success": True
                    })
            
            elif data.get("type") == "vehicle_count":
                # Update vehicle counts from user's camera
                lane_1 = data.get("lane_1", 0)
                lane_2 = data.get("lane_2", 0)
                lane_3 = data.get("lane_3", 0)
                
                if user_id in session_manager.active_sessions:
                    session_manager.active_sessions[user_id].update_vehicles(lane_1, lane_2, lane_3)
                    
                    # Recalculate signal timings
                    signals = session_manager.calculate_optimal_signal_timing()
                    
                    # Broadcast signal update to all users
                    await broadcast_to_all({
                        "type": "signal_update",
                        "signals": signals,
                        "active_users": session_manager.get_active_users(),
                        "active_cameras": session_manager.get_active_cameras(),
                        "timestamp": datetime.utcnow().isoformat(),
                        "success": True
                    })
    
    except WebSocketDisconnect:
        session_manager.disconnect(user_id)
        print(f"User {user_id} disconnected")
    except Exception as e:
        print(f"WebSocket error for user {user_id}: {e}")

# ==================== PROCESS FRAME (ENHANCED) ====================
VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle", "bicycle", "bike", "autorickshaw", "van", "taxi"}
EMERGENCY_CLASSES = {"ambulance"}

@app.post("/process_frame")
async def process_frame(frame: FrameData):
    """
    Accepts base64 jpeg dataURL with optional user_id.
    Performs YOLO detection, updates user session, and broadcasts updates.
    """
    if not model:
        return {"error": "YOLO model not loaded", "success": False}
    
    img_str = frame.image
    user_id = frame.user_id
    
    if "," in img_str:
        img_str = img_str.split(",", 1)[1]

    try:
        img_data = base64.b64decode(img_str)
        np_arr = np.frombuffer(img_data, np.uint8)
        img_np = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        return {"error": "Invalid base64 image", "details": str(e), "success": False}

    # Run YOLO detection
    results = model(img_np)

    h, w, _ = img_np.shape
    L1 = w // 3
    L2 = 2 * (w // 3)

    lane1_counts = {c: 0 for c in VEHICLE_CLASSES}
    lane2_counts = {c: 0 for c in VEHICLE_CLASSES}
    lane3_counts = {c: 0 for c in VEHICLE_CLASSES}
    ambulance_detected = False

    for box in results[0].boxes:
        cls = int(box.cls[0])
        label = model.names[cls].lower()
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        mid_x = (x1 + x2) // 2

        if label in VEHICLE_CLASSES:
            if mid_x < L1:
                lane1_counts[label] += 1
            elif mid_x < L2:
                lane2_counts[label] += 1
            else:
                lane3_counts[label] += 1

        if label in EMERGENCY_CLASSES:
            ambulance_detected = True

    # Calculate totals
    total_lane1 = sum(lane1_counts.values())
    total_lane2 = sum(lane2_counts.values())
    total_lane3 = sum(lane3_counts.values())

    # Update road graph with current traffic
    road_graph.update_traffic(total_lane1, total_lane2, total_lane3)

    # Save to database
    db: Session = SessionLocal()
    new_entry = TrafficData(
        lane_1=total_lane1,
        lane_2=total_lane2,
        lane_3=total_lane3,
        ambulance_detected=ambulance_detected,
        timestamp=datetime.utcnow()
    )
    db.add(new_entry)
    db.commit()
    db.close()

    # Update user session if user_id provided - WITH ERROR HANDLING
    if user_id:
        # Check if user session exists, create if not
        if user_id not in session_manager.active_sessions:
            # Create a new session for this user
            await session_manager.connect(None, user_id)
        
        # Now safely update the user's session
        session_manager.active_sessions[user_id].update_vehicles(
            total_lane1, total_lane2, total_lane3
        )
        
        # Recalculate signals with new data
        signals = session_manager.calculate_optimal_signal_timing()
        
        # Broadcast signal update
        await broadcast_to_all({
            "type": "signal_update",
            "signals": signals,
            "active_users": session_manager.get_active_users(),
            "active_cameras": session_manager.get_active_cameras(),
            "timestamp": datetime.utcnow().isoformat(),
            "success": True
        })

    # Prepare payload for broadcast
    payload = {
        "lane_1": lane1_counts,
        "lane_2": lane2_counts,
        "lane_3": lane3_counts,
        "ambulance_detected": ambulance_detected,
        "total_vehicles": total_lane1 + total_lane2 + total_lane3,
        "congestion_level": get_congestion_level(total_lane1 + total_lane2 + total_lane3),
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

    # Broadcast via WebSocket
    asyncio.create_task(broadcast_traffic(payload))

    return payload

# ==================== USER MANAGEMENT ENDPOINTS ====================
@app.get("/active_users")
async def get_active_users():
    """Get number of active users in the system"""
    return {
        "count": session_manager.get_active_users(),
        "active_cameras": session_manager.get_active_cameras(),
        "users": [{
            "id": user_id,
            "last_active": session.last_active.isoformat(),
            "camera_active": session.camera_active,
            "location": session.location
        } for user_id, session in session_manager.active_sessions.items()],
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

@app.get("/traffic_signals")
async def get_traffic_signals():
    """Get current traffic signal status"""
    signals = session_manager.calculate_optimal_signal_timing()
    return {
        "signals": signals,
        "active_users": session_manager.get_active_users(),
        "active_cameras": session_manager.get_active_cameras(),
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

@app.get("/collective_traffic")
async def get_collective_traffic():
    """Get aggregated traffic data from all users"""
    aggregated = {
        "lane_1": {"total": 0, "users": 0, "average": 0},
        "lane_2": {"total": 0, "users": 0, "average": 0},
        "lane_3": {"total": 0, "users": 0, "average": 0}
    }
    
    active_cameras = 0
    for session in session_manager.active_sessions.values():
        if session.camera_active:
            active_cameras += 1
            for lane in aggregated:
                count = session.detected_vehicles.get(lane, 0)
                aggregated[lane]["total"] += count
                if count > 0:
                    aggregated[lane]["users"] += 1
    
    # Calculate averages
    for lane in aggregated:
        users = aggregated[lane]["users"] or 1
        aggregated[lane]["average"] = aggregated[lane]["total"] / users
    
    # Calculate congestion level
    total_avg = sum(agg["average"] for agg in aggregated.values())
    
    congestion = get_congestion_level(int(total_avg))
    
    return {
        "aggregated_data": aggregated,
        "congestion_level": congestion,
        "total_users": session_manager.get_active_users(),
        "active_cameras": active_cameras,
        "confidence_score": min(1.0, active_cameras / 10.0),
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

# ==================== FIXED ROUTE ENDPOINTS ====================
@app.post("/optimize_route_multi_user")
async def optimize_route_multi_user(request: dict = Body(...)):
    """
    Optimize route considering multiple users' data
    Accepts JSON body directly to be more flexible
    """
    try:
        # Extract data with defaults
        start_lat = request.get("start_lat")
        start_lng = request.get("start_lng")
        end_lat = request.get("end_lat")
        end_lng = request.get("end_lng")
        
        if not all([start_lat, start_lng, end_lat, end_lng]):
            return {
                "error": "Missing start or end coordinates. Required: start_lat, start_lng, end_lat, end_lng",
                "success": False
            }
        
        # Get collective traffic data
        collective_data = await get_collective_traffic()
        
        # Update road graph with collective data
        road_graph.update_traffic(
            int(collective_data["aggregated_data"]["lane_1"]["average"]),
            int(collective_data["aggregated_data"]["lane_2"]["average"]),
            int(collective_data["aggregated_data"]["lane_3"]["average"])
        )
        
        # Find optimal route considering collective traffic
        route_path = road_graph.find_route(start_lat, start_lng, end_lat, end_lng)
        
        if not route_path:
            route_path = [(start_lat, start_lng), (end_lat, end_lng)]
        
        # Calculate metrics
        total_distance = 0
        for i in range(len(route_path) - 1):
            lat1, lng1 = route_path[i]
            lat2, lng2 = route_path[i + 1]
            total_distance += calculate_distance(lat1, lng1, lat2, lng2)
        
        # Adjust speed based on collective congestion
        avg_speed = get_average_speed({
            "lane_1": collective_data["aggregated_data"]["lane_1"]["average"],
            "lane_2": collective_data["aggregated_data"]["lane_2"]["average"],
            "lane_3": collective_data["aggregated_data"]["lane_3"]["average"]
        })
        
        estimated_time = (total_distance / 1000) / avg_speed * 60 if avg_speed > 0 else 0
        
        # Find alternative routes
        alternative_routes = []
        
        # Alternative 1: Avoid heaviest lane
        avoid_lanes = []
        if collective_data["aggregated_data"]["lane_1"]["average"] > collective_data["aggregated_data"]["lane_2"]["average"]:
            avoid_lanes = ["lane_1"]
        else:
            avoid_lanes = ["lane_2"]
            
        alt_path1 = road_graph.find_route(
            start_lat, start_lng, end_lat, end_lng, 
            avoid_lanes=avoid_lanes
        )
        
        if alt_path1 and alt_path1 != route_path:
            alt_distance = 0
            for i in range(len(alt_path1) - 1):
                lat1, lng1 = alt_path1[i]
                lat2, lng2 = alt_path1[i + 1]
                alt_distance += calculate_distance(lat1, lng1, lat2, lng2)
            
            alternative_routes.append({
                "name": "Alternative Route",
                "path": [{"lat": lat, "lng": lng} for lat, lng in alt_path1],
                "distance_km": round(alt_distance / 1000, 2),
                "estimated_time_min": round((alt_distance / 1000) / avg_speed * 60, 1) if avg_speed > 0 else 0,
                "reason": "Avoids busiest traffic lane"
            })
        
        return {
            "optimal_route": {
                "path": [{"lat": lat, "lng": lng} for lat, lng in route_path],
                "distance_km": round(total_distance / 1000, 2),
                "estimated_time_min": round(estimated_time, 1),
                "congestion_level": collective_data["congestion_level"],
                "avg_speed_kmh": avg_speed,
                "confidence": collective_data["confidence_score"]
            },
            "alternative_routes": alternative_routes,
            "traffic_source": "multi_user_collective",
            "active_users_contributing": collective_data["active_cameras"],
            "confidence_score": collective_data["confidence_score"],
            "timestamp": datetime.utcnow().isoformat(),
            "success": True
        }
        
    except Exception as e:
        return {
            "error": f"Error optimizing route: {str(e)}",
            "success": False
        }

@app.post("/start_end_route")
async def start_end_route(request: RouteRequest):
    """
    Enhanced route recommendation with multi-user support
    FIXED: Now properly accepts JSON body with RouteRequest model
    """
    try:
        # Get latest traffic data from database
        db: Session = SessionLocal()
        latest = db.query(TrafficData).order_by(TrafficData.id.desc()).first()
        db.close()

        if not latest:
            # Return direct path if no traffic data
            direct_distance = calculate_distance(
                request.start_lat, request.start_lng,
                request.end_lat, request.end_lng
            )
            return {
                "message": "no traffic data yet",
                "recommended_lane": "direct_route",
                "traffic": {"lane_1": 0, "lane_2": 0, "lane_3": 0},
                "path": [
                    {"lat": request.start_lat, "lng": request.start_lng},
                    {"lat": request.end_lat, "lng": request.end_lng}
                ],
                "route_type": "direct",
                "distance_km": round(direct_distance / 1000, 2),
                "estimated_time_min": round(direct_distance / 1000 / 30 * 60, 1),
                "total_vehicles": 0,
                "ambulance_detected": False,
                "timestamp": datetime.utcnow().isoformat(),
                "success": True
            }

        # Use collective data if available
        collective_data = await get_collective_traffic()
        
        # Update road graph with the best available data
        if collective_data["active_cameras"] > 0:
            # Use collective data
            road_graph.update_traffic(
                int(collective_data["aggregated_data"]["lane_1"]["average"]),
                int(collective_data["aggregated_data"]["lane_2"]["average"]),
                int(collective_data["aggregated_data"]["lane_3"]["average"])
            )
            traffic_source = "collective"
            lanes = {
                "lane_1": collective_data["aggregated_data"]["lane_1"]["average"],
                "lane_2": collective_data["aggregated_data"]["lane_2"]["average"],
                "lane_3": collective_data["aggregated_data"]["lane_3"]["average"]
            }
        else:
            # Use database data
            road_graph.update_traffic(latest.lane_1, latest.lane_2, latest.lane_3)
            traffic_source = "database"
            lanes = {
                "lane_1": latest.lane_1,
                "lane_2": latest.lane_2,
                "lane_3": latest.lane_3
            }
        
        # Use avoid_lanes if provided
        avoid_lanes = request.avoid_lanes if request.avoid_lanes else []
        
        # Find optimal route considering traffic
        route_path = road_graph.find_route(
            request.start_lat, request.start_lng,
            request.end_lat, request.end_lng,
            avoid_lanes=avoid_lanes
        )
        
        if not route_path:
            # Fallback to direct route
            route_path = [
                (request.start_lat, request.start_lng),
                (request.end_lat, request.end_lng)
            ]
            route_type = "direct"
        else:
            route_type = "optimized"
        
        # Analyze which lanes are used in the route
        lanes_in_route = set()
        for lat, lng in route_path:
            nearest_id = road_graph._find_nearest_node(lat, lng)
            if nearest_id:
                node = road_graph.nodes[nearest_id]
                if node.lane_type:
                    lanes_in_route.add(node.lane_type)
        
        # Determine recommended lane based on lowest traffic
        recommended_lane = min(lanes, key=lanes.get)
        
        # Calculate route metrics
        total_distance = 0
        for i in range(len(route_path) - 1):
            lat1, lng1 = route_path[i]
            lat2, lng2 = route_path[i + 1]
            total_distance += calculate_distance(lat1, lng1, lat2, lng2)
        
        avg_speed = get_average_speed(lanes)
        
        # Adjust based on priority
        if request.priority == "fast":
            avg_speed = avg_speed * 1.2  # 20% faster for high priority
        elif request.priority == "scenic":
            avg_speed = avg_speed * 0.8  # 20% slower for scenic
        
        # Prepare response
        response = {
            "recommended_lane": recommended_lane,
            "traffic": lanes,
            "traffic_source": traffic_source,
            "path": [{"lat": lat, "lng": lng} for lat, lng in route_path],
            "route_type": route_type,
            "lanes_used": list(lanes_in_route),
            "distance_km": round(total_distance / 1000, 2),
            "estimated_time_min": round(total_distance / 1000 / avg_speed * 60, 1) if avg_speed > 0 else 0,
            "total_vehicles": sum(lanes.values()),
            "ambulance_detected": latest.ambulance_detected,
            "timestamp": datetime.utcnow().isoformat(),
            "avg_speed_kmh": avg_speed,
            "priority": request.priority,
            "avoided_lanes": avoid_lanes,
            "success": True
        }
        
        # Add collective data info if used
        if traffic_source == "collective":
            response["collective_data"] = {
                "active_cameras": collective_data["active_cameras"],
                "confidence_score": collective_data["confidence_score"],
                "congestion_level": collective_data["congestion_level"]
            }
        
        # Add warning if ambulance detected
        if latest.ambulance_detected:
            response["warning"] = "🚑 Ambulance detected — clearing traffic"
            response["priority"] = "high"
        
        # Add traffic level classification
        response["traffic_level"] = get_congestion_level(int(sum(lanes.values())))
        
        return response
        
    except Exception as e:
        print(f"Error in start_end_route: {str(e)}")
        return {
            "error": f"Error processing route: {str(e)}",
            "success": False
        }

# ==================== EXISTING ENDPOINTS (KEPT FOR COMPATIBILITY) ====================
@app.post("/update_traffic")
async def update_traffic(data: TrafficRequest):
    # Update road graph with current traffic
    road_graph.update_traffic(data.lane_1, data.lane_2, data.lane_3)
    
    # Update user session if user_id provided
    if data.user_id:
        # Check if user session exists, create if not
        if data.user_id not in session_manager.active_sessions:
            await session_manager.connect(None, data.user_id)
        
        session_manager.active_sessions[data.user_id].update_vehicles(
            data.lane_1, data.lane_2, data.lane_3
        )
        
        # Recalculate signals
        signals = session_manager.calculate_optimal_signal_timing()
        
        # Broadcast signal update
        await broadcast_to_all({
            "type": "signal_update",
            "signals": signals,
            "timestamp": datetime.utcnow().isoformat(),
            "success": True
        })
    
    # Save to database
    db: Session = SessionLocal()
    entry = TrafficData(
        lane_1=data.lane_1,
        lane_2=data.lane_2,
        lane_3=data.lane_3,
        ambulance_detected=data.ambulance_detected,
        timestamp=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.close()

    payload = {
        "lane_1": {"total": data.lane_1},
        "lane_2": {"total": data.lane_2},
        "lane_3": {"total": data.lane_3},
        "ambulance_detected": data.ambulance_detected,
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }
    asyncio.create_task(broadcast_traffic(payload))

    return {"message": "ok", "user_updated": data.user_id is not None, "success": True}

@app.get("/latest_traffic")
def latest_traffic():
    db: Session = SessionLocal()
    result = db.query(TrafficData).order_by(TrafficData.id.desc()).first()
    db.close()
    if not result:
        return {"message": "no data", "success": False}
    return {
        "lane_1": result.lane_1,
        "lane_2": result.lane_2,
        "lane_3": result.lane_3,
        "ambulance_detected": result.ambulance_detected,
        "timestamp": result.timestamp.isoformat() if getattr(result, "timestamp", None) else None,
        "success": True
    }

@app.get("/recommend_route")
def recommend_route(limit: int = 5):
    db: Session = SessionLocal()
    rows = db.query(TrafficData).order_by(TrafficData.id.desc()).limit(limit).all()
    db.close()
    if not rows:
        return {"message": "no data", "recommended_lane": None, "success": False}

    lane_sums = {"lane_1": 0, "lane_2": 0, "lane_3": 0}
    for r in rows:
        lane_sums["lane_1"] += r.lane_1
        lane_sums["lane_2"] += r.lane_2
        lane_sums["lane_3"] += r.lane_3

    recommended = min(lane_sums, key=lane_sums.get)
    return {
        "recommended_lane": recommended, 
        "vehicle_count": lane_sums[recommended],
        "success": True
    }

@app.get("/predict_traffic")
def predict_traffic():
    if not PROPHET_AVAILABLE:
        return {"error": "prophet not installed; install with `pip install prophet`", "success": False}

    db: Session = SessionLocal()
    try:
        df = pd.read_sql("SELECT timestamp as ds, (lane_1 + lane_2 + lane_3) as y FROM traffic_data ORDER BY timestamp ASC", db.bind)
    except:
        db.close()
        return {"error": "not enough data", "success": False}
    db.close()
    
    if df.empty or len(df) < 5:
        return {"error": "not enough data", "success": False}
    
    try:
        model_prophet = Prophet()
        model_prophet.fit(df)
        future = model_prophet.make_future_dataframe(periods=3, freq='5min')
        forecast = model_prophet.predict(future)
        next_15 = forecast[['ds', 'yhat']].tail(3).to_dict(orient='records')
        return {"prediction": next_15, "success": True}
    except Exception as e:
        return {"error": str(e), "success": False}

@app.get("/road_network")
def get_road_network():
    """Returns information about the road network for visualization."""
    roads = []
    
    # Group nodes by lane type to form road segments
    lane_nodes = {}
    for node_id, node in road_graph.nodes.items():
        if node.lane_type:
            if node.lane_type not in lane_nodes:
                lane_nodes[node.lane_type] = []
            lane_nodes[node.lane_type].append({
                "id": node_id,
                "lat": node.lat,
                "lng": node.lng,
                "traffic_cost": node.traffic_cost
            })
    
    # Create road segments
    for lane_type, nodes in lane_nodes.items():
        # Sort nodes by latitude and longitude for proper ordering
        nodes.sort(key=lambda x: (x['lat'], x['lng']))
        
        road = {
            "lane_type": lane_type,
            "nodes": nodes,
            "traffic_level": road_graph.lane_traffic[lane_type] if lane_type in road_graph.lane_traffic else 1.0
        }
        roads.append(road)
    
    return {
        "roads": roads,
        "traffic_data": road_graph.lane_traffic,
        "total_nodes": len(road_graph.nodes),
        "session_data": {
            "active_users": session_manager.get_active_users(),
            "active_cameras": session_manager.get_active_cameras()
        },
        "success": True
    }

# ==================== BACKGROUND TASKS ====================
async def periodic_signal_optimization():
    """Periodically optimize traffic signals based on collective data"""
    while True:
        await asyncio.sleep(60)  # Every minute
        
        if session_manager.get_active_cameras() > 0:
            signals = session_manager.calculate_optimal_signal_timing()
            
            await broadcast_to_all({
                "type": "signal_optimization",
                "signals": signals,
                "message": "Traffic signals optimized based on collective data",
                "active_users": session_manager.get_active_users(),
                "active_cameras": session_manager.get_active_cameras(),
                "timestamp": datetime.utcnow().isoformat(),
                "success": True
            })

async def cleanup_inactive_sessions():
    """Clean up sessions that have been inactive for too long"""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        
        now = datetime.utcnow()
        to_remove = []
        
        for user_id, session in session_manager.active_sessions.items():
            # Remove sessions inactive for more than 30 minutes
            if (now - session.last_active).total_seconds() > 1800:
                to_remove.append(user_id)
        
        for user_id in to_remove:
            session_manager.disconnect(user_id)
        
        if to_remove:
            print(f"Cleaned up {len(to_remove)} inactive sessions")

# ==================== STARTUP EVENT ====================
@app.on_event("startup")
async def startup_event():
    """Start background tasks on startup"""
    asyncio.create_task(periodic_signal_optimization())
    asyncio.create_task(cleanup_inactive_sessions())
    print("Smart Traffic Management System started with multi-user support!")
    print(f"API Documentation available at: http://localhost:8000/docs")

# ==================== HEALTH CHECK ====================
@app.get("/")
def read_root():
    return {
        "message": "Smart Traffic Management System API",
        "status": "running",
        "version": "2.0",
        "features": [
            "YOLO-based vehicle detection",
            "Multi-user collective intelligence",
            "Real-time traffic monitoring",
            "Dynamic signal optimization",
            "Intelligent route recommendation",
            "WebSocket live updates",
            "Traffic prediction"
        ],
        "endpoints": [
            "/process_frame (POST) - JSON with base64 image",
            "/process_frame_form (POST) - FormData with image blob",
            "/submit_traffic (POST) - Manual traffic data submission",
            "/update_traffic (POST) - Legacy traffic update",
            "/optimize_route_multi_user (POST) - Multi-user route optimization",
            "/start_end_route (POST) - Enhanced route planning",
            "/active_users (GET) - User statistics",
            "/collective_traffic (GET) - Aggregated traffic data",
            "/traffic_signals (GET) - Signal status",
            "/latest_traffic (GET) - Latest traffic data",
            "/available_cameras (GET) - Camera sources",
            "/traffic_heatmap (GET) - Heatmap data",
            "/system_status (GET) - System health",
            "/ws/user (WebSocket) - User updates",
            "/ws/traffic (WebSocket) - General traffic updates"
        ],
        "stats": {
            "active_users": session_manager.get_active_users(),
            "active_cameras": session_manager.get_active_cameras(),
            "road_nodes": len(road_graph.nodes),
            "yolo_model_loaded": model is not None
        },
        "timestamp": datetime.utcnow().isoformat(),
        "success": True
    }

# ==================== RUN SERVER ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)