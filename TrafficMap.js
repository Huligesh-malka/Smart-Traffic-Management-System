import React, { useEffect, useState, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import axios from "axios";

// ✅ Fix Leaflet icon setup
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// ========== TRAFFIC BACKEND SERVICE ==========
class TrafficBackendService {
  static BASE_URL = "http://localhost:8000"; // Update with your backend URL
  
  // ✅ UPDATED: Enhanced fetchBackendData function
  static async fetchBackendData() {
    try {
      const [systemInfo, latestTraffic, collectiveTraffic, activeUsers, trafficSignals, cameras, roadNetwork] = await Promise.all([
        this.fetchSystemInfo(),
        this.fetchLatestTraffic(),
        this.fetchCollectiveTraffic(),
        this.fetchActiveUsers(),
        this.fetchTrafficSignals(),
        this.fetchAvailableCameras(),
        this.fetchRoadNetwork()
      ]);
      
      return {
        systemInfo,
        latestTraffic,
        collectiveTraffic,
        activeUsers,
        trafficSignals,
        cameras,
        roadNetwork,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error fetching backend data:", error);
      return null;
    }
  }
  
  static async fetchSystemInfo() {
    try {
      const response = await axios.get(`${this.BASE_URL}/`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching system info:", error);
      return { status: "offline", message: "Backend unavailable" };
    }
  }
  
  static async fetchLatestTraffic() {
    try {
      const response = await axios.get(`${this.BASE_URL}/latest_traffic`, {
        timeout: 10000
      });
      
      // ✅ FIXED: Transform backend data to frontend expected format
      const backendData = response.data;
      
      // If backend returns lane data, create traffic points from it
      if (backendData && (backendData.lane_1 !== undefined || backendData.lane_2 !== undefined || backendData.lane_3 !== undefined)) {
        // Create traffic points from the lane data
        const trafficPoints = this.createTrafficPointsFromLaneData(backendData);
        return { traffic_points: trafficPoints, ...backendData };
      }
      
      // If backend already has traffic_points format, return as-is
      return backendData.traffic_points ? backendData : { traffic_points: [], ...backendData };
      
    } catch (error) {
      console.error("Error fetching latest traffic:", error);
      return { traffic_points: [], timestamp: new Date().toISOString() };
    }
  }
  
  // ✅ NEW: Create traffic points from lane data
  static createTrafficPointsFromLaneData(laneData) {
    const trafficPoints = [];
    const baseLats = [12.9716, 12.9758, 12.9279, 12.9784, 12.9698];
    const baseLngs = [77.5946, 77.6050, 77.6271, 77.6408, 77.7500];
    
    // Create traffic points for each lane
    ['lane_1', 'lane_2', 'lane_3'].forEach((lane, laneIndex) => {
      const count = laneData[lane] || 0;
      if (count > 0) {
        // Determine traffic level based on count
        let level = 'low';
        if (count > 15) level = 'high';
        else if (count > 8) level = 'medium';
        
        // Create points for this lane
        const pointsToCreate = Math.min(3, Math.ceil(count / 5));
        
        for (let i = 0; i < pointsToCreate; i++) {
          const pointIndex = (laneIndex * pointsToCreate + i) % baseLats.length;
          trafficPoints.push({
            id: `traffic_${Date.now()}_${lane}_${i}`,
            lat: baseLats[pointIndex] + (Math.random() - 0.5) * 0.01,
            lng: baseLngs[pointIndex] + (Math.random() - 0.5) * 0.01,
            level: level,
            vehicle_count: Math.floor(count / pointsToCreate) || 1,
            ambulance_detected: laneData.ambulance_detected || false,
            location_name: `Traffic Point ${laneIndex * 3 + i + 1}`,
            timestamp: laneData.timestamp || new Date().toISOString(),
            user_id: laneData.user_id || 'system'
          });
        }
      }
    });
    
    return trafficPoints;
  }
  
  static async fetchCollectiveTraffic() {
    try {
      const response = await axios.get(`${this.BASE_URL}/collective_traffic`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching collective traffic:", error);
      return { 
        total_vehicles: 0, 
        congested_points: 0, 
        avg_speed: 0,
        timestamp: new Date().toISOString()
      };
    }
  }
  
  static async fetchOptimizedRoute(start, end, options = {}) {
    try {
      const payload = {
        start_lat: start[0],
        start_lng: start[1],
        end_lat: end[0],
        end_lng: end[1],
        user_id: "web_user_" + Date.now(),
        ...options
      };
      
      const response = await axios.post(`${this.BASE_URL}/optimize_route_multi_user`, payload, {
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching optimized route:", error);
      return null;
    }
  }
  
  static async fetchActiveUsers() {
    try {
      const response = await axios.get(`${this.BASE_URL}/active_users`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching active users:", error);
      return { count: 0, users: [] };
    }
  }
  
  static async fetchTrafficSignals() {
    try {
      const response = await axios.get(`${this.BASE_URL}/traffic_signals`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching traffic signals:", error);
      return [];
    }
  }
  
  static async fetchAvailableCameras() {
    try {
      const response = await axios.get(`${this.BASE_URL}/available_cameras`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching cameras:", error);
      return [];
    }
  }
  
  static async fetchRoadNetwork() {
    try {
      const response = await axios.get(`${this.BASE_URL}/road_network`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching road network:", error);
      return null;
    }
  }
  
  static async fetchSystemStatus() {
    try {
      const response = await axios.get(`${this.BASE_URL}/system_status`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching system status:", error);
      return { status: "offline", health: "unhealthy" };
    }
  }
  
  static async fetchTrafficHeatmap() {
    try {
      const response = await axios.get(`${this.BASE_URL}/traffic_heatmap`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching heatmap:", error);
      return { heatmap_data: [] };
    }
  }
  
  static async fetchRouteRecommendation(start, end) {
    try {
      const payload = {
        start_lat: start[0],
        start_lng: start[1],
        end_lat: end[0],
        end_lng: end[1]
      };
      
      const response = await axios.post(`${this.BASE_URL}/start_end_route`, payload, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching route recommendation:", error);
      return null;
    }
  }
  
  static async fetchTrafficPrediction(location, time) {
    try {
      const payload = {
        location: location,
        time: time || new Date().toISOString()
      };
      
      const response = await axios.post(`${this.BASE_URL}/predict_traffic`, payload, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching traffic prediction:", error);
      return null;
    }
  }
  
  // ✅ UPDATED: Submit user's traffic observation with correct field names
  static async submitTrafficObservation(lat, lng, level, vehicleCount, ambulanceDetected = false) {
    try {
      const payload = {
        lane1: vehicleCount,
        lane2: Math.floor(vehicleCount * 0.7),
        lane3: Math.floor(vehicleCount * 0.3),
        ambulance: ambulanceDetected,
        user_id: "web_user_" + Date.now(),
        timestamp: new Date().toISOString()
      };
      
      console.log("Submitting traffic data:", payload);
      
      const response = await axios.post(`${this.BASE_URL}/submit_traffic`, payload, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log("Submit response:", response.data);
      return response.data;
      
    } catch (error) {
      console.error("Error submitting traffic observation:", error);
      return null;
    }
  }
  
  static async updateTrafficData(trafficData) {
    try {
      const response = await axios.post(`${this.BASE_URL}/update_traffic`, trafficData, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.error("Error updating traffic data:", error);
      return null;
    }
  }
  
  static async processFrame(imageData) {
    try {
      const response = await axios.post(`${this.BASE_URL}/process_frame`, {
        image: imageData
      }, {
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error("Error processing frame:", error);
      return null;
    }
  }
  
  static async processFrameForm(formData) {
    try {
      const response = await axios.post(`${this.BASE_URL}/process_frame_form`, formData, {
        timeout: 15000,
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error("Error processing frame form:", error);
      return null;
    }
  }
  
  static async startEndRoute(start, end, options = {}) {
    try {
      const payload = {
        start_lat: start[0],
        start_lng: start[1],
        end_lat: end[0],
        end_lng: end[1],
        ...options
      };
      
      const response = await axios.post(`${this.BASE_URL}/start_end_route`, payload, {
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching start-end route:", error);
      return null;
    }
  }
}

// ========== TRAFFIC CONGESTION MARKER ==========
function TrafficCongestionMarker({ trafficData, onTrafficUpdate }) {
  const [localLevel, setLocalLevel] = useState(trafficData.level);
  const [vehicleCount, setVehicleCount] = useState(trafficData.vehicle_count || 0);
  const [isUpdating, setIsUpdating] = useState(false);
  
  if (!trafficData || !trafficData.lat || !trafficData.lng) return null;
  
  const { lat, lng, ambulance_detected, location_name, timestamp } = trafficData;
  
  // Determine color based on traffic level
  const getTrafficColor = (level) => {
    switch(level) {
      case 'high': return '#f44336'; // Red
      case 'medium': return '#ff9800'; // Orange
      case 'low': return '#4CAF50'; // Green
      default: return '#9E9E9E'; // Grey for unknown
    }
  };
  
  const getTrafficEmoji = (level) => {
    switch(level) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };
  
  const color = getTrafficColor(localLevel);
  const emoji = getTrafficEmoji(localLevel);
  
  const handleLevelChange = async (newLevel) => {
    if (!localLevel || isUpdating) return;
    
    setIsUpdating(true);
    try {
      // Update local state immediately for responsive UI
      setLocalLevel(newLevel);
      
      // Submit to backend
      const result = await TrafficBackendService.submitTrafficObservation(
        lat, 
        lng, 
        newLevel, 
        vehicleCount,
        ambulance_detected
      );
      
      if (result && result.success) {
        console.log("Traffic level updated successfully:", result);
        // If callback provided, notify parent
        if (onTrafficUpdate) {
          onTrafficUpdate({
            ...trafficData,
            level: newLevel,
            vehicle_count: vehicleCount
          });
        }
      }
    } catch (error) {
      console.error("Failed to update traffic level:", error);
      // Revert on error
      setLocalLevel(trafficData.level);
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleVehicleCountChange = async (newCount) => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      setVehicleCount(newCount);
      
      const result = await TrafficBackendService.submitTrafficObservation(
        lat, 
        lng, 
        localLevel, 
        newCount,
        ambulance_detected
      );
      
      if (result && result.success && onTrafficUpdate) {
        onTrafficUpdate({
          ...trafficData,
          level: localLevel,
          vehicle_count: newCount
        });
      }
    } catch (error) {
      console.error("Failed to update vehicle count:", error);
      setVehicleCount(trafficData.vehicle_count || 0);
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleAmbulanceToggle = async () => {
    if (isUpdating) return;
    
    setIsUpdating(true);
    try {
      const newAmbulanceStatus = !ambulance_detected;
      
      const result = await TrafficBackendService.submitTrafficObservation(
        lat, 
        lng, 
        localLevel, 
        vehicleCount,
        newAmbulanceStatus
      );
      
      if (result && result.success && onTrafficUpdate) {
        onTrafficUpdate({
          ...trafficData,
          ambulance_detected: newAmbulanceStatus
        });
      }
    } catch (error) {
      console.error("Failed to update ambulance status:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <CircleMarker
      center={[lat, lng]}
      radius={localLevel === 'high' ? 15 : localLevel === 'medium' ? 12 : 10}
      pathOptions={{
        fillColor: color,
        color: "white",
        weight: localLevel === 'high' ? 3 : 2,
        opacity: 0.9,
        fillOpacity: 0.8,
      }}
    >
      <Popup>
        <div style={{ padding: '10px', minWidth: '250px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '12px',
            fontSize: '20px'
          }}>
            {emoji}
            <strong style={{ marginLeft: '8px', fontSize: '16px' }}>
              {localLevel?.toUpperCase() || 'UNKNOWN'} Traffic
              {isUpdating && ' (Updating...)'}
            </strong>
          </div>
          
          {location_name && (
            <div style={{ margin: '8px 0', fontWeight: '500' }}>
              📍 {location_name}
            </div>
          )}
          
          {/* Traffic Level Controls */}
          <div style={{ margin: '10px 0' }}>
            <div style={{ fontSize: '14px', marginBottom: '5px', fontWeight: '500' }}>
              Update Traffic Level:
            </div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <button 
                onClick={() => handleLevelChange('low')}
                disabled={isUpdating}
                style={{
                  padding: '5px 10px',
                  background: localLevel === 'low' ? '#4CAF50' : '#E8F5E9',
                  color: localLevel === 'low' ? 'white' : '#4CAF50',
                  border: '1px solid #4CAF50',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  flex: 1,
                  opacity: isUpdating ? 0.5 : 1
                }}
              >
                🟢 Low
              </button>
              <button 
                onClick={() => handleLevelChange('medium')}
                disabled={isUpdating}
                style={{
                  padding: '5px 10px',
                  background: localLevel === 'medium' ? '#FF9800' : '#FFF3E0',
                  color: localLevel === 'medium' ? 'white' : '#FF9800',
                  border: '1px solid #FF9800',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  flex: 1,
                  opacity: isUpdating ? 0.5 : 1
                }}
              >
                🟡 Medium
              </button>
              <button 
                onClick={() => handleLevelChange('high')}
                disabled={isUpdating}
                style={{
                  padding: '5px 10px',
                  background: localLevel === 'high' ? '#F44336' : '#FFEBEE',
                  color: localLevel === 'high' ? 'white' : '#F44336',
                  border: '1px solid #F44336',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  flex: 1,
                  opacity: isUpdating ? 0.5 : 1
                }}
              >
                🔴 High
              </button>
            </div>
          </div>
          
          {/* Vehicle Count Controls */}
          <div style={{ margin: '10px 0' }}>
            <div style={{ fontSize: '14px', marginBottom: '5px', fontWeight: '500' }}>
              Vehicle Count: {vehicleCount}
            </div>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <button 
                onClick={() => handleVehicleCountChange(Math.max(0, vehicleCount - 5))}
                disabled={isUpdating || vehicleCount <= 0}
                style={{
                  padding: '5px 10px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                -5
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={vehicleCount}
                onChange={(e) => handleVehicleCountChange(parseInt(e.target.value))}
                disabled={isUpdating}
                style={{ flex: 1 }}
              />
              <button 
                onClick={() => handleVehicleCountChange(vehicleCount + 5)}
                disabled={isUpdating}
                style={{
                  padding: '5px 10px',
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                +5
              </button>
            </div>
          </div>
          
          {/* Ambulance Detection */}
          <div style={{ margin: '10px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ambulance_detected || false}
                onChange={handleAmbulanceToggle}
                disabled={isUpdating}
                style={{ marginRight: '8px' }}
              />
              <span style={{ 
                color: ambulance_detected ? '#d32f2f' : '#666',
                fontWeight: ambulance_detected ? 'bold' : 'normal'
              }}>
                🚑 Ambulance Detected
              </span>
            </label>
          </div>
          
          {/* Data Source Info */}
          <div style={{ 
            fontSize: '11px', 
            color: '#666', 
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid #eee'
          }}>
            {timestamp && (
              <div>📅 Updated: {new Date(timestamp).toLocaleTimeString()}</div>
            )}
            <div>🌐 Real-time user data • Click to update</div>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

// Enhanced Map Navigator Component with bounds fitting
function MapNavigator({ bounds, position, zoom, fitBounds = true }) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    
    if (fitBounds && bounds && bounds.length >= 2) {
      try {
        // Create LatLngBounds from all points
        const latLngBounds = L.latLngBounds(bounds);
        
        // Add padding to ensure markers are not on edge
        map.fitBounds(latLngBounds, {
          padding: [50, 50], // padding in pixels
          duration: 1.5,
          easeLinearity: 0.25,
          maxZoom: 15 // Prevent zooming too far in
        });
      } catch (error) {
        console.error("Error fitting bounds:", error);
      }
    } else if (position && position[0] && position[1]) {
      // If no bounds but position is provided, fly to position
      try {
        map.flyTo(position, zoom || 14, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      } catch (error) {
        console.error("Error flying to position:", error);
      }
    }
  }, [bounds, position, zoom, fitBounds, map]);
  
  return null;
}

// User Location Tracker
function UserLocationTracker({ onLocationUpdate, onTrafficReport }) {
  const map = useMap();
  const [userLocation, setUserLocation] = useState(null);
  const [lastReportedLocation, setLastReportedLocation] = useState(null);
  const markerRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if ('geolocation' in navigator) {
      // First get current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = [latitude, longitude];
          setUserLocation(location);
          if (onLocationUpdate) onLocationUpdate(location);
          
          if (map) {
            try {
              map.flyTo(location, 15, {
                duration: 1.5,
                easeLinearity: 0.25
              });
            } catch (error) {
              console.error("Error flying to user location:", error);
            }
          }
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );

      // Then watch for position updates
      const id = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = [latitude, longitude];
          setUserLocation(location);
          if (onLocationUpdate) onLocationUpdate(location);
          
          // Report traffic data based on location (every 30 seconds or when moved significantly)
          const now = Date.now();
          if (!lastReportedLocation || 
              now - (lastReportedLocation.timestamp || 0) > 30000 ||
              calculateDistance(location[0], location[1], lastReportedLocation.lat, lastReportedLocation.lng) > 100) {
            
            if (onTrafficReport) {
              onTrafficReport({
                lat: latitude,
                lng: longitude,
                timestamp: new Date().toISOString()
              });
            }
            
            setLastReportedLocation({
              lat: latitude,
              lng: longitude,
              timestamp: now
            });
          }
        },
        (error) => {
          console.error("Error watching location:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 10000
        }
      );

      watchIdRef.current = id;

      return () => {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      };
    }
  }, [map, onLocationUpdate, onTrafficReport, lastReportedLocation]);

  // Helper function to calculate distance
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  if (!userLocation || !userLocation[0] || !userLocation[1]) return null;

  return (
    <Marker
      position={userLocation}
      ref={markerRef}
      icon={L.divIcon({
        html: `
          <div style="
            background: #2196F3;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 15px #2196F3;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 20px;
            animation: pulse 2s infinite;
          ">
            👤
          </div>
          <style>
            @keyframes pulse {
              0% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
              70% { box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
              100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
            }
          </style>
        `,
        className: 'user-location-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      })}
    >
      <Popup>
        <div style={{ padding: '10px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>📍 Your Current Location</h4>
          <p style={{ margin: '5px 0' }}><strong>Latitude:</strong> {userLocation[0].toFixed(6)}</p>
          <p style={{ margin: '5px 0' }}><strong>Longitude:</strong> {userLocation[1].toFixed(6)}</p>
          <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
            <em>Reporting traffic data from this location</em>
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

// ========== ENHANCED ROUTE SERVICE ==========
class RouteService {
  static fuzzyMatchLocation(input, candidates) {
    if (!input || !candidates) return null;
    
    const normalize = (str) => str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const inputNorm = normalize(input);
    
    const scores = candidates.map(candidate => {
      const candidateNorm = normalize(candidate.name);
      let score = 0;
      
      if (candidateNorm === inputNorm) return { candidate, score: 1.0 };
      
      if (candidateNorm.includes(inputNorm) || inputNorm.includes(candidateNorm)) {
        score = 0.8;
      }
      
      const inputWords = inputNorm.split(/\s+/);
      const candidateWords = candidateNorm.split(/\s+/);
      const overlap = inputWords.filter(word => candidateWords.includes(word)).length;
      score = Math.max(score, overlap / Math.max(inputWords.length, candidateWords.length));
      
      const maxLength = Math.max(inputNorm.length, candidateNorm.length);
      if (maxLength > 0) {
        const distance = this.levenshteinDistance(inputNorm, candidateNorm);
        const similarity = 1 - (distance / maxLength);
        score = Math.max(score, similarity * 0.7);
      }
      
      return { candidate, score };
    });
    
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.score > 0.3 ? scores[0].candidate : null;
  }
  
  static levenshteinDistance(a, b) {
    if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  static async getRoute(start, end, profile = 'driving') {
    if (!start || !end || !start[0] || !start[1] || !end[0] || !end[1]) {
      throw new Error("Invalid start or end coordinates");
    }
    
    try {
      const startStr = `${start[1]},${start[0]}`;
      const endStr = `${end[1]},${end[0]}`;
      
      const url = `https://router.project-osrm.org/route/v1/${profile}/${startStr};${endStr}?overview=full&geometries=geojson&alternatives=true&steps=true`;
      
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data.routes && response.data.routes.length > 0) {
        const routes = response.data.routes.map((route, index) => {
          const geometry = route.geometry?.coordinates?.map(coord => [coord[1], coord[0]]) || [];
          return {
            geometry: geometry,
            distance: route.distance || 0,
            duration: route.duration || 0,
            confidence: Math.min(0.95, (route.duration / 60) / (route.distance / 1000 * 60 * 3)),
            steps: route.legs?.[0]?.steps || [],
            summary: route.legs?.[0]?.summary || '',
            type: this.getRouteType(route, index),
            bounds: geometry.length > 0 ? this.calculateRouteBounds(geometry) : null
          };
        });
        
        return routes;
      }
      return null;
    } catch (error) {
      console.error("OSRM routing error:", error);
      const fallbackGeometry = this.createCurvedRoute(start, end);
      return [{
        geometry: fallbackGeometry,
        distance: this.calculateDistance(start[0], start[1], end[0], end[1]),
        duration: this.calculateDistance(start[0], start[1], end[0], end[1]) / 1000 * 60 * 3,
        confidence: 0.3,
        isFallback: true,
        type: 'DIRECT',
        bounds: this.calculateBoundsFromPoints([start, end, ...fallbackGeometry])
      }];
    }
  }
  
  static calculateRouteBounds(coordinates) {
    if (!coordinates || coordinates.length === 0) return null;
    
    const lats = coordinates.map(coord => coord[0]);
    const lngs = coordinates.map(coord => coord[1]);
    
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ];
  }
  
  static calculateBoundsFromPoints(points) {
    if (!points || points.length === 0) return null;
    
    const validPoints = points.filter(p => p && p[0] && p[1]);
    if (validPoints.length === 0) return null;
    
    const lats = validPoints.map(coord => coord[0]);
    const lngs = validPoints.map(coord => coord[1]);
    
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)]
    ];
  }
  
  static getRouteType(route, index) {
    if (index === 0) return 'OPTIMAL';
    if (route.distance < route.distance * 1.2) return 'ALTERNATIVE';
    if (route.duration < route.duration * 1.3) return 'TIME_SAVER';
    return 'SCENIC';
  }
  
  static createCurvedRoute(start, end) {
    if (!start || !end) return [];
    
    const points = [];
    const numPoints = 20;
    const midLat = (start[0] + end[0]) / 2;
    const midLng = (start[1] + end[1]) / 2;
    const controlLat = midLat + (Math.random() - 0.5) * 0.01;
    const controlLng = midLng + (Math.random() - 0.5) * 0.01;
    
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const lat = Math.pow(1 - t, 2) * start[0] + 
                  2 * (1 - t) * t * controlLat + 
                  Math.pow(t, 2) * end[0];
      const lng = Math.pow(1 - t, 2) * start[1] + 
                  2 * (1 - t) * t * controlLng + 
                  Math.pow(t, 2) * end[1];
      points.push([lat, lng]);
    }
    return points;
  }
  
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
  
  static async getPlaceSuggestions(query, limit = 5) {
    if (!query || query.length < 2) return [];
    
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Bangalore, India")}&limit=${limit}&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'SmartTrafficSystem/1.0',
          'Accept-Language': 'en'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.map(item => ({
          name: item.display_name?.split(',').slice(0, 2).join(',') || query,
          lat: parseFloat(item.lat) || 12.9716,
          lng: parseFloat(item.lon) || 77.5946,
          type: item.type || 'unknown',
          importance: item.importance || 0
        }));
      }
    } catch (error) {
      console.error("Place suggestion error:", error);
    }
    
    return [];
  }
}

// Place Suggestion Component
function PlaceSuggestions({ 
  input, 
  onSelect, 
  isStart = true, 
  sampleLocations = [] 
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!input || input.length < 2) {
      setSuggestions([]);
      return;
    }
    
    const fetchSuggestions = async () => {
      setLoading(true);
      
      const sampleMatches = sampleLocations.filter(loc =>
        loc.name.toLowerCase().includes(input.toLowerCase()) ||
        input.toLowerCase().includes(loc.name.toLowerCase().split(',')[0])
      ).slice(0, 3);
      
      const apiSuggestions = await RouteService.getPlaceSuggestions(input, 5);
      
      const allSuggestions = [
        ...sampleMatches.map(loc => ({ 
          name: loc.name, 
          lat: loc.lat || 12.9716, 
          lng: loc.lng || 77.5946, 
          type: 'sample', 
          importance: 1 
        })),
        ...apiSuggestions
      ];
      
      const uniqueSuggestions = allSuggestions.reduce((acc, current) => {
        const exists = acc.find(item => 
          Math.abs(item.lat - current.lat) < 0.001 && 
          Math.abs(item.lng - current.lng) < 0.001
        );
        if (!exists) {
          acc.push(current);
        }
        return acc;
      }, []).slice(0, 7);
      
      setSuggestions(uniqueSuggestions);
      setLoading(false);
    };
    
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [input, sampleLocations]);
  
  if (suggestions.length === 0) return null;
  
  return (
    <div className="place-suggestions">
      <div className="suggestions-header">
        <span>💡 Did you mean:</span>
      </div>
      <div className="suggestions-list">
        {suggestions.map((suggestion, index) => (
          <div 
            key={index}
            className="suggestion-item"
            onClick={() => onSelect(suggestion)}
          >
            <div className="suggestion-icon">
              {suggestion.type === 'sample' ? '🏙️' : '📍'}
            </div>
            <div className="suggestion-details">
              <div className="suggestion-name">
                {suggestion.name.split(',')[0]}
              </div>
              <div className="suggestion-address">
                {suggestion.name.split(',').slice(1, 3).join(',')}
              </div>
            </div>
            <div className="suggestion-action">
              {isStart ? 'Set as Start' : 'Set as End'}
            </div>
          </div>
        ))}
      </div>
      {loading && (
        <div className="suggestions-loading">
          <div className="loading-spinner"></div>
          Finding places...
        </div>
      )}
    </div>
  );
}

// Navigation Progress Marker Component
function NavigationProgressMarker({ route, progress }) {
  if (!route || !route.geometry || route.geometry.length === 0 || progress === 0) return null;
  
  const progressIndex = Math.floor((progress / 100) * (route.geometry.length - 1));
  const position = route.geometry[Math.min(progressIndex, route.geometry.length - 1)];
  
  if (!position || !position[0] || !position[1]) return null;
  
  return (
    <Marker
      position={position}
      icon={L.divIcon({
        html: `
          <div class="route-progress-marker">
            <div style="
              width: 35px;
              height: 35px;
              background: linear-gradient(135deg, #FF5722 0%, #FF9800 100%);
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 0 20px rgba(255, 87, 34, 0.8);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 16px;
              animation: bounce 1s infinite alternate;
            ">
              🚗
            </div>
          </div>
          <style>
            @keyframes bounce {
              0% { transform: translateY(0); }
              100% { transform: translateY(-5px); }
            }
          </style>
        `,
        className: 'route-progress-marker',
        iconSize: [35, 35],
        iconAnchor: [17, 17]
      })}
    >
      <Popup>
        <div style={{ padding: '10px' }}>
          <h4 style={{ margin: '0 0 10px 0' }}>🚗 Navigation Progress</h4>
          <p style={{ margin: '5px 0' }}><strong>Progress:</strong> {progress}%</p>
          <p style={{ margin: '5px 0' }}><strong>Remaining:</strong> {Math.round(((100 - progress) / 100) * (route.distance / 1000))} km</p>
          <p style={{ margin: '5px 0', fontSize: '12px', color: '#666' }}>
            <em>Follow the highlighted route</em>
          </p>
        </div>
      </Popup>
    </Marker>
  );
}

function TrafficMap({ userId }) {
  // ========== STATE VARIABLES ==========
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [mapMode, setMapMode] = useState("light");
  
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedEnd, setSelectedEnd] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  const [isNavigating, setIsNavigating] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [navInterval, setNavInterval] = useState(null);
  
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  
  const [autoCorrectEnabled, setAutoCorrectEnabled] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [mapBounds, setMapBounds] = useState(null);
  const [shouldFitBounds, setShouldFitBounds] = useState(false);

  // ========== REAL TRAFFIC DATA STATES ==========
  const [trafficData, setTrafficData] = useState([]);
  const [collectiveTraffic, setCollectiveTraffic] = useState(null);
  const [aiOptimizedRoute, setAiOptimizedRoute] = useState(null);
  const [activeUsers, setActiveUsers] = useState({ count: 0, users: [] });
  const [trafficSignals, setTrafficSignals] = useState([]);
  const [backendStatus, setBackendStatus] = useState("disconnected");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [trafficStats, setTrafficStats] = useState({
    total_vehicles: 0,
    congested_points: 0,
    avg_speed: 0,
    last_updated: null,
    data_points: 0
  });

  const [systemInfo, setSystemInfo] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [roadNetwork, setRoadNetwork] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [trafficHeatmap, setTrafficHeatmap] = useState(null);

  const mapRef = useRef();
  const speechRef = useRef(null);
  const fromInputRef = useRef(null);
  const toInputRef = useRef(null);
  const trafficRefreshInterval = useRef(null);
  const wsRef = useRef(null);
  const autoRouteTimerRef = useRef(null);

  // ========== ENHANCED SAMPLE LOCATIONS ==========
  const sampleLocations = [
    { name: "Majestic Bus Station, Bangalore", lat: 12.9776, lng: 77.5710, type: "transport" },
    { name: "MG Road, Bangalore", lat: 12.9758, lng: 77.6050, type: "shopping" },
    { name: "Koramangala, Bangalore", lat: 12.9279, lng: 77.6271, type: "residential" },
    { name: "Indiranagar, Bangalore", lat: 12.9784, lng: 77.6408, type: "commercial" },
    { name: "Whitefield, Bangalore", lat: 12.9698, lng: 77.7500, type: "tech_park" },
    { name: "Kempegowda International Airport, Bangalore", lat: 13.1989, lng: 77.7068, type: "airport" },
    { name: "Bangalore Palace, Bangalore", lat: 12.9987, lng: 77.5921, type: "landmark" },
    { name: "Lalbagh Botanical Garden, Bangalore", lat: 12.9507, lng: 77.5848, type: "park" },
    { name: "Cubbon Park, Bangalore", lat: 12.9765, lng: 77.5929, type: "park" },
    { name: "UB City, Bangalore", lat: 12.9716, lng: 77.5946, type: "shopping" },
    { name: "Forum Mall, Koramangala", lat: 12.9287, lng: 77.6274, type: "mall" },
    { name: "Phoenix Marketcity, Bangalore", lat: 12.9945, lng: 77.6972, type: "mall" },
    { name: "Electronic City, Bangalore", lat: 12.8456, lng: 77.6633, type: "tech_park" },
    { name: "Yeshwantpur, Bangalore", lat: 13.0259, lng: 77.5485, type: "commercial" },
    { name: "Marathahalli, Bangalore", lat: 12.9592, lng: 77.6974, type: "residential" }
  ];

  // ========== CREATE INITIAL TRAFFIC DATA ==========
  const createInitialTrafficData = useCallback(() => {
    const trafficPoints = [];
    const baseLats = [12.9716, 12.9758, 12.9279, 12.9784, 12.9698];
    const baseLngs = [77.5946, 77.6050, 77.6271, 77.6408, 77.7500];
    
    // Create 10-15 initial traffic points
    for (let i = 0; i < 12; i++) {
      const lat = baseLats[i % baseLats.length] + (Math.random() - 0.5) * 0.02;
      const lng = baseLngs[i % baseLngs.length] + (Math.random() - 0.5) * 0.02;
      
      // Random traffic level
      const levels = ['low', 'medium', 'high'];
      const level = levels[Math.floor(Math.random() * levels.length)];
      
      // Vehicle count based on level
      let vehicleCount = 0;
      switch(level) {
        case 'low': vehicleCount = Math.floor(Math.random() * 10) + 1; break;
        case 'medium': vehicleCount = Math.floor(Math.random() * 15) + 10; break;
        case 'high': vehicleCount = Math.floor(Math.random() * 30) + 20; break;
      }
      
      trafficPoints.push({
        id: `traffic_${Date.now()}_${i}`,
        lat: lat,
        lng: lng,
        level: level,
        vehicle_count: vehicleCount,
        ambulance_detected: Math.random() > 0.9,
        location_name: `Traffic Point ${i + 1}`,
        timestamp: new Date().toISOString(),
        user_id: 'system'
      });
    }
    
    return trafficPoints;
  }, []);

  // ========== ENHANCED BACKEND DATA FETCHING ==========
  const fetchBackendData = useCallback(async () => {
    try {
      setBackendStatus("connecting");
      
      // Fetch comprehensive backend data
      const backendData = await TrafficBackendService.fetchBackendData();
      
      if (backendData) {
        const {
          systemInfo,
          latestTraffic,
          collectiveTraffic,
          activeUsers,
          trafficSignals,
          cameras,
          roadNetwork
        } = backendData;
        
        // Set system info
        if (systemInfo) setSystemInfo(systemInfo);
        
        // ✅ FIXED: Handle traffic data transformation
        let trafficPoints = [];
        
        if (latestTraffic && latestTraffic.traffic_points && latestTraffic.traffic_points.length > 0) {
          // Use backend traffic points
          trafficPoints = latestTraffic.traffic_points;
        } else if (latestTraffic && (latestTraffic.lane_1 !== undefined || latestTraffic.lane_2 !== undefined || latestTraffic.lane_3 !== undefined)) {
          // Create traffic points from lane data
          trafficPoints = TrafficBackendService.createTrafficPointsFromLaneData(latestTraffic);
        } else {
          // Create initial demo data
          trafficPoints = createInitialTrafficData();
        }
        
        // Update traffic data state
        setTrafficData(trafficPoints);
        
        // Calculate statistics
        const totalVehicles = trafficPoints.reduce((sum, point) => 
          sum + (point.vehicle_count || 0), 0);
        
        const congestedPoints = trafficPoints.filter(point => 
          point.level === 'high' || point.level === 'medium').length;
        
        setTrafficStats({
          total_vehicles: totalVehicles,
          congested_points: congestedPoints,
          avg_speed: collectiveTraffic?.avg_speed || (trafficPoints.length > 0 ? 30 : 0),
          last_updated: new Date().toLocaleTimeString(),
          data_points: trafficPoints.length
        });
        
        // Set other data
        if (collectiveTraffic) setCollectiveTraffic(collectiveTraffic);
        if (activeUsers) setActiveUsers(activeUsers);
        if (trafficSignals) setTrafficSignals(trafficSignals);
        if (cameras) setAvailableCameras(cameras.cameras || []);
        if (roadNetwork) setRoadNetwork(roadNetwork);
        
        setBackendStatus("connected");
      } else {
        // If no backend data, use simulated data
        const trafficPoints = createInitialTrafficData();
        setTrafficData(trafficPoints);
        
        setTrafficStats({
          total_vehicles: trafficPoints.reduce((sum, point) => sum + (point.vehicle_count || 0), 0),
          congested_points: trafficPoints.filter(point => point.level === 'high' || point.level === 'medium').length,
          avg_speed: 30,
          last_updated: new Date().toLocaleTimeString(),
          data_points: trafficPoints.length
        });
        
        setBackendStatus("simulated");
      }
      
      // Fetch additional data
      try {
        const [systemStatus, heatmapData] = await Promise.all([
          TrafficBackendService.fetchSystemStatus(),
          TrafficBackendService.fetchTrafficHeatmap()
        ]);
        
        if (systemStatus) setSystemHealth(systemStatus);
        if (heatmapData) setTrafficHeatmap(heatmapData);
      } catch (fetchError) {
        console.log("Optional endpoints not available:", fetchError);
      }
      
    } catch (error) {
      console.error("Error fetching comprehensive backend data:", error);
      setBackendStatus("error");
      
      // Use simulated data as fallback
      const trafficPoints = createInitialTrafficData();
      setTrafficData(trafficPoints);
      
      setTrafficStats({
        total_vehicles: trafficPoints.reduce((sum, point) => sum + (point.vehicle_count || 0), 0),
        congested_points: trafficPoints.filter(point => point.level === 'high' || point.level === 'medium').length,
        avg_speed: 30,
        last_updated: new Date().toLocaleTimeString(),
        data_points: trafficPoints.length
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [createInitialTrafficData]);

  const fetchAiOptimizedRoute = useCallback(async (start, end) => {
    if (!start || !end) return;
    
    setIsLoading(true);
    try {
      const optimizedRoute = await TrafficBackendService.fetchOptimizedRoute(start, end);
      
      if (optimizedRoute && optimizedRoute.optimal_route) {
        setAiOptimizedRoute(optimizedRoute);
        
        // Convert AI route to our format
        const aiRoute = {
          geometry: optimizedRoute.optimal_route.path?.map(p => [p.lat, p.lng]) || [],
          distance: (optimizedRoute.optimal_route.distance_km || 0) * 1000,
          duration: (optimizedRoute.optimal_route.estimated_time_min || 0) * 60,
          type: 'AI_OPTIMIZED',
          confidence: optimizedRoute.optimal_route.confidence || 0.9,
          congestion_level: optimizedRoute.optimal_route.congestion_level,
          avg_speed: optimizedRoute.optimal_route.avg_speed_kmh,
          isAiOptimized: true,
          bounds: optimizedRoute.optimal_route.path?.length > 0 ? 
            RouteService.calculateBoundsFromPoints(optimizedRoute.optimal_route.path.map(p => [p.lat, p.lng])) : null
        };
        
        // Add AI route to routes list
        setRoutes(prev => [aiRoute, ...prev]);
        setSelectedRoute(aiRoute);
        
        setSuccessMessage(`✅ AI-Optimized route found! Confidence: ${(optimizedRoute.optimal_route.confidence || 0) * 100}%`);
        
        // Auto-zoom to route
        if (aiRoute.bounds && aiRoute.bounds[0] && aiRoute.bounds[1]) {
          setMapBounds(aiRoute.bounds);
          setShouldFitBounds(true);
          setTimeout(() => setShouldFitBounds(false), 2000);
        }
      }
    } catch (error) {
      console.error("Error fetching AI optimized route:", error);
      setError("AI optimization unavailable. Using standard routing.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ========== AUTO ROUTE CALCULATION ==========
  const autoCalculateRoute = useCallback(async () => {
    if (!selectedStart || !selectedStart[0] || !selectedStart[1] || 
        !selectedEnd || !selectedEnd[0] || !selectedEnd[1]) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setRoutes([]);
    setSelectedRoute(null);
    setRecommendations([]);
    
    try {
      // Get AI optimized route
      await fetchAiOptimizedRoute(selectedStart, selectedEnd);
      
      // Also try start_end_route endpoint
      try {
        const startEndRoute = await TrafficBackendService.startEndRoute(selectedStart, selectedEnd);
        if (startEndRoute && startEndRoute.path) {
          const enhancedRoute = {
            geometry: startEndRoute.path.map(p => [p.lat, p.lng]) || [],
            distance: (startEndRoute.distance_km || 0) * 1000,
            duration: (startEndRoute.estimated_time_min || 0) * 60,
            type: 'ENHANCED_ROUTE',
            confidence: 0.8,
            bounds: startEndRoute.path?.length > 0 ? 
              RouteService.calculateBoundsFromPoints(startEndRoute.path.map(p => [p.lat, p.lng])) : null,
            isEnhanced: true
          };
          
          setRoutes(prev => [...prev, enhancedRoute]);
        }
      } catch (error) {
        console.log("Enhanced route endpoint not available:", error);
      }
      
      // Get standard routes
      const routeOptions = await RouteService.getRoute(selectedStart, selectedEnd);
      
      if (routeOptions && routeOptions.length > 0) {
        const validRoutes = routeOptions.filter(route => 
          route.geometry && route.geometry.length > 0
        );
        
        if (validRoutes.length > 0) {
          setRoutes(prev => [...prev, ...validRoutes]);
          
          const recs = generateRouteRecommendations([...validRoutes, ...(aiOptimizedRoute ? [aiOptimizedRoute] : [])]);
          setRecommendations(recs);
          
          const message = `✅ Found ${validRoutes.length + (aiOptimizedRoute ? 1 : 0)} route(s). AI optimization active.`;
          setSuccessMessage(message);
          
          speakMessage(
            `Found ${validRoutes.length + (aiOptimizedRoute ? 1 : 0)} routes with AI optimization.`
          );
          
          if (aiOptimizedRoute?.optimal_route?.path) {
            const bounds = RouteService.calculateBoundsFromPoints(
              aiOptimizedRoute.optimal_route.path.map(p => [p.lat, p.lng])
            );
            if (bounds) {
              setMapBounds(bounds);
              setShouldFitBounds(true);
              
              setTimeout(() => setShouldFitBounds(false), 2000);
            }
          }
        } else {
          throw new Error("No valid routes found");
        }
        
      } else {
        throw new Error("No routes found");
      }
    } catch (error) {
      console.error("Route finding error:", error);
      
      const fallbackGeometry = RouteService.createCurvedRoute(selectedStart, selectedEnd);
      const fallbackRoute = {
        geometry: fallbackGeometry,
        distance: RouteService.calculateDistance(selectedStart[0], selectedStart[1], selectedEnd[0], selectedEnd[1]),
        duration: RouteService.calculateDistance(selectedStart[0], selectedStart[1], selectedEnd[0], selectedEnd[1]) / 1000 * 60 * 3,
        confidence: 0.3,
        isFallback: true,
        type: 'DIRECT',
        bounds: RouteService.calculateBoundsFromPoints([selectedStart, selectedEnd, ...fallbackGeometry])
      };
      
      setRoutes([fallbackRoute]);
      setSelectedRoute(fallbackRoute);
      setError("⚠️ Using approximate route (routing service unavailable)");
      
      if (fallbackRoute.bounds && fallbackRoute.bounds[0] && fallbackRoute.bounds[1]) {
        setMapBounds(fallbackRoute.bounds);
        setShouldFitBounds(true);
        
        setTimeout(() => setShouldFitBounds(false), 2000);
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedStart, selectedEnd, aiOptimizedRoute, fetchAiOptimizedRoute]);

  useEffect(() => {
    // Clear any existing timer
    if (autoRouteTimerRef.current) {
      clearTimeout(autoRouteTimerRef.current);
    }
    
    // Auto-calculate route when both locations are set
    if (selectedStart && selectedStart[0] && selectedStart[1] && 
        selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      
      autoRouteTimerRef.current = setTimeout(() => {
        autoCalculateRoute();
      }, 1000); // 1 second delay after both locations are set
    }
    
    return () => {
      if (autoRouteTimerRef.current) {
        clearTimeout(autoRouteTimerRef.current);
      }
    };
  }, [selectedStart, selectedEnd, autoCalculateRoute]);

  const handleTrafficUpdate = useCallback((updatedTrafficPoint) => {
    setTrafficData(prev => prev.map(point => 
      point.lat === updatedTrafficPoint.lat && point.lng === updatedTrafficPoint.lng 
        ? { ...point, ...updatedTrafficPoint }
        : point
    ));
    
    // Recalculate statistics
    const totalVehicles = trafficData.reduce((sum, point) => 
      sum + (point.vehicle_count || 0), 0) + 
      (updatedTrafficPoint.vehicle_count || 0) - 
      (trafficData.find(p => p.lat === updatedTrafficPoint.lat && p.lng === updatedTrafficPoint.lng)?.vehicle_count || 0);
    
    const congestedPoints = trafficData.filter(point => 
      point.level === 'high' || point.level === 'medium').length;
    
    setTrafficStats(prev => ({
      ...prev,
      total_vehicles: totalVehicles,
      congested_points: congestedPoints,
      last_updated: new Date().toLocaleTimeString()
    }));
  }, [trafficData]);

  const handleUserTrafficReport = useCallback(async (location) => {
    try {
      // Create a traffic point at user's location
      const newTrafficPoint = {
        id: `user_${Date.now()}`,
        lat: location.lat,
        lng: location.lng,
        level: 'low',
        vehicle_count: 5,
        ambulance_detected: false,
        location_name: 'Your Location',
        timestamp: new Date().toISOString(),
        user_id: 'current_user'
      };
      
      // Add to local state immediately
      setTrafficData(prev => [...prev, newTrafficPoint]);
      
      // Submit to backend
      const result = await TrafficBackendService.submitTrafficObservation(
        location.lat,
        location.lng,
        'low',
        5,
        false
      );
      
      if (result && result.success) {
        console.log("User traffic report submitted:", result);
        // Refresh data after submission
        setTimeout(() => fetchBackendData(), 1000);
      }
    } catch (error) {
      console.error("Failed to submit user traffic report:", error);
    }
  }, [fetchBackendData]);

  // ========== WEB SOCKET SETUP ==========
  useEffect(() => {
    // Initialize WebSocket for real-time updates
    const initWebSocket = () => {
      try {
        if (wsRef.current) {
          wsRef.current.close();
        }
        
        const ws = new WebSocket(`ws://localhost:8000/ws/traffic`);
        
        ws.onopen = () => {
          console.log("WebSocket connected");
          setBackendStatus("connected");
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("WebSocket message received:", data);
            
            // Handle different types of real-time updates
            if (data.type === 'traffic_update' && data.data) {
              setTrafficData(prev => {
                // Check if this point already exists
                const existingIndex = prev.findIndex(point => 
                  point.id === data.data.id || 
                  (Math.abs(point.lat - data.data.lat) < 0.001 && 
                   Math.abs(point.lng - data.data.lng) < 0.001)
                );
                
                if (existingIndex >= 0) {
                  // Update existing point
                  const updated = [...prev];
                  updated[existingIndex] = { ...updated[existingIndex], ...data.data };
                  return updated;
                } else {
                  // Add new point
                  return [...prev, data.data];
                }
              });
              
              // Update stats
              fetchBackendData();
            }
            
            if (data.type === 'collective_update' && data.data) {
              setCollectiveTraffic(data.data);
            }
            
            if (data.type === 'active_users' && data.data) {
              setActiveUsers(data.data);
            }
            
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };
        
        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };
        
        ws.onclose = () => {
          console.log("WebSocket disconnected");
          setTimeout(initWebSocket, 5000); // Reconnect after 5 seconds
        };
        
        wsRef.current = ws;
        
        return ws;
      } catch (error) {
        console.error("WebSocket initialization failed:", error);
        return null;
      }
    };
    
    const ws = initWebSocket();
    
    return () => {
      if (ws) ws.close();
    };
  }, [fetchBackendData]);

  // ========== USE EFFECTS ==========
  useEffect(() => {
    // Initial data fetch
    fetchBackendData();
    
    // Set up auto-refresh every 10 seconds
    trafficRefreshInterval.current = setInterval(() => {
      fetchBackendData();
    }, 10000);
    
    // Cleanup
    return () => {
      if (trafficRefreshInterval.current) {
        clearInterval(trafficRefreshInterval.current);
      }
    };
  }, [fetchBackendData]);

  // ========== SAFE MAP REF ACCESS ==========
  const safeMapFlyTo = useCallback((position, zoom = 14) => {
    if (!position || !position[0] || !position[1]) return;
    
    if (mapRef.current) {
      try {
        mapRef.current.flyTo(position, zoom, {
          duration: 1.5,
          easeLinearity: 0.25
        });
      } catch (error) {
        console.error("Error flying to position:", error);
      }
    }
  }, []);

  // ========== AUTO-ZOOM FUNCTION ==========
  const autoZoomToLocations = useCallback(() => {
    if (!selectedStart || !selectedStart[0] || !selectedStart[1] || !selectedEnd || !selectedEnd[0] || !selectedEnd[1]) return;
    
    const bounds = [
      [Math.min(selectedStart[0], selectedEnd[0]), Math.min(selectedStart[1], selectedEnd[1])],
      [Math.max(selectedStart[0], selectedEnd[0]), Math.max(selectedStart[1], selectedEnd[1])]
    ];
    
    setMapBounds(bounds);
    setShouldFitBounds(true);
    
    setTimeout(() => setShouldFitBounds(false), 2000);
  }, [selectedStart, selectedEnd]);

  useEffect(() => {
    if (selectedStart && selectedStart[0] && selectedStart[1] && 
        selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      autoZoomToLocations();
    }
  }, [selectedStart, selectedEnd, autoZoomToLocations]);

  useEffect(() => {
    if (selectedRoute && selectedRoute.geometry && selectedRoute.geometry.length > 0) {
      const allPoints = [
        selectedStart,
        selectedEnd,
        ...selectedRoute.geometry
      ].filter(p => p && p[0] && p[1]);
      
      if (allPoints.length >= 2) {
        const lats = allPoints.map(p => p[0]);
        const lngs = allPoints.map(p => p[1]);
        
        const bounds = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)]
        ];
        
        setMapBounds(bounds);
        setShouldFitBounds(true);
        
        setTimeout(() => setShouldFitBounds(false), 2000);
      }
    }
  }, [selectedRoute, selectedStart, selectedEnd]);

  // ========== ENHANCED GEOCODING ==========
  const geocodeAndSetLocation = async (locationText, isStart = true) => {
    if (!locationText || locationText.trim() === "") {
      setError("Please enter a location");
      return null;
    }
    
    setIsGeocoding(true);
    setError(null);
    
    try {
      let correctedLocation = null;
      
      if (autoCorrectEnabled) {
        correctedLocation = RouteService.fuzzyMatchLocation(locationText, sampleLocations);
        
        if (correctedLocation) {
          console.log(`Auto-corrected "${locationText}" to "${correctedLocation.name}"`);
        }
      }
      
      if (!correctedLocation) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationText + ", Bangalore, India")}&limit=1`;
        
        const response = await fetch(url, {
          headers: { 
            'User-Agent': 'SmartTrafficSystem/1.0',
            'Accept-Language': 'en'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            correctedLocation = {
              name: data[0].display_name?.split(',').slice(0, 3).join(',') || locationText,
              lat: parseFloat(data[0].lat) || 12.9716,
              lng: parseFloat(data[0].lon) || 77.5946
            };
          }
        }
      }
      
      if (!correctedLocation) {
        const randomLocation = sampleLocations[Math.floor(Math.random() * sampleLocations.length)];
        correctedLocation = {
          name: `${locationText} (near ${randomLocation.name.split(',')[0]})`,
          lat: randomLocation.lat + (Math.random() - 0.5) * 0.01,
          lng: randomLocation.lng + (Math.random() - 0.5) * 0.01
        };
        
        setError(`Using approximate location near ${randomLocation.name.split(',')[0]}`);
      }
      
      if (!correctedLocation.lat || !correctedLocation.lng) {
        correctedLocation.lat = 12.9716;
        correctedLocation.lng = 77.5946;
      }
      
      const locationArray = [correctedLocation.lat, correctedLocation.lng];
      
      if (isStart) {
        setFromLocation(correctedLocation.name);
        setSelectedStart(locationArray);
      } else {
        setToLocation(correctedLocation.name);
        setSelectedEnd(locationArray);
      }
      
      safeMapFlyTo(locationArray, 15);
      
      return correctedLocation;
      
    } catch (error) {
      console.error("Geocoding failed:", error);
      setError("Location service unavailable. Using default location.");
      
      const defaultLocation = { name: locationText, lat: 12.9716, lng: 77.5946 };
      const locationArray = [defaultLocation.lat, defaultLocation.lng];
      
      if (isStart) {
        setFromLocation(defaultLocation.name);
        setSelectedStart(locationArray);
      } else {
        setToLocation(defaultLocation.name);
        setSelectedEnd(locationArray);
      }
      
      safeMapFlyTo(locationArray, 15);
      
      return defaultLocation;
    } finally {
      setIsGeocoding(false);
    }
  };

  // ========== FIND ROUTE ==========
  const findRoute = async () => {
    await autoCalculateRoute();
  };

  // ========== GENERATE RECOMMENDATIONS ==========
  const generateRouteRecommendations = (routes) => {
    if (!routes || routes.length === 0) return [];
    
    const recommendations = [];
    
    const validRoutes = routes.filter(route => route.distance > 0 && route.duration > 0);
    if (validRoutes.length < 1) return [];
    
    const aiRoute = validRoutes.find(route => route.type === 'AI_OPTIMIZED');
    if (aiRoute) {
      recommendations.push({
        type: 'AI_OPTIMIZED',
        title: '🤖 AI-Optimized Route',
        description: `Collective intelligence route with ${aiRoute.congestion_level || 'optimal'} traffic`,
        icon: '🤖',
        route: aiRoute
      });
    }
    
    const enhancedRoute = validRoutes.find(route => route.type === 'ENHANCED_ROUTE');
    if (enhancedRoute) {
      recommendations.push({
        type: 'ENHANCED_ROUTE',
        title: '✨ Enhanced Route',
        description: `Advanced planning with real-time data`,
        icon: '✨',
        route: enhancedRoute
      });
    }
    
    const sortedByTime = [...validRoutes].sort((a, b) => a.duration - b.duration);
    const sortedByDistance = [...validRoutes].sort((a, b) => a.distance - b.distance);
    
    if (sortedByTime.length > 0 && (!aiRoute || sortedByTime[0] !== aiRoute) && (!enhancedRoute || sortedByTime[0] !== enhancedRoute)) {
      const fastest = sortedByTime[0];
      recommendations.push({
        type: 'TIME_SAVER',
        title: '🚀 Fastest Route',
        description: `Quickest travel time: ${Math.round(fastest.duration / 60)} min`,
        icon: '⏱️',
        route: fastest
      });
    }
    
    if (sortedByDistance.length > 0 && (!aiRoute || sortedByDistance[0] !== aiRoute) && (!enhancedRoute || sortedByDistance[0] !== enhancedRoute)) {
      const shortest = sortedByDistance[0];
      recommendations.push({
        type: 'DISTANCE_SAVER',
        title: '📏 Shortest Route',
        description: `Shortest distance: ${(shortest.distance / 1000).toFixed(1)} km`,
        icon: '📏',
        route: shortest
      });
    }
    
    return recommendations;
  };

  // ========== HANDLE LOCATIONS ==========
  const handleFromLocation = async () => {
    if (!fromLocation.trim()) {
      setError("Please enter a 'From' location");
      return;
    }
    
    const result = await geocodeAndSetLocation(fromLocation, true);
    setShowFromSuggestions(false);
    
    if (result && selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      autoZoomToLocations();
    }
  };

  const handleToLocation = async () => {
    if (!toLocation.trim()) {
      setError("Please enter a 'To' location");
      return;
    }
    
    const result = await geocodeAndSetLocation(toLocation, false);
    setShowToSuggestions(false);
    
    if (result && selectedStart && selectedStart[0] && selectedStart[1]) {
      autoZoomToLocations();
    }
  };

  const handleFromSuggestionSelect = (suggestion) => {
    if (!suggestion || !suggestion.lat || !suggestion.lng) return;
    
    const locationArray = [suggestion.lat, suggestion.lng];
    setFromLocation(suggestion.name);
    setSelectedStart(locationArray);
    setShowFromSuggestions(false);
    setSuccessMessage(`📍 From: ${suggestion.name.split(',')[0]}`);
    
    safeMapFlyTo(locationArray, 15);
    
    if (selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      autoZoomToLocations();
    }
  };

  const handleToSuggestionSelect = (suggestion) => {
    if (!suggestion || !suggestion.lat || !suggestion.lng) return;
    
    const locationArray = [suggestion.lat, suggestion.lng];
    setToLocation(suggestion.name);
    setSelectedEnd(locationArray);
    setShowToSuggestions(false);
    setSuccessMessage(`🏁 To: ${suggestion.name.split(',')[0]}`);
    
    safeMapFlyTo(locationArray, 15);
    
    if (selectedStart && selectedStart[0] && selectedStart[1]) {
      autoZoomToLocations();
    }
  };

  const useCurrentLocationForStart = () => {
    if (!userLocation || !userLocation[0] || !userLocation[1]) {
      setError("Please enable location services first");
      return;
    }
    
    setSelectedStart(userLocation);
    setFromLocation("Your Current Location");
    setSuccessMessage("📍 From: Your Current Location");
    setRoutes([]);
    setSelectedRoute(null);
    
    safeMapFlyTo(userLocation, 15);
    
    if (selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      autoZoomToLocations();
    }
  };

  const useCurrentLocationForEnd = () => {
    if (!userLocation || !userLocation[0] || !userLocation[1]) {
      setError("Please enable location services first");
      return;
    }
    
    setSelectedEnd(userLocation);
    setToLocation("Your Current Location");
    setSuccessMessage("🏁 To: Your Current Location");
    setRoutes([]);
    setSelectedRoute(null);
    
    safeMapFlyTo(userLocation, 15);
    
    if (selectedStart && selectedStart[0] && selectedStart[1]) {
      autoZoomToLocations();
    }
  };

  // ========== SPEECH FUNCTION ==========
  const speakMessage = (text) => {
    if ('speechSynthesis' in window) {
      if (speechRef.current) {
        window.speechSynthesis.cancel();
      }
      
      const msg = new SpeechSynthesisUtterance(text);
      msg.rate = 1.0;
      msg.pitch = 1.0;
      msg.volume = 1.0;
      
      speechRef.current = msg;
      window.speechSynthesis.speak(msg);
    }
  };

  // ========== NAVIGATION FUNCTIONS ==========
  const startNavigation = () => {
    if (!selectedRoute) {
      setError("Please select a route first");
      return;
    }
    
    setIsNavigating(true);
    setNavProgress(0);
    setCurrentStep(0);
    
    const instruction = recommendations.length > 0 
      ? recommendations[0].description
      : `Distance: ${(selectedRoute.distance / 1000).toFixed(1)} kilometers. Estimated time: ${Math.round(selectedRoute.duration / 60)} minutes.`;
    
    speakMessage(`Navigation started. ${instruction}`);
    
    // Clear any existing interval
    if (navInterval) {
      clearInterval(navInterval);
    }
    
    const interval = setInterval(() => {
      setNavProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          speakMessage("You have arrived at your destination!");
          setIsNavigating(false);
          return 100;
        }
        
        // Give navigation instructions at certain points
        if (prev === 25) speakMessage("Continue straight for 2 kilometers.");
        if (prev === 50) speakMessage("Take the next right turn.");
        if (prev === 75) speakMessage("Destination is approaching on your left.");
        
        // Move car marker along the route
        if (mapRef.current && selectedRoute.geometry) {
          const progressIndex = Math.floor((prev / 100) * (selectedRoute.geometry.length - 1));
          const position = selectedRoute.geometry[Math.min(progressIndex, selectedRoute.geometry.length - 1)];
          
          if (position && position[0] && position[1]) {
            try {
              // Smoothly pan the map to follow the car
              mapRef.current.flyTo(position, 16, {
                duration: 1,
                easeLinearity: 0.25
              });
            } catch (error) {
              console.error("Error flying to navigation position:", error);
            }
          }
        }
        
        return prev + 0.5; // Increment progress
      });
    }, 300); // Update every 300ms for smooth movement
    
    setNavInterval(interval);
  };

  const stopNavigation = () => {
    setIsNavigating(false);
    setNavProgress(0);
    if (navInterval) {
      clearInterval(navInterval);
      setNavInterval(null);
    }
    speakMessage("Navigation stopped.");
  };

  // ========== RENDER FUNCTIONS ==========
  const renderRoutes = () => {
    return routes.map((route, index) => {
      if (!route.geometry || route.geometry.length === 0) return null;
      
      const isSelected = selectedRoute === route;
      const isFallback = route.isFallback;
      const isAiOptimized = route.type === 'AI_OPTIMIZED';
      const isEnhanced = route.type === 'ENHANCED_ROUTE';
      
      let routeColor = '#FF9800';
      if (isFallback) routeColor = '#F44336';
      if (isSelected) routeColor = '#2196F3';
      if (route.type === 'TIME_SAVER') routeColor = '#43e97b';
      if (route.type === 'DISTANCE_SAVER') routeColor = '#38f9d7';
      if (isAiOptimized) routeColor = '#9C27B0';
      if (isEnhanced) routeColor = '#FF5722';
      
      return (
        <React.Fragment key={index}>
          <Polyline
            positions={route.geometry}
            pathOptions={{
              color: routeColor,
              weight: isSelected ? 6 : 4,
              opacity: isSelected ? 0.9 : 0.6,
              lineCap: 'round',
              lineJoin: 'round',
              dashArray: isFallback ? '10, 10' : null,
              className: isSelected ? 'route-line route-optimized' : 'route-alternative'
            }}
            eventHandlers={{
              click: () => {
                setSelectedRoute(route);
                speakMessage(`Route ${index + 1} selected. Distance: ${(route.distance / 1000).toFixed(1)} kilometers.`);
                
                if (route.bounds && route.bounds[0] && route.bounds[1]) {
                  setMapBounds(route.bounds);
                  setShouldFitBounds(true);
                  
                  setTimeout(() => setShouldFitBounds(false), 2000);
                }
              }
            }}
          >
            <Popup>
              <div className="route-popup">
                <h4>
                  {isAiOptimized ? '🤖 AI-Optimized Route' : 
                   isEnhanced ? '✨ Enhanced Route' :
                   isFallback ? '🔄 Approximate Route' : 
                   `🛣️ ${route.type.replace('_', ' ')} Route`}
                </h4>
                <p>Distance: {(route.distance / 1000).toFixed(2)} km</p>
                <p>Time: {Math.round(route.duration / 60)} min</p>
                {isAiOptimized && route.congestion_level && (
                  <p>Congestion: {route.congestion_level}</p>
                )}
                {isAiOptimized && route.avg_speed && (
                  <p>Avg Speed: {route.avg_speed} km/h</p>
                )}
                <p>Type: {route.type.replace('_', ' ')}</p>
                {isFallback && <p style={{color: '#F44336'}}>⚠️ Direct route (service unavailable)</p>}
                {isAiOptimized && <p style={{color: '#9C27B0'}}>🤖 Powered by Collective Intelligence</p>}
                {isEnhanced && <p style={{color: '#FF5722'}}>✨ Enhanced with real-time data</p>}
              </div>
            </Popup>
          </Polyline>
        </React.Fragment>
      );
    });
  };

  const renderTrafficMarkers = () => {
    return trafficData.map((trafficPoint, index) => (
      <TrafficCongestionMarker 
        key={`${trafficPoint.id || trafficPoint.lat}-${trafficPoint.lng}-${index}`} 
        trafficData={trafficPoint}
        onTrafficUpdate={handleTrafficUpdate}
      />
    ));
  };

  const getAllPointsForBounds = () => {
    const points = [];
    
    if (selectedStart && selectedStart[0] && selectedStart[1]) points.push(selectedStart);
    if (selectedEnd && selectedEnd[0] && selectedEnd[1]) points.push(selectedEnd);
    
    if (selectedRoute && selectedRoute.geometry) {
      const validRoutePoints = selectedRoute.geometry.filter(p => p && p[0] && p[1]);
      points.push(...validRoutePoints);
    }
    
    if (userLocation && userLocation[0] && userLocation[1]) points.push(userLocation);
    
    return points.length > 0 ? points : null;
  };

  const zoomToRoute = () => {
    if (selectedRoute && selectedRoute.bounds && selectedRoute.bounds[0] && selectedRoute.bounds[1]) {
      setMapBounds(selectedRoute.bounds);
      setShouldFitBounds(true);
      
      setTimeout(() => setShouldFitBounds(false), 2000);
    }
  };

  const zoomToLocations = () => {
    if (selectedStart && selectedStart[0] && selectedStart[1] && 
        selectedEnd && selectedEnd[0] && selectedEnd[1]) {
      autoZoomToLocations();
    }
  };

  const zoomToUserLocation = () => {
    if (userLocation && userLocation[0] && userLocation[1]) {
      safeMapFlyTo(userLocation, 15);
    }
  };

  const renderStartMarker = () => {
    if (!selectedStart || !selectedStart[0] || !selectedStart[1]) return null;
    
    return (
      <Marker 
        position={selectedStart} 
        icon={L.divIcon({
          html: `
            <div style="
              background: #2196F3;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 10px #2196F3;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 20px;
            ">
              S
            </div>
          `,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })}
      >
        <Popup>
          <div className="marker-popup">
            <h4>📍 Start Point</h4>
            <p><strong>{fromLocation || "Selected location"}</strong></p>
          </div>
        </Popup>
      </Marker>
    );
  };

  const renderEndMarker = () => {
    if (!selectedEnd || !selectedEnd[0] || !selectedEnd[1]) return null;
    
    return (
      <Marker 
        position={selectedEnd} 
        icon={L.divIcon({
          html: `
            <div style="
              background: #F44336;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              border: 3px solid white;
              box-shadow: 0 2px 10px #F44336;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: bold;
              font-size: 20px;
            ">
              D
            </div>
          `,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })}
      >
        <Popup>
          <div className="marker-popup">
            <h4>🏁 Destination</h4>
            <p><strong>{toLocation || "Selected destination"}</strong></p>
          </div>
        </Popup>
      </Marker>
    );
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchBackendData();
  };

  const getInitialCenter = () => {
    if (userLocation && userLocation[0] && userLocation[1]) return userLocation;
    if (selectedStart && selectedStart[0] && selectedStart[1]) return selectedStart;
    return [12.9716, 77.5946];
  };

  const getInitialZoom = () => {
    if (userLocation && userLocation[0] && userLocation[1]) return 15;
    if (selectedStart && selectedStart[0] && selectedStart[1]) return 14;
    return 12;
  };

  const getBackendStatusColor = () => {
    switch(backendStatus) {
      case 'connected': return '#4CAF50';
      case 'connecting': return '#FF9800';
      case 'error': return '#F44336';
      case 'simulated': return '#9C27B0';
      default: return '#9E9E9E';
    }
  };

  const getBackendStatusText = () => {
    switch(backendStatus) {
      case 'connected': return `✅ Connected to Collective System (${trafficStats.data_points} data points)`;
      case 'connecting': return '🔄 Connecting to Collective System...';
      case 'error': return '❌ Backend Connection Error - Using Simulated Data';
      case 'simulated': return '🤖 Using Simulated Data (Backend Unavailable)';
      default: return '📡 Connecting...';
    }
  };

  // ========== MAIN RENDER ==========
  return (
    <div className="traffic-map-container">
      {/* Top Navigation Bar */}
      <div className="map-header">
        <div className="header-content">
          <h1>🚦 Smart Traffic Management System</h1>
          <p>Real-time Collective Intelligence with Live User Data</p>
        </div>
        
        {/* Backend Status Bar */}
        <div className="backend-status-bar">
          <div className="backend-status">
            <div 
              className="status-indicator"
              style={{ backgroundColor: getBackendStatusColor() }}
            ></div>
            <span className="status-text">{getBackendStatusText()}</span>
          </div>
          
          <div className="backend-stats">
            {trafficStats.data_points > 0 ? (
              <>
                <span className="stat-item">
                  📍 <strong>{trafficStats.data_points}</strong> traffic points
                </span>
                <span className="stat-item">
                  🚗 <strong>{trafficStats.total_vehicles}</strong> total vehicles
                </span>
                <span className="stat-item">
                  ⚠️ <strong>{trafficStats.congested_points}</strong> congested areas
                </span>
                <span className="stat-item">
                  👥 <strong>{activeUsers.count}</strong> active users
                </span>
                <span className="stat-item">
                  📹 <strong>{availableCameras.length}</strong> cameras
                </span>
                {trafficStats.last_updated && (
                  <span className="stat-item">
                    🕐 Updated: {trafficStats.last_updated}
                  </span>
                )}
              </>
            ) : (
              <span className="stat-item">
                📡 No traffic data collected yet. Be the first contributor!
              </span>
            )}
            
            <button 
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      <div className="map-layout">
        {/* Left Sidebar */}
        <div className="map-sidebar">
          <div className="sidebar-section">
            <h3>📍 Route Planning</h3>
            <p className="sidebar-subtitle">Live user-collected traffic data • Real-time updates</p>
            
            {/* System Status Panel */}
            {systemInfo && (
              <div className="system-info-panel">
                <h4>🚦 System Status</h4>
                <div className="system-stats">
                  <div className="system-stat">
                    <div className="stat-icon">🖥️</div>
                    <div className="stat-content">
                      <div className="stat-value">{systemInfo.status || "Active"}</div>
                      <div className="stat-label">Backend</div>
                    </div>
                  </div>
                  <div className="system-stat">
                    <div className="stat-icon">📡</div>
                    <div className="stat-content">
                      <div className="stat-value">{activeUsers.count}</div>
                      <div className="stat-label">Connected Users</div>
                    </div>
                  </div>
                  <div className="system-stat">
                    <div className="stat-icon">📹</div>
                    <div className="stat-content">
                      <div className="stat-value">{availableCameras.length}</div>
                      <div className="stat-label">Cameras</div>
                    </div>
                  </div>
                  <div className="system-stat">
                    <div className="stat-icon">⚡</div>
                    <div className="stat-content">
                      <div className="stat-value">Real-time</div>
                      <div className="stat-label">WebSocket</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Traffic Statistics Panel */}
            {trafficStats.data_points > 0 ? (
              <div className="traffic-stats-panel">
                <h4>📊 Live Traffic Data</h4>
                <div className="traffic-stats-grid">
                  <div className="traffic-stat">
                    <div className="stat-icon">📍</div>
                    <div className="stat-content">
                      <div className="stat-value">{trafficStats.data_points}</div>
                      <div className="stat-label">Data Points</div>
                    </div>
                  </div>
                  <div className="traffic-stat">
                    <div className="stat-icon">🚗</div>
                    <div className="stat-content">
                      <div className="stat-value">{trafficStats.total_vehicles}</div>
                      <div className="stat-label">Total Vehicles</div>
                    </div>
                  </div>
                  <div className="traffic-stat">
                    <div className="stat-icon">⚠️</div>
                    <div className="stat-content">
                      <div className="stat-value">{trafficStats.congested_points}</div>
                      <div className="stat-label">Congested Areas</div>
                    </div>
                  </div>
                  <div className="traffic-stat">
                    <div className="stat-icon">👥</div>
                    <div className="stat-content">
                      <div className="stat-value">{activeUsers.count}</div>
                      <div className="stat-label">Active Users</div>
                    </div>
                  </div>
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  marginTop: '10px', 
                  opacity: 0.9,
                  fontStyle: 'italic'
                }}>
                  {backendStatus === 'simulated' ? 'Using simulated data for demo' : 'Real data from users • Click markers to update'}
                </div>
              </div>
            ) : (
              <div className="no-data-panel">
                <h4>📡 No Traffic Data Yet</h4>
                <p style={{ fontSize: '14px', color: '#666' }}>
                  The system relies on real user-collected traffic data.
                  <br />
                  <strong>Be the first contributor!</strong>
                  <br />
                  <span style={{ fontSize: '12px', marginTop: '5px', display: 'block' }}>
                    Your location data helps build accurate traffic patterns
                  </span>
                </p>
              </div>
            )}
            
            {/* Camera Feed Section */}
            {availableCameras.length > 0 && (
              <div className="cameras-section">
                <h4>📹 Available Traffic Cameras</h4>
                <div className="cameras-list">
                  {availableCameras.slice(0, 2).map((camera, index) => (
                    <div key={index} className="camera-view">
                      <h5>📹 {camera.name || "Traffic Camera"}</h5>
                      <div className="camera-info">
                        <span>📍 {camera.location || "Unknown location"}</span>
                        {camera.active_users && (
                          <span>👥 {camera.active_users} users</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Auto-correction Toggle */}
            <div className="auto-correct-toggle">
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={autoCorrectEnabled}
                  onChange={(e) => setAutoCorrectEnabled(e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">Enable Auto-Correction</span>
              <span className="toggle-help" title="Automatically corrects misspelled locations">?</span>
            </div>
            
            {/* Manual Zoom Controls */}
            <div className="zoom-controls">
              <h4>🔍 Map Controls:</h4>
              <div className="zoom-buttons">
                <button 
                  className="zoom-btn"
                  onClick={zoomToLocations}
                  disabled={!selectedStart || !selectedEnd}
                  title="Zoom to Locations"
                >
                  📍 Zoom to Locations
                </button>
                <button 
                  className="zoom-btn"
                  onClick={zoomToRoute}
                  disabled={!selectedRoute}
                  title="Zoom to Route"
                >
                  🛣️ Zoom to Route
                </button>
                <button 
                  className="zoom-btn"
                  onClick={zoomToUserLocation}
                  disabled={!userLocation}
                  title="Zoom to My Location"
                >
                  👤 My Location
                </button>
              </div>
            </div>
            
            {/* Traffic Legend */}
            <div className="traffic-legend">
              <h4>🚦 Traffic Levels (Real Data):</h4>
              <div className="legend-items">
                <div className="legend-item">
                  <div className="legend-color" style={{background: '#f44336'}}></div>
                  <span>🔴 High Traffic (Click to update)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{background: '#ff9800'}}></div>
                  <span>🟡 Medium Traffic (Click to update)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{background: '#4CAF50'}}></div>
                  <span>🟢 Low Traffic (Click to update)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{background: '#9C27B0'}}></div>
                  <span>🤖 AI-Optimized Route</span>
                </div>
                <div className="legend-item">
                  <div className="legend-color" style={{background: '#FF5722'}}></div>
                  <span>✨ Enhanced Route</span>
                </div>
              </div>
              <div style={{ 
                fontSize: '11px', 
                color: '#666', 
                marginTop: '8px',
                fontStyle: 'italic'
              }}>
                Click traffic markers to contribute real-time data
              </div>
            </div>
            
            {/* From Location with Suggestions */}
            <div className="input-group">
              <label>From Location:</label>
              <div className="input-with-suggestions">
                <input 
                  ref={fromInputRef}
                  type="text" 
                  placeholder="e.g., Majestic Bus Station"
                  value={fromLocation}
                  onChange={(e) => {
                    setFromLocation(e.target.value);
                    setShowFromSuggestions(e.target.value.length > 1);
                  }}
                  onFocus={() => setShowFromSuggestions(fromLocation.length > 1)}
                  onBlur={() => setTimeout(() => setShowFromSuggestions(false), 200)}
                  onKeyPress={(e) => e.key === 'Enter' && handleFromLocation()}
                />
                <div className="input-buttons">
                  <button 
                    onClick={handleFromLocation}
                    disabled={isGeocoding}
                    className="geocode-btn"
                    title="Set Location"
                  >
                    {isGeocoding ? "⌛" : "📍"}
                  </button>
                  <button 
                    onClick={useCurrentLocationForStart}
                    className="current-location-btn"
                    title="Use Current Location"
                  >
                    📍
                  </button>
                </div>
                {showFromSuggestions && (
                  <PlaceSuggestions
                    input={fromLocation}
                    onSelect={handleFromSuggestionSelect}
                    isStart={true}
                    sampleLocations={sampleLocations}
                  />
                )}
              </div>
            </div>
            
            {/* To Location with Suggestions */}
            <div className="input-group">
              <label>To Location:</label>
              <div className="input-with-suggestions">
                <input 
                  ref={toInputRef}
                  type="text" 
                  placeholder="e.g., MG Road"
                  value={toLocation}
                  onChange={(e) => {
                    setToLocation(e.target.value);
                    setShowToSuggestions(e.target.value.length > 1);
                  }}
                  onFocus={() => setShowToSuggestions(toLocation.length > 1)}
                  onBlur={() => setTimeout(() => setShowToSuggestions(false), 200)}
                  onKeyPress={(e) => e.key === 'Enter' && handleToLocation()}
                />
                <div className="input-buttons">
                  <button 
                    onClick={handleToLocation}
                    disabled={isGeocoding}
                    className="geocode-btn"
                    title="Set Location"
                  >
                    {isGeocoding ? "⌛" : "📍"}
                  </button>
                  <button 
                    onClick={useCurrentLocationForEnd}
                    className="current-location-btn"
                    title="Use Current Location"
                  >
                    📍
                  </button>
                </div>
                {showToSuggestions && (
                  <PlaceSuggestions
                    input={toLocation}
                    onSelect={handleToSuggestionSelect}
                    isStart={false}
                    sampleLocations={sampleLocations}
                  />
                )}
              </div>
            </div>
            
            {/* Quick Locations */}
            <div className="quick-locations">
              <h4>🏙️ Quick Select (Bangalore):</h4>
              <div className="location-tags">
                {sampleLocations.map((loc, idx) => (
                  <button 
                    key={idx}
                    className="location-tag"
                    onClick={() => {
                      if (idx % 2 === 0) {
                        setFromLocation(loc.name);
                        setSelectedStart([loc.lat, loc.lng]);
                      } else {
                        setToLocation(loc.name);
                        setSelectedEnd([loc.lat, loc.lng]);
                      }
                      setRoutes([]);
                      setSelectedRoute(null);
                      
                      setTimeout(() => {
                        if (selectedStart && selectedEnd) {
                          autoZoomToLocations();
                        }
                      }, 100);
                    }}
                    title={loc.name}
                  >
                    {loc.name.split(",")[0]}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Find Route Button */}
            <button 
              className={`optimize-btn ${isLoading ? 'loading' : ''}`}
              onClick={findRoute}
              disabled={isLoading || !selectedStart || !selectedEnd}
            >
              {isLoading ? (
                <>
                  <span className="btn-spinner"></span>
                  Finding Route...
                </>
              ) : (
                <>
                  <span className="btn-icon">🤖</span>
                  Find AI-Optimized Route
                </>
              )}
            </button>
            
            {/* Auto Route Calculation Status */}
            {selectedStart && selectedEnd && (
              <div className="auto-route-status">
                <div className="auto-route-info">
                  <span className="status-icon">🔍</span>
                  <span className="status-text">
                    Auto-calculating route from {fromLocation?.split(',')[0] || 'Start'} to {toLocation?.split(',')[0] || 'End'}...
                  </span>
                </div>
                {routes.length > 0 && (
                  <div className="auto-route-success">
                    <span className="success-icon">✅</span>
                    <span className="success-text">
                      Found {routes.length} route(s). Select a route below.
                    </span>
                  </div>
                )}
              </div>
            )}
            
            {/* Messages */}
            {successMessage && (
              <div className="success-message">
                ✅ {successMessage}
              </div>
            )}
            
            {error && (
              <div className="error-message">
                ⚠️ {error}
              </div>
            )}
            
            {/* Route Recommendations */}
            {recommendations.length > 0 && (
              <div className="recommendations-section">
                <h4>💡 Smart Recommendations</h4>
                <div className="recommendations-list">
                  {recommendations.map((rec, index) => (
                    <div 
                      key={index}
                      className={`recommendation-card ${selectedRoute === rec.route ? 'active' : ''}`}
                      onClick={() => {
                        if (rec.route) {
                          setSelectedRoute(rec.route);
                          if (rec.route.bounds && rec.route.bounds[0] && rec.route.bounds[1]) {
                            setMapBounds(rec.route.bounds);
                            setShouldFitBounds(true);
                            
                            setTimeout(() => setShouldFitBounds(false), 2000);
                          }
                        }
                      }}
                    >
                      <div className="recommendation-icon">
                        {rec.icon}
                      </div>
                      <div className="recommendation-content">
                        <div className="recommendation-title">
                          {rec.title}
                        </div>
                        <div className="recommendation-description">
                          {rec.description}
                        </div>
                        {rec.route?.congestion_level && (
                          <div className="recommendation-tip">
                            🚦 {rec.route.congestion_level} congestion
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Route Selection Panel */}
            {routes.length > 0 && (
              <div className="route-selection">
                <h4>🛣️ Available Routes</h4>
                <div className="route-options">
                  {routes.map((route, index) => (
                    <div 
                      key={index}
                      className={`route-option ${selectedRoute === route ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedRoute(route);
                        if (route.bounds && route.bounds[0] && route.bounds[1]) {
                          setMapBounds(route.bounds);
                          setShouldFitBounds(true);
                          
                          setTimeout(() => setShouldFitBounds(false), 2000);
                        }
                      }}
                    >
                      <div className="route-header">
                        <span className="route-color-indicator" style={{
                          background: route.isFallback ? '#F44336' : 
                                     route.type === 'AI_OPTIMIZED' ? '#9C27B0' :
                                     route.type === 'ENHANCED_ROUTE' ? '#FF5722' :
                                     route.type === 'TIME_SAVER' ? '#43e97b' :
                                     route.type === 'DISTANCE_SAVER' ? '#38f9d7' :
                                     selectedRoute === route ? '#2196F3' : '#FF9800'
                        }}></span>
                        <span className="route-title">
                          {route.type === 'AI_OPTIMIZED' ? '🤖 AI-Optimized' : 
                           route.type === 'ENHANCED_ROUTE' ? '✨ Enhanced' : 
                           route.type.replace('_', ' ')} {index + 1}
                          {route.isFallback ? ' (Approximate)' : ''}
                        </span>
                      </div>
                      <div className="route-duration">
                        {Math.round(route.duration / 60)} min
                      </div>
                      <div className="route-distance">
                        {(route.distance / 1000).toFixed(2)} km
                      </div>
                      {route.congestion_level && (
                        <div className="route-congestion">
                          🚦 {route.congestion_level}
                        </div>
                      )}
                      {route.confidence && (
                        <div className="route-confidence">
                          Confidence: {(route.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Route Info */}
            {selectedRoute && (
              <div className="route-info-section">
                <h4>📋 Selected Route Details</h4>
                <div className="route-details">
                  <div className="route-stat">
                    <span className="stat-label">Distance:</span>
                    <span className="stat-value">{(selectedRoute.distance / 1000).toFixed(2)} km</span>
                  </div>
                  <div className="route-stat">
                    <span className="stat-label">Est. Time:</span>
                    <span className="stat-value">{Math.round(selectedRoute.duration / 60)} min</span>
                  </div>
                  <div className="route-stat">
                    <span className="stat-label">Route Type:</span>
                    <span className="stat-value">
                      {selectedRoute.type === 'AI_OPTIMIZED' ? '🤖 AI-Optimized' : 
                       selectedRoute.type === 'ENHANCED_ROUTE' ? '✨ Enhanced' : 
                       selectedRoute.type.replace('_', ' ')}
                    </span>
                  </div>
                  {selectedRoute.congestion_level && (
                    <div className="route-stat">
                      <span className="stat-label">Congestion:</span>
                      <span className="stat-value" style={{
                        color: selectedRoute.congestion_level === 'low' ? '#4CAF50' : 
                               selectedRoute.congestion_level === 'medium' ? '#FF9800' : '#F44336'
                      }}>
                        {selectedRoute.congestion_level.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {selectedRoute.confidence && (
                    <div className="route-stat">
                      <span className="stat-label">Confidence:</span>
                      <span className="stat-value" style={{
                        color: selectedRoute.confidence >= 0.8 ? '#4CAF50' : 
                               selectedRoute.confidence >= 0.5 ? '#FF9800' : '#F44336'
                      }}>
                        {(selectedRoute.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Navigation Controls */}
                <div className="route-actions">
                  <button 
                    className={`nav-start-btn ${isNavigating ? 'active' : ''}`}
                    onClick={isNavigating ? stopNavigation : startNavigation}
                  >
                    <span className="btn-icon">{isNavigating ? '⏹️' : '🚀'}</span>
                    {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
                  </button>
                </div>
                
                {isNavigating && (
                  <div className="navigation-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{width: `${navProgress}%`}}
                      ></div>
                    </div>
                    <div className="progress-stats">
                      <span>{navProgress}% complete</span>
                      <span>
                        {Math.round((100 - navProgress) / 100 * selectedRoute.duration / 60)} min remaining
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Map Area */}
        <div className="map-main">
          {/* Map Controls */}
          <div className="map-controls">
            <div className="map-mode-toggle">
              <button 
                className={`mode-btn ${mapMode === "light" ? "active" : ""}`}
                onClick={() => setMapMode("light")}
                title="Light Map"
              >
                🌞 Light
              </button>
              <button 
                className={`mode-btn ${mapMode === "dark" ? "active" : ""}`}
                onClick={() => setMapMode("dark")}
                title="Dark Map"
              >
                🌙 Dark
              </button>
              <button 
                className={`mode-btn ${mapMode === "satellite" ? "active" : ""}`}
                onClick={() => setMapMode("satellite")}
                title="Satellite View"
              >
                🛰️ Satellite
              </button>
            </div>
            
            <div className="map-legend">
              <div className="legend-item">
                <div className="legend-color" style={{background: '#9C27B0'}}></div>
                <span>AI-Optimized Route</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{background: '#FF5722'}}></div>
                <span>Enhanced Route</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{background: '#2196F3'}}></div>
                <span>Selected Route</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{background: '#43e97b'}}></div>
                <span>Time Saver</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{background: '#38f9d7'}}></div>
                <span>Distance Saver</span>
              </div>
            </div>
          </div>

          {/* The Map */}
          <div className="map-container">
            <MapContainer 
              ref={mapRef}
              center={getInitialCenter()}
              zoom={getInitialZoom()}
              style={{ height: "100%", width: "100%" }}
              zoomControl={true}
              scrollWheelZoom={true}
            >
              {/* Base Map Layer */}
              {mapMode === "light" && (
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
              )}
              
              {mapMode === "dark" && (
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
              )}
              
              {mapMode === "satellite" && (
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                />
              )}
              
              {/* User Location Tracker */}
              <UserLocationTracker 
                onLocationUpdate={(location) => {
                  setUserLocation(location);
                }}
                onTrafficReport={handleUserTrafficReport}
              />
              
              {/* RENDER REAL TRAFFIC MARKERS */}
              {renderTrafficMarkers()}
              
              {/* RENDER ALL ROUTES */}
              {renderRoutes()}
              
              {/* Start Marker */}
              {renderStartMarker()}
              
              {/* End Marker */}
              {renderEndMarker()}
              
              {/* Navigation Progress Marker */}
              {isNavigating && selectedRoute && (
                <NavigationProgressMarker 
                  route={selectedRoute}
                  progress={navProgress}
                />
              )}
              
              {/* Auto-zoom Navigator */}
              <MapNavigator 
                bounds={getAllPointsForBounds()}
                position={null}
                fitBounds={shouldFitBounds && mapBounds !== null}
              />
            </MapContainer>
          </div>
          
          {/* Map Overlay Info */}
          <div className="map-overlay-info">
            {selectedRoute && (
              <div className="overlay-card route-overlay">
                <h5>{selectedRoute.type === 'AI_OPTIMIZED' ? '🤖 AI Route' : 
                     selectedRoute.type === 'ENHANCED_ROUTE' ? '✨ Enhanced Route' : 'Active Route'}</h5>
                <div className="overlay-stats">
                  <span>Distance: {(selectedRoute.distance / 1000).toFixed(1)} km</span>
                  <span>Time: {Math.round(selectedRoute.duration / 60)} min</span>
                  {selectedRoute.congestion_level && (
                    <span>Congestion: {selectedRoute.congestion_level}</span>
                  )}
                  {isNavigating && <span>Progress: {navProgress}%</span>}
                </div>
              </div>
            )}
            
            {trafficData.length > 0 && (
              <div className="overlay-card traffic-overlay">
                <h5>🚦 Live Traffic Data</h5>
                <div className="overlay-stats">
                  <span>{trafficData.length} monitoring points</span>
                  <span>{trafficStats.congested_points} congested areas</span>
                  <span>Click markers to update</span>
                </div>
              </div>
            )}
            
            {trafficData.length === 0 && (
              <div className="overlay-card no-data-overlay">
                <h5>📡 No Traffic Data Yet</h5>
                <div className="overlay-stats">
                  <span>Be the first contributor!</span>
                  <span>Move around to report traffic</span>
                </div>
              </div>
            )}
            
            {userLocation && (
              <div className="overlay-card user-overlay">
                <h5>📍 Your Location</h5>
                <div className="overlay-stats">
                  <span>Reporting traffic data</span>
                  <span>Lat: {userLocation[0].toFixed(6)}</span>
                </div>
              </div>
            )}
            
            {recommendations.length > 0 && (
              <div className="overlay-card recommendation-overlay">
                <h5>💡 Top Recommendation</h5>
                <div className="overlay-stats">
                  <span>{recommendations[0].title}</span>
                  <span>{recommendations[0].description}</span>
                </div>
              </div>
            )}
            
            {availableCameras.length > 0 && (
              <div className="overlay-card cameras-overlay">
                <h5>📹 Traffic Cameras</h5>
                <div className="overlay-stats">
                  <span>{availableCameras.length} cameras online</span>
                  <span>Real-time monitoring</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        .traffic-map-container {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #f8f9fa;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
        
        .map-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 30px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          z-index: 1000;
        }
        
        .header-content h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
        }
        
        .header-content p {
          margin: 5px 0 0 0;
          opacity: 0.9;
          font-size: 14px;
        }
        
        .backend-status-bar {
          background: rgba(255, 255, 255, 0.1);
          padding: 10px 15px;
          border-radius: 8px;
          margin-top: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        
        .backend-status {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        
        .status-text {
          font-size: 14px;
          font-weight: 500;
        }
        
        .backend-stats {
          display: flex;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
        }
        
        .stat-item {
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .refresh-btn {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.3s;
        }
        
        .refresh-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }
        
        .refresh-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .map-layout {
          display: flex;
          flex: 1;
          overflow: hidden;
        }
        
        .map-sidebar {
          width: 400px;
          background: white;
          border-right: 1px solid #dee2e6;
          padding: 20px;
          overflow-y: auto;
          box-shadow: 2px 0 15px rgba(0,0,0,0.05);
        }
        
        .sidebar-section h3 {
          margin-top: 0;
          color: #333;
          border-bottom: 3px solid #667eea;
          padding-bottom: 10px;
          margin-bottom: 20px;
          font-size: 20px;
        }
        
        .sidebar-subtitle {
          color: #666;
          font-size: 14px;
          margin-top: -15px;
          margin-bottom: 20px;
        }
        
        .system-info-panel {
          margin-bottom: 20px;
          padding: 15px;
          background: linear-gradient(135deg, #2196F3 0%, #0D47A1 100%);
          border-radius: 10px;
          color: white;
        }
        
        .system-info-panel h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: white;
          font-size: 16px;
        }
        
        .system-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        
        .system-stat {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        
        .system-stat .stat-icon {
          font-size: 20px;
        }
        
        .system-stat .stat-content {
          flex: 1;
        }
        
        .system-stat .stat-value {
          font-size: 14px;
          font-weight: bold;
        }
        
        .system-stat .stat-label {
          font-size: 11px;
          opacity: 0.9;
        }
        
        .traffic-stats-panel {
          margin-bottom: 20px;
          padding: 15px;
          background: linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%);
          border-radius: 10px;
          color: white;
        }
        
        .no-data-panel {
          margin-bottom: 20px;
          padding: 15px;
          background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
          border-radius: 10px;
          color: white;
        }
        
        .traffic-stats-panel h4,
        .no-data-panel h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: white;
          font-size: 16px;
        }
        
        .traffic-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        
        .traffic-stat {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          backdrop-filter: blur(10px);
        }
        
        .stat-icon {
          font-size: 20px;
        }
        
        .stat-content {
          flex: 1;
        }
        
        .stat-value {
          font-size: 18px;
          font-weight: bold;
        }
        
        .stat-label {
          font-size: 12px;
          opacity: 0.9;
        }
        
        .cameras-section {
          margin-bottom: 20px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }
        
        .cameras-section h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
          font-size: 15px;
        }
        
        .cameras-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .camera-view {
          padding: 12px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }
        
        .camera-view h5 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #333;
        }
        
        .camera-image {
          width: 100%;
          height: 150px;
          background: #f5f5f5;
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        
        .camera-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .camera-loading,
        .camera-offline {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #666;
          font-size: 14px;
        }
        
        .camera-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
        }
        
        .auto-correct-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }
        
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 24px;
        }
        
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 24px;
        }
        
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        
        input:checked + .toggle-slider {
          background-color: #4CAF50;
        }
        
        input:checked + .toggle-slider:before {
          transform: translateX(26px);
        }
        
        .toggle-label {
          font-size: 14px;
          font-weight: 500;
          color: #555;
        }
        
        .toggle-help {
          margin-left: auto;
          width: 20px;
          height: 20px;
          background: #667eea;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          cursor: help;
        }
        
        .auto-route-status {
          margin: 15px 0;
          padding: 15px;
          background: linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%);
          border-radius: 10px;
          border: 2px solid #2196F330;
        }
        
        .auto-route-info {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        
        .status-icon {
          font-size: 20px;
          color: #2196F3;
        }
        
        .status-text {
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }
        
        .auto-route-success {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          background: rgba(76, 175, 80, 0.1);
          border-radius: 8px;
          border: 1px solid #4CAF50;
        }
        
        .success-icon {
          font-size: 20px;
          color: #4CAF50;
        }
        
        .success-text {
          font-size: 14px;
          color: #2E7D32;
          font-weight: 500;
        }
        
        .zoom-controls {
          margin-bottom: 20px;
          padding: 15px;
          background: linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%);
          border-radius: 10px;
          border: 2px solid #2196F330;
        }
        
        .zoom-controls h4 {
          margin-top: 0;
          margin-bottom: 12px;
          color: #333;
          font-size: 15px;
        }
        
        .zoom-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .zoom-btn {
          padding: 10px 15px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.3s;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .zoom-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
          background: #1976D2;
        }
        
        .zoom-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: #BDBDBD;
        }
        
        .traffic-legend {
          margin-bottom: 20px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }
        
        .traffic-legend h4 {
          margin-top: 0;
          margin-bottom: 10px;
          color: #333;
          font-size: 15px;
        }
        
        .legend-items {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
        }
        
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          border: 1px solid rgba(0,0,0,0.1);
        }
        
        .input-group {
          margin-bottom: 20px;
          position: relative;
        }
        
        .input-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #555;
          font-size: 14px;
        }
        
        .input-with-suggestions {
          position: relative;
        }
        
        .input-with-suggestions input {
          width: 100%;
          padding: 12px 15px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.3s;
          box-sizing: border-box;
        }
        
        .input-with-suggestions input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .input-buttons {
          position: absolute;
          right: 0;
          top: 0;
          display: flex;
          gap: 4px;
          padding: 2px;
        }
        
        .geocode-btn, .current-location-btn {
          padding: 12px 15px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.3s;
          min-width: 44px;
        }
        
        .current-location-btn {
          background: #4CAF50;
        }
        
        .geocode-btn:hover:not(:disabled),
        .current-location-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .geocode-btn:disabled,
        .current-location-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .place-suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          margin-top: 4px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          z-index: 1000;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .suggestions-header {
          padding: 12px 15px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }
        
        .suggestions-list {
          padding: 8px 0;
        }
        
        .suggestion-item {
          display: flex;
          align-items: center;
          padding: 12px 15px;
          cursor: pointer;
          transition: all 0.2s;
          border-bottom: 1px solid #f5f5f5;
        }
        
        .suggestion-item:hover {
          background: #f0f7ff;
        }
        
        .suggestion-item:last-child {
          border-bottom: none;
        }
        
        .suggestion-icon {
          font-size: 20px;
          margin-right: 12px;
          width: 24px;
          text-align: center;
        }
        
        .suggestion-details {
          flex: 1;
        }
        
        .suggestion-name {
          font-weight: 500;
          color: #333;
          margin-bottom: 2px;
        }
        
        .suggestion-address {
          font-size: 12px;
          color: #666;
        }
        
        .suggestion-action {
          font-size: 12px;
          color: #667eea;
          font-weight: 500;
          padding: 4px 8px;
          background: rgba(102, 126, 234, 0.1);
          border-radius: 4px;
        }
        
        .suggestions-loading {
          padding: 15px;
          text-align: center;
          color: #666;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e0e0e0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        .quick-locations {
          margin: 25px 0;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .quick-locations h4 {
          margin-bottom: 12px;
          font-size: 15px;
          color: #555;
        }
        
        .location-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .location-tag {
          padding: 8px 15px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s;
          color: #555;
        }
        
        .location-tag:hover {
          background: #667eea;
          color: white;
          border-color: #667eea;
          transform: translateY(-2px);
        }
        
        .optimize-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #9C27B0 0%, #673AB7 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          margin: 25px 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          transition: all 0.3s;
        }
        
        .optimize-btn:hover:not(:disabled) {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(156, 39, 176, 0.3);
        }
        
        .optimize-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .optimize-btn.loading {
          background: linear-gradient(135deg, #cccccc 0%, #999999 100%);
        }
        
        .btn-spinner {
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .btn-icon {
          font-size: 18px;
        }
        
        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          font-size: 14px;
          border-left: 4px solid #c62828;
        }
        
        .success-message {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 15px;
          border-radius: 8px;
          margin: 15px 0;
          font-size: 14px;
          border-left: 4px solid #2e7d32;
        }
        
        .recommendations-section {
          margin: 20px 0;
          padding: 15px;
          background: linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%);
          border-radius: 12px;
          border: 2px solid #2196F320;
        }
        
        .recommendations-section h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
          font-size: 16px;
        }
        
        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .recommendation-card {
          padding: 15px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .recommendation-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-color: #2196F3;
        }
        
        .recommendation-card.active {
          border-color: #2196F3;
          background: rgba(33, 150, 243, 0.05);
          box-shadow: 0 4px 12px rgba(33, 150, 243, 0.2);
        }
        
        .recommendation-card:not(.active):hover {
          background: rgba(33, 150, 243, 0.02);
        }
        
        .recommendation-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        
        .recommendation-content {
          flex: 1;
        }
        
        .recommendation-title {
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
          font-size: 14px;
        }
        
        .recommendation-description {
          font-size: 13px;
          color: #666;
          margin-bottom: 5px;
        }
        
        .recommendation-tip {
          font-size: 12px;
          color: #FF9800;
          background: rgba(255, 152, 0, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
          margin-top: 5px;
        }
        
        .route-selection {
          margin: 20px 0;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .route-selection h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
          font-size: 16px;
        }
        
        .route-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .route-option {
          padding: 15px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .route-option:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-color: #667eea;
        }
        
        .route-option.selected {
          border-color: #667eea;
          background: rgba(102, 126, 234, 0.05);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }
        
        .route-header {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }
        
        .route-color-indicator {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          margin-right: 10px;
        }
        
        .route-title {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }
        
        .route-duration {
          font-size: 18px;
          font-weight: bold;
          color: #333;
          margin: 5px 0;
        }
        
        .route-distance {
          font-size: 14px;
          color: #666;
        }
        
        .route-congestion {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .route-confidence {
          font-size: 12px;
          color: #888;
          margin-top: 5px;
        }
        
        .route-info-section {
          background: linear-gradient(135deg, #667eea10 0%, #764ba210 100%);
          padding: 20px;
          border-radius: 12px;
          margin-top: 25px;
          border: 2px solid #667eea30;
        }
        
        .route-info-section h4 {
          margin-top: 0;
          color: #333;
          font-size: 18px;
          margin-bottom: 20px;
        }
        
        .route-details {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 20px 0;
        }
        
        .route-stat {
          display: flex;
          flex-direction: column;
          padding: 12px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }
        
        .route-stat .stat-label {
          font-size: 12px;
          color: #777;
          margin-bottom: 5px;
        }
        
        .route-stat .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: #333;
        }
        
        .route-actions {
          margin-top: 20px;
        }
        
        .nav-start-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: all 0.3s;
        }
        
        .nav-start-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(67, 233, 123, 0.3);
        }
        
        .nav-start-btn.active {
          background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
        }
        
        .navigation-progress {
          margin-top: 20px;
        }
        
        .progress-bar {
          height: 10px;
          background: #e0e0e0;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #43e97b, #38f9d7);
          transition: width 0.5s ease;
          border-radius: 5px;
        }
        
        .progress-stats {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #666;
        }
        
        .map-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        
        .map-controls {
          padding: 15px 20px;
          background: white;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
          z-index: 800;
        }
        
        .map-mode-toggle {
          display: flex;
          gap: 8px;
          background: #f8f9fa;
          padding: 6px;
          border-radius: 10px;
        }
        
        .mode-btn {
          padding: 8px 16px;
          background: transparent;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.3s;
          color: #555;
        }
        
        .mode-btn:hover {
          background: rgba(0,0,0,0.05);
        }
        
        .mode-btn.active {
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-weight: 600;
          color: #667eea;
        }
        
        .map-legend {
          display: flex;
          gap: 15px;
          align-items: center;
          flex-wrap: wrap;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #555;
        }
        
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          border: 1px solid rgba(0,0,0,0.1);
        }
        
        .map-container {
          flex: 1;
          position: relative;
          min-height: 0;
        }
        
        .map-overlay-info {
          position: absolute;
          bottom: 20px;
          left: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 250px;
        }
        
        .overlay-card {
          background: rgba(255, 255, 255, 0.95);
          padding: 15px;
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          border: 1px solid rgba(0,0,0,0.1);
          backdrop-filter: blur(10px);
        }
        
        .overlay-card h5 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 14px;
          font-weight: 600;
        }
        
        .overlay-stats {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
        }
        
        .overlay-stats span {
          display: flex;
          justify-content: space-between;
          color: #555;
        }
        
        .route-overlay {
          background: rgba(156, 39, 176, 0.95);
          color: white;
        }
        
        .route-overlay h5,
        .route-overlay span {
          color: white;
        }
        
        .traffic-overlay {
          background: rgba(76, 175, 80, 0.95);
          color: white;
        }
        
        .traffic-overlay h5,
        .traffic-overlay span {
          color: white;
        }
        
        .no-data-overlay {
          background: rgba(255, 152, 0, 0.95);
          color: white;
        }
        
        .no-data-overlay h5,
        .no-data-overlay span {
          color: white;
        }
        
        .user-overlay {
          background: rgba(33, 150, 243, 0.95);
          color: white;
        }
        
        .user-overlay h5,
        .user-overlay span {
          color: white;
        }
        
        .recommendation-overlay {
          background: rgba(255, 193, 7, 0.95);
          color: white;
        }
        
        .recommendation-overlay h5,
        .recommendation-overlay span {
          color: white;
        }
        
        .cameras-overlay {
          background: rgba(0, 150, 136, 0.95);
          color: white;
        }
        
        .cameras-overlay h5,
        .cameras-overlay span {
          color: white;
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        
        @media (max-width: 1200px) {
          .map-sidebar {
            width: 350px;
          }
        }
        
        @media (max-width: 992px) {
          .map-layout {
            flex-direction: column;
          }
          
          .map-sidebar {
            width: 100%;
            max-height: 450px;
            border-right: none;
            border-bottom: 1px solid #dee2e6;
          }
          
          .map-overlay-info {
            left: 10px;
            right: 10px;
            min-width: auto;
          }
          
          .backend-stats {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        
        @media (max-width: 768px) {
          .map-controls {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          
          .map-legend {
            gap: 10px;
          }
          
          .location-tags {
            overflow-x: auto;
            flex-wrap: nowrap;
            padding-bottom: 5px;
          }
          
          .zoom-buttons {
            flex-direction: row;
            flex-wrap: wrap;
          }
          
          .zoom-btn {
            flex: 1;
            min-width: 120px;
            justify-content: center;
          }
          
          .traffic-stats-grid {
            grid-template-columns: 1fr;
          }
          
          .system-stats {
            grid-template-columns: 1fr;
          }
          
          .route-details {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default TrafficMap;