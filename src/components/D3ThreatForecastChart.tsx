import React, { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { CloudNode } from "../types";
import { TrendingUp, AlertTriangle, ShieldAlert, Cpu, Clock, Zap, Target, Activity, Compass } from "lucide-react";

interface D3ThreatForecastChartProps {
  nodes: CloudNode[];
  selectedNodeId: string;
  underAttackNodeId?: string;
}

export interface ForecastPoint {
  timeLabel: string;
  timestamp: Date;
  isHistorical: boolean;
  actualProbability: number | null; // null for future
  predictedProbability: number;
  lowerBound: number;
  upperBound: number;
  riskLevel: "Low" | "Elevated" | "Severe" | "Critical";
  primaryThreatDriver: string;
}

export function D3ThreatForecastChart({
  nodes,
  selectedNodeId,
  underAttackNodeId
}: D3ThreatForecastChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 280 });
  const [horizon, setHorizon] = useState<"1h" | "6h" | "24h" | "7d">("6h");
  const [modelSensitivity, setModelSensitivity] = useState<"standard" | "stress" | "exploit">("standard");
  const [hoveredPoint, setHoveredPoint] = useState<ForecastPoint | null>(null);
  const [pointerX, setPointerX] = useState<number | null>(null);

  // Derive network state factors
  const networkMetrics = useMemo(() => {
    const totalNodes = nodes.length || 1;
    const compromisedCount = nodes.filter(n => n.status === "compromised").length;
    const suspiciousCount = nodes.filter(n => n.status === "suspicious").length;
    const totalLogs = nodes.reduce((acc, n) => acc + n.logs.length, 0);
    const isUnderAttack = !!underAttackNodeId || compromisedCount > 0;

    const baseRiskRatio = (compromisedCount * 35 + suspiciousCount * 15) / totalNodes;
    const logActivityRatio = Math.min(30, totalLogs * 2.5);

    return {
      baseRiskRatio,
      logActivityRatio,
      isUnderAttack,
      compromisedCount,
      suspiciousCount,
      totalLogs
    };
  }, [nodes, underAttackNodeId]);

  // Generate combined Historical + Forecast Dataset
  const forecastData = useMemo(() => {
    const points: ForecastPoint[] = [];
    const now = new Date();

    // Configuration according to time horizon
    let historySteps = 10;
    let forecastSteps = 12;
    let stepMinutes = 5;

    if (horizon === "1h") {
      historySteps = 8;
      forecastSteps = 12;
      stepMinutes = 5;
    } else if (horizon === "6h") {
      historySteps = 10;
      forecastSteps = 12;
      stepMinutes = 30;
    } else if (horizon === "24h") {
      historySteps = 8;
      forecastSteps = 12;
      stepMinutes = 120;
    } else if (horizon === "7d") {
      historySteps = 7;
      forecastSteps = 14;
      stepMinutes = 720;
    }

    // Sensitivity multiplier
    let sensitivityMultiplier = 1.0;
    if (modelSensitivity === "stress") sensitivityMultiplier = 1.35;
    if (modelSensitivity === "exploit") sensitivityMultiplier = 1.65;

    // 1. Generate Historical Points (past steps)
    for (let i = historySteps; i >= 1; i--) {
      const pastTime = new Date(now.getTime() - i * stepMinutes * 60 * 1000);
      const randomNoise = (Math.sin(i * 1.5) * 6) + (Math.cos(i * 0.8) * 4);
      let baseVal = 18 + networkMetrics.baseRiskRatio + randomNoise;
      if (networkMetrics.isUnderAttack && i <= 3) {
        baseVal += 25 + (3 - i) * 8;
      }
      const actualProb = Math.min(98, Math.max(8, Math.round(baseVal)));

      points.push({
        timeLabel: d3.timeFormat(stepMinutes >= 120 ? "%b %d %H:%M" : "%H:%M")(pastTime),
        timestamp: pastTime,
        isHistorical: true,
        actualProbability: actualProb,
        predictedProbability: actualProb,
        lowerBound: Math.max(5, actualProb - 4),
        upperBound: Math.min(100, actualProb + 4),
        riskLevel: actualProb >= 75 ? "Critical" : actualProb >= 50 ? "Severe" : actualProb >= 30 ? "Elevated" : "Low",
        primaryThreatDriver: "Observed Trace Log Patterns"
      });
    }

    // Current Now Point
    const currentProb = Math.min(99, Math.max(12, Math.round(
      22 + networkMetrics.baseRiskRatio + networkMetrics.logActivityRatio * 0.8 + (networkMetrics.isUnderAttack ? 32 : 0)
    )));

    points.push({
      timeLabel: "NOW",
      timestamp: now,
      isHistorical: true,
      actualProbability: currentProb,
      predictedProbability: currentProb,
      lowerBound: Math.max(8, currentProb - 3),
      upperBound: Math.min(100, currentProb + 3),
      riskLevel: currentProb >= 75 ? "Critical" : currentProb >= 50 ? "Severe" : currentProb >= 30 ? "Elevated" : "Low",
      primaryThreatDriver: networkMetrics.isUnderAttack ? "Live Exploitation Stream" : "Baseline Telemetry"
    });

    // 2. Generate Forecast Points (future steps)
    let currentTrend = networkMetrics.isUnderAttack ? 4.2 : networkMetrics.suspiciousCount > 0 ? 1.8 : -0.8;
    currentTrend *= sensitivityMultiplier;

    for (let j = 1; j <= forecastSteps; j++) {
      const futureTime = new Date(now.getTime() + j * stepMinutes * 60 * 1000);
      const dampening = Math.exp(-j * 0.08); // trend saturation
      const incrementalProb = currentProb + (currentTrend * j * dampening) + (Math.sin(j * 0.9) * 4);
      const predProb = Math.min(99, Math.max(5, Math.round(incrementalProb)));

      // Uncertainty grows wider into future
      const margin = Math.round(5 + j * 1.8 * sensitivityMultiplier);
      const lower = Math.max(2, predProb - margin);
      const upper = Math.min(100, predProb + margin);

      let driver = "Predictive Log Trend Analysis";
      if (predProb > 75) driver = "Cascade Vulnerability Propagation";
      else if (predProb > 50) driver = "Ingestion Anomaly Acceleration";
      else if (predProb < 25) driver = "Automated Countermeasure Recovery";

      points.push({
        timeLabel: d3.timeFormat(stepMinutes >= 120 ? "%b %d %H:%M" : "%H:%M")(futureTime),
        timestamp: futureTime,
        isHistorical: false,
        actualProbability: null,
        predictedProbability: predProb,
        lowerBound: lower,
        upperBound: upper,
        riskLevel: predProb >= 75 ? "Critical" : predProb >= 50 ? "Severe" : predProb >= 30 ? "Elevated" : "Low",
        primaryThreatDriver: driver
      });
    }

    return points;
  }, [horizon, modelSensitivity, networkMetrics]);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 320),
        height: 280
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render D3 Line Chart & Confidence Band
  useEffect(() => {
    if (!svgRef.current || forecastData.length === 0) return;

    const { width, height } = dimensions;
    const margin = { top: 35, right: 35, bottom: 45, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X Scale: Time
    const xScale = d3.scaleTime()
      .domain(d3.extent<ForecastPoint, Date>(forecastData, d => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    // Y Scale: Threat Probability % (0 to 100)
    const yScale = d3.scaleLinear()
      .domain([0, 100])
      .range([innerHeight, 0]);

    // Horizontal Grid Lines
    const yAxisGrid = d3.axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => "")
      .ticks(5);

    g.append("g")
      .attr("class", "grid opacity-15 text-gray-600")
      .call(yAxisGrid)
      .selectAll("line")
      .attr("stroke", "#374151")
      .attr("stroke-dasharray", "3,3");

    // Critical Threshold Danger Zone Line (70%)
    g.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yScale(70))
      .attr("y2", yScale(70))
      .attr("stroke", "#ef4444")
      .attr("stroke-dasharray", "4,4")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.6);

    g.append("text")
      .attr("x", innerWidth - 8)
      .attr("y", yScale(70) - 5)
      .attr("text-anchor", "end")
      .style("fill", "#ef4444")
      .style("font-size", "9px")
      .style("font-family", "monospace")
      .style("font-weight", "bold")
      .text("CRITICAL ALERT LEVEL (70%)");

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat(d3.timeFormat("%H:%M") as any);

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${innerHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("fill", "#9ca3af")
      .style("font-size", "10px")
      .style("font-family", "monospace");

    g.select(".x-axis path").style("stroke", "#27272a");

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(5)
      .tickFormat(d => `${d}%`);

    g.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .selectAll("text")
      .style("fill", "#9ca3af")
      .style("font-size", "10px")
      .style("font-family", "monospace");

    g.select(".y-axis path").style("stroke", "#27272a");

    // Now Divide Marker Vertical Line
    const nowPoint = forecastData.find(d => d.timeLabel === "NOW") || forecastData[Math.floor(forecastData.length / 2)];
    if (nowPoint) {
      const nowX = xScale(nowPoint.timestamp);

      // Shaded Future Forecast Zone Background
      g.append("rect")
        .attr("x", nowX)
        .attr("y", 0)
        .attr("width", innerWidth - nowX)
        .attr("height", innerHeight)
        .attr("fill", "#3b82f6")
        .attr("opacity", 0.04);

      g.append("line")
        .attr("x1", nowX)
        .attr("x2", nowX)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "2,2");

      g.append("text")
        .attr("x", nowX + 6)
        .attr("y", 12)
        .style("fill", "#60a5fa")
        .style("font-size", "9px")
        .style("font-family", "monospace")
        .style("font-weight", "bold")
        .text("NOW ▶ PREDICTIVE HORIZON");
    }

    // 1. Confidence Band Area for Future Forecast
    const forecastOnly = forecastData.filter(d => !d.isHistorical || d.timeLabel === "NOW");
    const areaGenerator = d3.area<ForecastPoint>()
      .x(d => xScale(d.timestamp))
      .y0(d => yScale(d.lowerBound))
      .y1(d => yScale(d.upperBound))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(forecastOnly)
      .attr("fill", "#ef4444")
      .attr("opacity", 0.12)
      .attr("d", areaGenerator);

    // 2. Historical Line (Solid Line)
    const historicalOnly = forecastData.filter(d => d.isHistorical);
    const historicalLine = d3.line<ForecastPoint>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.actualProbability || d.predictedProbability))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(historicalOnly)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2.5)
      .attr("d", historicalLine);

    // 3. Forecast Line (Dashed Line)
    const forecastLine = d3.line<ForecastPoint>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d.predictedProbability))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(forecastOnly)
      .attr("fill", "none")
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "5,5")
      .attr("d", forecastLine);

    // 4. Data Point Circles
    g.selectAll<SVGCircleElement, ForecastPoint>(".dot")
      .data<ForecastPoint>(forecastData)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d: ForecastPoint) => xScale(d.timestamp))
      .attr("cy", (d: ForecastPoint) => yScale(d.isHistorical ? (d.actualProbability || d.predictedProbability) : d.predictedProbability))
      .attr("r", (d: ForecastPoint) => d.timeLabel === "NOW" ? 5 : 3.5)
      .attr("fill", (d: ForecastPoint) => {
        if (d.timeLabel === "NOW") return "#3b82f6";
        if (d.isHistorical) return "#10b981";
        return d.predictedProbability >= 70 ? "#ef4444" : "#f59e0b";
      })
      .attr("stroke", "#09090b")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer");

    // 5. Interactive Guideline Overlay & Mouse Tracker
    const overlay = g.append("rect")
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair");

    const mouseLine = g.append("line")
      .attr("stroke", "#60a5fa")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3,3")
      .style("opacity", 0);

    const bisect = d3.bisector<ForecastPoint, Date>(d => d.timestamp).left;

    overlay.on("mousemove", (event) => {
      const [mx] = d3.pointer(event);
      const x0 = xScale.invert(mx);
      const index = bisect(forecastData, x0, 1);
      const d0 = forecastData[index - 1];
      const d1 = forecastData[index];
      
      let d = d0;
      if (d0 && d1) {
        d = x0.getTime() - d0.timestamp.getTime() > d1.timestamp.getTime() - x0.getTime() ? d1 : d0;
      }

      if (d) {
        const cx = xScale(d.timestamp);
        mouseLine
          .attr("x1", cx)
          .attr("x2", cx)
          .attr("y1", 0)
          .attr("y2", innerHeight)
          .style("opacity", 1);

        setHoveredPoint(d);
        setPointerX(cx + margin.left);
      }
    });

    overlay.on("mouseout", () => {
      mouseLine.style("opacity", 0);
      setHoveredPoint(null);
      setPointerX(null);
    });

  }, [forecastData, dimensions]);

  // Derived peak threat stats
  const forecastStats = useMemo(() => {
    const futureOnly = forecastData.filter(d => !d.isHistorical);
    const maxFuture = futureOnly.reduce((max, pt) => pt.predictedProbability > max.predictedProbability ? pt : max, futureOnly[0] || forecastData[0]);
    const nowPoint = forecastData.find(d => d.timeLabel === "NOW") || forecastData[0];
    const velocity = maxFuture && nowPoint ? Math.round(((maxFuture.predictedProbability - nowPoint.predictedProbability) / (futureOnly.length || 1)) * 10) / 10 : 0;

    return {
      peakProbability: maxFuture ? maxFuture.predictedProbability : 0,
      peakTime: maxFuture ? maxFuture.timeLabel : "--",
      riskVelocity: velocity,
      timeToBreach: maxFuture && maxFuture.predictedProbability >= 70 ? maxFuture.timeLabel : "No breach projected"
    };
  }, [forecastData]);

  return (
    <div className="bg-[#0f0f12] border border-[#262629] rounded-lg p-4 shadow-2xl relative overflow-hidden" id="d3-threat-forecast-card">
      {/* Background ambient pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f1f23_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#232326] relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#161619] border border-[#2a2a2e] rounded text-amber-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-widest uppercase font-mono flex items-center gap-2">
              D3 Predictive Threat Probability Forecast
              <span className="text-[9px] px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/40 text-blue-400 font-normal">
                AI TIME-SERIES MODEL
              </span>
            </h3>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
              Machine learning trend extrapolation using live trace frequencies & vulnerability weights
            </p>
          </div>
        </div>

        {/* Controls: Horizon & Sensitivity */}
        <div className="flex flex-wrap items-center gap-2 relative z-10" id="forecast-controls">
          {/* Time Horizon selector */}
          <div className="flex items-center gap-1 bg-[#09090b] p-1 border border-[#232326] rounded text-[10px] font-mono">
            <span className="text-gray-500 px-1 font-semibold flex items-center gap-1">
              <Clock className="h-3 w-3" /> Horizon:
            </span>
            {(["1h", "6h", "24h", "7d"] as const).map(h => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                id={`forecast-horizon-${h}`}
                className={`px-2 py-0.5 rounded transition-all font-semibold ${
                  horizon === h
                    ? "bg-blue-950/60 border border-blue-800/40 text-blue-400 font-bold"
                    : "text-gray-400 hover:text-white border border-transparent"
                }`}
              >
                {h.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Model Sensitivity selector */}
          <div className="flex items-center gap-1 bg-[#09090b] p-1 border border-[#232326] rounded text-[10px] font-mono">
            <span className="text-gray-500 px-1 font-semibold flex items-center gap-1">
              <Zap className="h-3 w-3" /> Model:
            </span>
            <select
              value={modelSensitivity}
              onChange={e => setModelSensitivity(e.target.value as any)}
              className="bg-transparent text-gray-200 outline-none cursor-pointer pr-1"
              id="forecast-model-sensitivity"
            >
              <option value="standard" className="bg-[#0f0f12]">Baseline Standard</option>
              <option value="stress" className="bg-[#0f0f12]">High Volatility Stress</option>
              <option value="exploit" className="bg-[#0f0f12]">Active Exploit Cascade</option>
            </select>
          </div>
        </div>
      </div>

      {/* Predictive Summary Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 relative z-10" id="forecast-stats-grid">
        <div className="bg-[#141418] border border-[#26262b] p-2.5 rounded font-mono">
          <span className="text-[9px] text-gray-500 block uppercase">Projected Peak Risk</span>
          <span className={`text-sm font-bold ${forecastStats.peakProbability >= 70 ? "text-red-400" : "text-amber-400"}`}>
            {forecastStats.peakProbability}%
          </span>
          <span className="text-[9px] text-gray-500 block mt-0.5">At {forecastStats.peakTime}</span>
        </div>

        <div className="bg-[#141418] border border-[#26262b] p-2.5 rounded font-mono">
          <span className="text-[9px] text-gray-500 block uppercase">Risk Velocity</span>
          <span className={`text-sm font-bold ${forecastStats.riskVelocity > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {forecastStats.riskVelocity > 0 ? `+${forecastStats.riskVelocity}` : forecastStats.riskVelocity}% / step
          </span>
          <span className="text-[9px] text-gray-500 block mt-0.5">Rate of threat acceleration</span>
        </div>

        <div className="bg-[#141418] border border-[#26262b] p-2.5 rounded font-mono">
          <span className="text-[9px] text-gray-500 block uppercase">Estimated Breach Window</span>
          <span className="text-sm font-bold text-blue-400">
            {forecastStats.timeToBreach}
          </span>
          <span className="text-[9px] text-gray-500 block mt-0.5">Threshold &gt;70% crossing</span>
        </div>

        <div className="bg-[#141418] border border-[#26262b] p-2.5 rounded font-mono">
          <span className="text-[9px] text-gray-500 block uppercase">Active Vectors</span>
          <span className="text-sm font-bold text-white">
            {networkMetrics.isUnderAttack ? "Exploit Injection" : "Normal Egress"}
          </span>
          <span className="text-[9px] text-gray-500 block mt-0.5">
            {networkMetrics.compromisedCount} compromised / {networkMetrics.suspiciousCount} suspicious
          </span>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div ref={containerRef} className="relative bg-[#08080a] rounded border border-[#1c1c20] p-2 overflow-hidden h-64" id="d3-forecast-chart-container">
        <svg
          ref={svgRef}
          className="w-full h-full block"
          style={{ minHeight: "100%" }}
          id="d3-forecast-svg"
        />

        {/* Hover Point Inspection Tooltip */}
        {hoveredPoint && pointerX !== null && (
          <div
            className="absolute z-30 bg-[#0d0d10] border border-[#3b82f6]/50 shadow-2xl rounded p-2.5 text-[10px] font-mono text-gray-200 pointer-events-none w-56"
            style={{
              left: Math.min(pointerX, dimensions.width - 230),
              top: 15
            }}
          >
            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#26262b]">
              <span className="font-bold text-white flex items-center gap-1">
                <Clock className="h-3 w-3 text-blue-400" />
                {hoveredPoint.timeLabel}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                hoveredPoint.isHistorical ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400"
              }`}>
                {hoveredPoint.isHistorical ? "OBSERVED" : "FORECAST"}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Threat Probability:</span>
                <span className={`font-bold ${
                  (hoveredPoint.actualProbability || hoveredPoint.predictedProbability) >= 70 ? "text-red-400" :
                  (hoveredPoint.actualProbability || hoveredPoint.predictedProbability) >= 40 ? "text-amber-400" : "text-emerald-400"
                }`}>
                  {hoveredPoint.isHistorical ? hoveredPoint.actualProbability : hoveredPoint.predictedProbability}%
                </span>
              </div>

              {!hoveredPoint.isHistorical && (
                <div className="flex justify-between text-[9px] text-gray-500">
                  <span>Confidence Interval:</span>
                  <span className="text-gray-300">
                    {hoveredPoint.lowerBound}% - {hoveredPoint.upperBound}%
                  </span>
                </div>
              )}

              <div className="flex justify-between pt-1 border-t border-[#26262b] text-[9px]">
                <span className="text-gray-500">Driver:</span>
                <span className="text-blue-400 truncate max-w-[120px]">{hoveredPoint.primaryThreatDriver}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Chart Legend Bar */}
      <div className="mt-3 pt-2 border-t border-[#232326] flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-gray-500 relative z-10" id="forecast-legend-bar">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 inline-block" /> Historical Telemetry
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 border-t border-dashed border-amber-500 inline-block" /> Predictive Trend Line
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-red-500/20 border border-red-500/30 inline-block" /> Confidence Interval Band
          </span>
        </div>

        <div className="flex items-center gap-2 text-[9px] text-gray-400">
          <span className="text-red-400 font-bold flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" /> Red Alert Limit (70%)
          </span>
        </div>
      </div>
    </div>
  );
}
