// App.js - Updated with Multi-User Support
import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import TrafficMap from "./TrafficMap";
import TrafficDashboard from "./TrafficDashboard";
import CameraFeed from "./CameraFeed";
import "./App.css";

function App() {
  const [userId, setUserId] = useState(localStorage.getItem("traffic_user_id") || "");
  const [activeUsers, setActiveUsers] = useState(0);
  const [collectiveData, setCollectiveData] = useState(null);

  // Generate or load user ID
  useEffect(() => {
    if (!userId) {
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setUserId(newUserId);
      localStorage.setItem("traffic_user_id", newUserId);
    }

    // Fetch active users and collective data
    const fetchData = async () => {
      try {
        const usersRes = await fetch('http://localhost:8000/active_users');
        const usersData = await usersRes.json();
        setActiveUsers(usersData.count || 0);

        const trafficRes = await fetch('http://localhost:8000/collective_traffic');
        const trafficData = await trafficRes.json();
        setCollectiveData(trafficData);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [userId]);

  return (
    <Router>
      <div className="app-container">
        {/* Header */}
        <div className="app-header">
          <div className="header-content">
            <div className="logo-section">
              <h1>🚦 Smart Traffic AI</h1>
              <p className="tagline">Multi-User Real-Time Traffic Management System</p>
            </div>
            
            <div className="user-info">
              <div className="user-stats">
                <div className="stat-item">
                  <span className="stat-icon">👤</span>
                  <span className="stat-text">User: {userId ? userId.substring(0, 8) + "..." : "Loading..."}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">👥</span>
                  <span className="stat-text">Active: {activeUsers}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">⚡</span>
                  <span className="stat-text">
                    Confidence: {collectiveData?.confidence_score ? 
                      `${(collectiveData.confidence_score * 100).toFixed(0)}%` : "Loading..."
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="app-nav">
            <Link to="/" className="nav-link">
              <span className="nav-icon">📹</span>
              Live Camera
            </Link>
            <Link to="/dashboard" className="nav-link">
              <span className="nav-icon">📊</span>
              Dashboard
            </Link>
            <Link to="/map" className="nav-link">
              <span className="nav-icon">🗺️</span>
              Traffic Map
            </Link>
          </nav>
        </div>

        {/* Main Content */}
        <main className="app-main">
          <Routes>
            <Route path="/" element={<CameraFeed userId={userId} />} />
            <Route path="/dashboard" element={<TrafficDashboard userId={userId} />} />
            <Route path="/map" element={<TrafficMap userId={userId} />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-section">
              <h4>🚦 Smart Traffic AI</h4>
              <p>Real-time multi-user traffic optimization system</p>
              <p>Powered by YOLO AI & Collective Intelligence</p>
            </div>
            
            <div className="footer-section">
              <h4>System Status</h4>
              <div className="status-item">
                <span className="status-indicator active"></span>
                <span>Backend: Operational</span>
              </div>
              <div className="status-item">
                <span className="status-indicator active"></span>
                <span>AI Detection: Running</span>
              </div>
              <div className="status-item">
                <span className="status-indicator active"></span>
                <span>Multi-User: {activeUsers} Active</span>
              </div>
            </div>
            
            <div className="footer-section">
              <h4>Collective Intelligence</h4>
              <p>More users = Better accuracy!</p>
              <p>Current confidence: {collectiveData?.confidence_score ? 
                `${(collectiveData.confidence_score * 100).toFixed(1)}%` : "Calculating..."
              }</p>
              <p className="encourage-text">
                {activeUsers < 3 ? "👥 Invite more users to improve accuracy!" : 
                 activeUsers < 10 ? "👍 Good collective data!" : 
                 "🎉 Excellent collective intelligence!"}
              </p>
            </div>
          </div>
          
          <div className="footer-bottom">
            <p>© 2024 Smart Traffic AI System | Multi-User Collective Intelligence Platform</p>
          </div>
        </footer>

        <style jsx>{`
          .app-container {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          }
          
          .app-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          
          .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
          }
          
          .logo-section h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
          }
          
          .tagline {
            margin: 5px 0 0 0;
            opacity: 0.9;
            font-size: 14px;
          }
          
          .user-info {
            background: rgba(255, 255, 255, 0.1);
            padding: 10px 20px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          
          .user-stats {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
          }
          
          .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .stat-icon {
            font-size: 20px;
          }
          
          .stat-text {
            font-size: 14px;
          }
          
          .app-nav {
            display: flex;
            gap: 10px;
            margin-top: 20px;
            padding: 10px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .nav-link {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            text-decoration: none;
            border-radius: 8px;
            transition: all 0.3s ease;
          }
          
          .nav-link:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
          }
          
          .nav-icon {
            font-size: 20px;
          }
          
          .app-main {
            flex: 1;
            padding: 20px;
            max-width: 1400px;
            width: 100%;
            margin: 0 auto;
          }
          
          .app-footer {
            background: #2c3e50;
            color: white;
            padding: 30px;
            margin-top: auto;
          }
          
          .footer-content {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 30px;
            margin-bottom: 20px;
          }
          
          .footer-section h4 {
            margin-top: 0;
            color: #3498db;
            font-size: 18px;
          }
          
          .footer-section p {
            margin: 8px 0;
            opacity: 0.9;
            font-size: 14px;
          }
          
          .status-item {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 10px 0;
          }
          
          .status-indicator {
            width: 10px;
            height: 10px;
            background: #2ecc71;
            border-radius: 50%;
            animation: pulse 2s infinite;
          }
          
          .status-indicator.active {
            background: #2ecc71;
          }
          
          .encourage-text {
            color: #f1c40f;
            font-weight: bold;
          }
          
          .footer-bottom {
            text-align: center;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            opacity: 0.7;
            font-size: 14px;
          }
          
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          
          @media (max-width: 768px) {
            .header-content {
              flex-direction: column;
              align-items: flex-start;
            }
            
            .user-info {
              margin-top: 15px;
            }
            
            .app-nav {
              flex-direction: column;
            }
            
            .footer-content {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    </Router>
  );
}

export default App;