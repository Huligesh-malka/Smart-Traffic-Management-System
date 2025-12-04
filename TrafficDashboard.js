import React, { useEffect, useState, useCallback } from "react";
import "./TrafficDashboard.css";

function TrafficDashboard() {
  const [trafficData, setTrafficData] = useState({
    lane_1: {},
    lane_2: {},
    lane_3: {},
    ambulance_detected: false,
    timestamp: "",
  });

  const [recommendedLane, setRecommendedLane] = useState("");
  const [signalState, setSignalState] = useState({
    lane_1: "red",
    lane_2: "red",
    lane_3: "red",
  });

  /* -------------------------------------------
        🔊 VOICE ASSISTANT (TTS)
  ---------------------------------------------*/
  const speak = useCallback((text) => {
    const s = new SpeechSynthesisUtterance(text);
    s.lang = "en-IN";
    s.rate = 1;
    window.speechSynthesis.speak(s);
  }, []);

  /* -------------------------------------------
        🔴 Traffic Density → Total Vehicles
  ---------------------------------------------*/
  const getTotal = useCallback(
    (lane) => {
      return Object.values(trafficData[lane] || {}).reduce((a, b) => a + b, 0);
    },
    [trafficData]
  );

  /* -------------------------------------------
        🔴 Traffic Density → Auto Signal Control
  ---------------------------------------------*/
  const updateSignals = useCallback(() => {
    const l1 = getTotal("lane_1");
    const l2 = getTotal("lane_2");
    const l3 = getTotal("lane_3");

    let minLane = "lane_1";
    let minValue = l1;

    if (l2 < minValue) {
      minLane = "lane_2";
      minValue = l2;
    }
    if (l3 < minValue) {
      minLane = "lane_3";
      minValue = l3;
    }

    setSignalState({
      lane_1: minLane === "lane_1" ? "green" : "red",
      lane_2: minLane === "lane_2" ? "green" : "red",
      lane_3: minLane === "lane_3" ? "green" : "red",
    });
  }, [getTotal]);

  /* -------------------------------------------
        🟡 Fetch Recommended Lane (from API)
  ---------------------------------------------*/
  const fetchRecommendation = useCallback(async () => {
    const res = await fetch("http://localhost:8000/recommend_route");
    const data = await res.json();
    setRecommendedLane(data.recommended_lane);

    if (data.recommended_lane) {
      speak(`Recommended lane is ${data.recommended_lane.replace("_", " ")}`);
    }
  }, [speak]);

  /* -------------------------------------------
        🟢 WebSocket Live Traffic Stream
  ---------------------------------------------*/
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/traffic");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTrafficData(data);
    };

    fetchRecommendation();

    return () => {
      ws.close();
    };
  }, [fetchRecommendation]);

  /* -------------------------------------------
        Auto-update signals whenever data changes
  ---------------------------------------------*/
  useEffect(() => {
    updateSignals();
  }, [trafficData, updateSignals]);

  /* -------------------------------------------
        🗺 LIVE MAP
  ---------------------------------------------*/
  const MapEmbed = useCallback(() => (
    <iframe
      title="map"
      width="100%"
      height="300"
      style={{ borderRadius: "12px", border: "2px solid #444" }}
      src="https://www.google.com/maps/embed?pb=!1m18!1"/>
  ), []);

  /* -------------------------------------------
        UI Rendering
  ---------------------------------------------*/
  return (
    <div className="dash-container">
      <h1>🚦 Smart Traffic Dashboard</h1>

      <MapEmbed />

      {trafficData.ambulance_detected && (
        <div className="alert">
          🚑 Ambulance detected — Clear the road!
        </div>
      )}

      {recommendedLane && (
        <div className="recommend">
          ✅ Recommended:{" "}
          <b>{recommendedLane.replace("_", " ").toUpperCase()}</b>
        </div>
      )}

      <div className="lanes-wrapper">
        {["lane_1", "lane_2", "lane_3"].map((lane) => (
          <div key={lane} className={`lane-card ${signalState[lane]}`}>
            <h2>{lane.replace("_", " ").toUpperCase()}</h2>

            <p className="signal-light">
              {signalState[lane] === "green" ? "🟢 Go" : "🔴 Stop"}
            </p>

            <div className="vehicle-count">
              {Object.entries(trafficData[lane] || {}).map(([vehicle, count]) => (
                <p key={vehicle}>
                  {vehicle}: {count}
                </p>
              ))}
            </div>

            {lane === recommendedLane && (
              <div className="arrow">⬅ Use this lane</div>
            )}
          </div>
        ))}
      </div>

      <button onClick={fetchRecommendation} className="refresh-btn">
        🔄 Refresh Recommendation
      </button>
    </div>
  );
}

export default TrafficDashboard;
