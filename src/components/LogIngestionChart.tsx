import React, { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import { CloudNode } from "../types";
import { Activity, LayoutGrid, Eye, Radio, HelpCircle } from "lucide-react";

interface LogDataPoint {
  time: Date;
  nodeRates: { [nodeId: string]: number };
}

interface LogIngestionChartProps {
  nodes: CloudNode[];
  selectedNodeId: string;
  onSelectNode?: (node: CloudNode) => void;
}

const generateInitialData = (nodes: CloudNode[]): LogDataPoint[] => {
  const points: LogDataPoint[] = [];
  const now = new Date();
  for (let i = 19; i >= 0; i--) {
    const pointTime = new Date(now.getTime() - i * 1500);
    const nodeRates: { [nodeId: string]: number } = {};
    nodes.forEach(node => {
      let base = 5;
      if (node.id === "node-gateway") base = 14;
      else if (node.id === "node-frontend") base = 10;
      else if (node.id === "node-billing") base = 6;
      else if (node.id === "node-k8s-daemon") base = 8;
      else if (node.id === "node-auth") base = 7;
      else if (node.id === "node-payment") base = 5;
      
      const statusMultiplier = node.status === "compromised" ? 12 : node.status === "suspicious" ? 6 : 1;
      const noise = Math.random() * 4 - 2;
      nodeRates[node.id] = Math.max(1, Math.round((base + noise) * statusMultiplier));
    });
    points.push({ time: pointTime, nodeRates });
  }
  return points;
};

export function LogIngestionChart({ nodes, selectedNodeId, onSelectNode }: LogIngestionChartProps) {
  const [chartData, setChartData] = useState<LogDataPoint[]>([]);
  const [viewMode, setViewMode] = useState<"multi" | "focus" | "cumulative">("multi");
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 160 });

  // Initialize data on mount
  useEffect(() => {
    if (nodes.length > 0 && chartData.length === 0) {
      setChartData(generateInitialData(nodes));
    }
  }, [nodes]);

  // Background real-time feed generator
  useEffect(() => {
    if (nodes.length === 0) return;

    const interval = setInterval(() => {
      const now = new Date();
      const nodeRates: { [nodeId: string]: number } = {};
      
      nodes.forEach(node => {
        let base = 5;
        if (node.id === "node-gateway") base = 14;
        else if (node.id === "node-frontend") base = 10;
        else if (node.id === "node-billing") base = 6;
        else if (node.id === "node-k8s-daemon") base = 8;
        else if (node.id === "node-auth") base = 7;
        else if (node.id === "node-payment") base = 5;
        
        // Boost rate if node status is compromised or suspicious
        const statusMultiplier = node.status === "compromised" ? 12 : node.status === "suspicious" ? 6 : 1;
        const noise = Math.random() * 4 - 2;
        nodeRates[node.id] = Math.max(1, Math.round((base + noise) * statusMultiplier));
      });

      setChartData(prev => {
        const next = [...prev, { time: now, nodeRates }];
        if (next.length > 20) {
          next.shift();
        }
        return next;
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [nodes]);

  // Handle responsive resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 200),
        height: 160
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Draw chart inside useEffect using standard D3 patterns
  useEffect(() => {
    if (!svgRef.current || chartData.length === 0) return;

    const { width, height } = dimensions;
    const margin = { top: 15, right: 15, bottom: 25, left: 35 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Select and clear SVG
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create main group
    const g = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X Scale (Time)
    const xScale = d3.scaleTime()
      .domain(d3.extent<LogDataPoint, Date>(chartData, d => d.time) as [Date, Date])
      .range([0, innerWidth]);

    // Determine Y scale maximum based on view mode
    let yMax = 20;
    if (viewMode === "cumulative") {
      yMax = d3.max<LogDataPoint, number>(chartData, d => Object.values(d.nodeRates).reduce((sum, rate) => sum + rate, 0)) || 100;
    } else if (viewMode === "focus") {
      yMax = d3.max<LogDataPoint, number>(chartData, d => d.nodeRates[selectedNodeId] || 10) || 50;
    } else {
      yMax = d3.max<LogDataPoint, number>(chartData, d => d3.max<number>(Object.values(d.nodeRates)) || 50) || 50;
    }
    yMax = Math.max(15, Math.ceil(yMax * 1.15));

    // Y Scale
    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([innerHeight, 0]);

    // Grid lines
    const yGrid = d3.axisLeft(yScale)
      .ticks(4)
      .tickSize(-innerWidth)
      .tickFormat(() => "");

    g.append("g")
      .attr("class", "grid text-gray-800/20")
      .attr("stroke-dasharray", "2,2")
      .call(yGrid)
      .selectAll(".tick line")
      .attr("stroke", "#2a2a2c");

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(innerWidth / 90, 6))
      .tickFormat(d3.timeFormat("%M:%S") as any);

    g.append("g")
      .attr("transform", `translate(0, ${innerHeight})`)
      .attr("class", "text-[10px] font-mono text-gray-500")
      .call(xAxis)
      .selectAll("path, line")
      .attr("stroke", "#2a2a2c");

    // Y Axis
    const yAxis = d3.axisLeft(yScale)
      .ticks(4);

    g.append("g")
      .attr("class", "text-[10px] font-mono text-gray-500")
      .call(yAxis)
      .selectAll("path, line")
      .attr("stroke", "#2a2a2c");

    // Line and Area Generators
    const lineGenerator = d3.line<LogDataPoint>()
      .x(d => xScale(d.time))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3.area<LogDataPoint>()
      .x(d => xScale(d.time))
      .y0(innerHeight)
      .curve(d3.curveMonotoneX);

    // Node colors map
    const nodeColors: { [nodeId: string]: string } = {
      "node-gateway": "#3b82f6", // Blue
      "node-frontend": "#14b8a6", // Teal
      "node-k8s-daemon": "#a855f7", // Purple
      "node-billing": "#f97316", // Orange
      "node-auth": "#f59e0b", // Amber
      "node-payment": "#f43f5e" // Rose
    };

    const getThemeColor = (id: string) => nodeColors[id] || "#06b6d4";

    const defs = svg.append("defs");

    if (viewMode === "focus") {
      const color = getThemeColor(selectedNodeId);
      const gradientId = `grad-${selectedNodeId}`;
      const grad = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      
      grad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", color)
        .attr("stop-opacity", 0.25);
      grad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", color)
        .attr("stop-opacity", 0);

      // Area Path
      areaGenerator.y1(d => yScale(d.nodeRates[selectedNodeId] || 0));
      g.append("path")
        .datum(chartData)
        .attr("fill", `url(#${gradientId})`)
        .attr("d", areaGenerator);

      // Line Path
      lineGenerator.y(d => yScale(d.nodeRates[selectedNodeId] || 0));
      g.append("path")
        .datum(chartData)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);

      // Dots
      g.selectAll(".dot")
        .data(chartData)
        .enter()
        .append("circle")
        .attr("cx", d => xScale((d as LogDataPoint).time))
        .attr("cy", d => yScale((d as LogDataPoint).nodeRates[selectedNodeId] || 0))
        .attr("r", 3)
        .attr("fill", color)
        .attr("stroke", "#111113")
        .attr("stroke-width", 1);

    } else if (viewMode === "cumulative") {
      const color = "#06b6d4"; // Cyan aggregate
      const gradientId = "grad-cumulative";
      const grad = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      
      grad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", color)
        .attr("stop-opacity", 0.25);
      grad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", color)
        .attr("stop-opacity", 0);

      const getSum = (d: LogDataPoint) => Object.values(d.nodeRates).reduce((s, r) => s + r, 0);

      // Area Path
      areaGenerator.y1(d => yScale(getSum(d)));
      g.append("path")
        .datum(chartData)
        .attr("fill", `url(#${gradientId})`)
        .attr("d", areaGenerator);

      // Line Path
      lineGenerator.y(d => yScale(getSum(d)));
      g.append("path")
        .datum(chartData)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("d", lineGenerator);

      // Dots
      g.selectAll(".dot")
        .data(chartData)
        .enter()
        .append("circle")
        .attr("cx", d => xScale((d as LogDataPoint).time))
        .attr("cy", d => yScale(getSum(d as LogDataPoint)))
        .attr("r", 3)
        .attr("fill", color)
        .attr("stroke", "#111113")
        .attr("stroke-width", 1);

    } else {
      // Multi-line overlay mode for all nodes
      nodes.forEach(node => {
        const color = getThemeColor(node.id);
        const nodeLineGen = d3.line<LogDataPoint>()
          .x(d => xScale(d.time))
          .y(d => yScale(d.nodeRates[node.id] || 0))
          .curve(d3.curveMonotoneX);

        g.append("path")
          .datum(chartData)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", node.id === selectedNodeId ? 2.5 : 1.2)
          .attr("stroke-opacity", node.id === selectedNodeId ? 1.0 : 0.55)
          .attr("d", nodeLineGen);
      });
    }

  }, [chartData, dimensions, viewMode, selectedNodeId, nodes]);

  // Retrieve matching node name for active selector
  const activeNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-4 shadow-xl" id="ingestion-chart-card">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#0d0d0f] border border-[#2a2a2c] rounded text-blue-400">
            <Activity className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider font-mono">
              REAL-TIME INGESTION FREQUENCY (LOGS / SEC)
            </h3>
            <p className="text-[10px] text-gray-500 font-mono">
              Live telemetry ingress throughput per target cluster
            </p>
          </div>
        </div>

        {/* Chart View Selector Toggles */}
        <div className="flex items-center gap-1 bg-[#0d0d0f] p-1 border border-[#2a2a2c] rounded text-[10px] font-mono self-start md:self-auto" id="chart-mode-toggles">
          <button
            onClick={() => setViewMode("multi")}
            id="toggle-mode-multi"
            className={`px-2.5 py-1 rounded transition-all font-semibold flex items-center gap-1.5 ${
              viewMode === "multi"
                ? "bg-blue-950/50 border border-blue-900/30 text-blue-400"
                : "text-gray-400 hover:text-white border border-transparent"
            }`}
          >
            <LayoutGrid className="h-3 w-3" />
            Cluster Grid
          </button>
          <button
            onClick={() => setViewMode("focus")}
            id="toggle-mode-focus"
            className={`px-2.5 py-1 rounded transition-all font-semibold flex items-center gap-1.5 ${
              viewMode === "focus"
                ? "bg-blue-950/50 border border-blue-900/30 text-blue-400"
                : "text-gray-400 hover:text-white border border-transparent"
            }`}
          >
            <Eye className="h-3 w-3" />
            Focus: {activeNode ? activeNode.name.split(" ")[0] : "Active"}
          </button>
          <button
            onClick={() => setViewMode("cumulative")}
            id="toggle-mode-cumulative"
            className={`px-2.5 py-1 rounded transition-all font-semibold flex items-center gap-1.5 ${
              viewMode === "cumulative"
                ? "bg-cyan-950/50 border border-cyan-900/30 text-cyan-400"
                : "text-gray-400 hover:text-white border border-transparent"
            }`}
          >
            <Radio className="h-3 w-3" />
            Total Load
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* SVG Container and Chart Rendering */}
        <div ref={containerRef} className="md:col-span-9 bg-[#0d0d0f] rounded border border-[#1d1d21] p-1.5 relative h-44 overflow-hidden" id="d3-chart-svg-container">
          <svg
            ref={svgRef}
            className="w-full h-full block overflow-visible"
            style={{ minHeight: "100%" }}
            id="d3-line-chart-canvas"
          />
        </div>

        {/* Side statistics / legend panel */}
        <div className="md:col-span-3 space-y-2 font-mono text-[10px] bg-[#0d0d0f]/50 border border-[#2a2a2c]/40 p-2.5 rounded h-44 flex flex-col justify-between" id="chart-legend-panel">
          <div>
            <span className="text-gray-500 uppercase font-bold tracking-wider block mb-1.5">Telemetry Nodes</span>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {nodes.map(n => {
                const colorMap: { [id: string]: string } = {
                  "node-gateway": "bg-[#3b82f6]",
                  "node-frontend": "bg-[#14b8a6]",
                  "node-k8s-daemon": "bg-[#a855f7]",
                  "node-billing": "bg-[#f97316]",
                  "node-auth": "bg-[#f59e0b]",
                  "node-payment": "bg-[#f43f5e]"
                };
                const colorClass = colorMap[n.id] || "bg-cyan-400";
                const isFocused = n.id === selectedNodeId;
                const lastPoint = chartData[chartData.length - 1];
                const rate = lastPoint ? lastPoint.nodeRates[n.id] || 0 : 0;

                return (
                  <button
                    key={n.id}
                    onClick={() => onSelectNode?.(n)}
                    className={`flex items-center justify-between w-full p-1 rounded transition-all text-left ${
                      isFocused ? "bg-blue-950/20 border border-blue-900/20" : "border border-transparent hover:bg-[#111113]/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate max-w-[85%]">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} />
                      <span className={`truncate ${isFocused ? "text-white font-bold" : "text-gray-400"}`}>
                        {n.name}
                      </span>
                    </div>
                    <span className={`text-[9px] shrink-0 font-bold ${n.status === "compromised" ? "text-red-400" : n.status === "suspicious" ? "text-orange-400" : "text-blue-400"}`}>
                      {rate} L/s
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-[#2a2a2c]/60 flex items-center gap-1.5 text-gray-500">
            <HelpCircle className="h-3.5 w-3.5 text-gray-600" />
            <span>Spikes reflect active exploit triggers.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
