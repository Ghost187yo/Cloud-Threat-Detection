import React, { useState, useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { CloudNode } from "../types";
import { Flame, ShieldAlert, Activity, Globe, Filter, Layers, Info, AlertTriangle, TrendingUp } from "lucide-react";

interface D3RiskHeatmapProps {
  nodes: CloudNode[];
  selectedNodeId: string;
  onSelectNode: (node: CloudNode) => void;
  underAttackNodeId?: string;
}

export interface HeatmapCellData {
  region: string;
  metricKey: string;
  metricLabel: string;
  value: number; // 0 to 100
  nodesInRegion: CloudNode[];
  statusBreakdown: { healthy: number; suspicious: number; compromised: number };
  totalLogs: number;
  highestRiskStatus: "healthy" | "suspicious" | "compromised";
}

const METRICS = [
  { key: "composite", label: "Composite Risk Index" },
  { key: "logVolume", label: "Log Volume Density" },
  { key: "threatSeverity", label: "Threat & Vulnerability Level" },
  { key: "exploitRate", label: "Exploit Attempt Frequency" }
];

export function D3RiskHeatmap({
  nodes,
  selectedNodeId,
  onSelectNode,
  underAttackNodeId
}: D3RiskHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 750, height: 260 });
  const [selectedMetric, setSelectedMetric] = useState<string>("composite");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [hoveredCell, setHoveredCell] = useState<HeatmapCellData | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Filter nodes by selected cloud provider
  const filteredNodes = useMemo(() => {
    if (providerFilter === "all") return nodes;
    return nodes.filter(n => n.provider.toLowerCase() === providerFilter.toLowerCase());
  }, [nodes, providerFilter]);

  // Extract unique regions dynamically
  const regions = useMemo(() => {
    const list = Array.from(new Set(nodes.map(n => n.region)));
    return list.length > 0 ? list : ["Edge-US-East", "us-west-2", "westeurope", "us-east4", "us-east-1", "europe-west3"];
  }, [nodes]);

  // Compute cell data matrix
  const heatmapMatrix = useMemo(() => {
    const matrix: HeatmapCellData[] = [];

    regions.forEach(region => {
      const regionNodes = filteredNodes.filter(n => n.region === region);
      
      const statusBreakdown = {
        healthy: regionNodes.filter(n => n.status === "healthy").length,
        suspicious: regionNodes.filter(n => n.status === "suspicious").length,
        compromised: regionNodes.filter(n => n.status === "compromised").length
      };

      const highestRiskStatus: "healthy" | "suspicious" | "compromised" = 
        statusBreakdown.compromised > 0 ? "compromised" :
        statusBreakdown.suspicious > 0 ? "suspicious" : "healthy";

      const totalLogs = regionNodes.reduce((acc, n) => acc + n.logs.length, 0);
      const isUnderAttack = regionNodes.some(n => n.id === underAttackNodeId);

      METRICS.forEach(metric => {
        let value = 0;

        if (regionNodes.length === 0) {
          value = 0;
        } else {
          switch (metric.key) {
            case "composite": {
              let base = 12;
              if (statusBreakdown.compromised > 0) base += 65;
              else if (statusBreakdown.suspicious > 0) base += 38;
              if (isUnderAttack) base += 20;
              const logFactor = Math.min(25, totalLogs * 3);
              value = Math.min(100, Math.round(base + logFactor));
              break;
            }
            case "logVolume": {
              const avgLogs = totalLogs / regionNodes.length;
              value = Math.min(100, Math.round(avgLogs * 18 + (isUnderAttack ? 35 : 5)));
              break;
            }
            case "threatSeverity": {
              let score = 10;
              if (statusBreakdown.compromised > 0) score += 75;
              else if (statusBreakdown.suspicious > 0) score += 40;
              if (isUnderAttack) score += 15;
              value = Math.min(100, score);
              break;
            }
            case "exploitRate": {
              let score = 5;
              if (isUnderAttack) score += 60;
              if (statusBreakdown.compromised > 0) score += 30;
              if (statusBreakdown.suspicious > 0) score += 15;
              value = Math.min(100, score);
              break;
            }
          }
        }

        matrix.push({
          region,
          metricKey: metric.key,
          metricLabel: metric.label,
          value,
          nodesInRegion: regionNodes,
          statusBreakdown,
          totalLogs,
          highestRiskStatus
        });
      });
    });

    return matrix;
  }, [filteredNodes, regions, underAttackNodeId]);

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 320),
        height: 250
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Draw Heatmap with D3
  useEffect(() => {
    if (!svgRef.current || heatmapMatrix.length === 0) return;

    const { width, height } = dimensions;
    const margin = { top: 35, right: 20, bottom: 45, left: 180 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X Scale: Regions
    const xScale = d3.scaleBand()
      .domain(regions)
      .range([0, innerWidth])
      .padding(0.08);

    // Y Scale: Metrics
    const yScale = d3.scaleBand()
      .domain(METRICS.map(m => m.label))
      .range([0, innerHeight])
      .padding(0.12);

    // Color Interpolator: Dark slate -> Emerald -> Gold -> Orange -> Crimson Red
    const colorScale = d3.scaleSequential<string>()
      .domain([0, 100])
      .interpolator(d3.interpolateRgbBasis([
        "#111827", // Very dark gray/blue
        "#064e3b", // Deep emerald
        "#854d0e", // Warm amber/gold
        "#ea580c", // Deep orange
        "#dc2626"  // Vivid red
      ]));

    // Draw X Axis (Regions)
    const xAxis = d3.axisTop(xScale)
      .tickSize(0);

    g.append("g")
      .attr("class", "x-axis text-[10px] font-mono font-bold")
      .call(xAxis)
      .selectAll("text")
      .style("fill", "#9ca3af")
      .style("font-size", "10px")
      .attr("dy", "-8px");

    g.select(".x-axis path").style("display", "none");

    // Draw Y Axis (Metric Labels)
    const yAxis = d3.axisLeft(yScale)
      .tickSize(0);

    g.append("g")
      .attr("class", "y-axis text-[10px] font-mono")
      .call(yAxis)
      .selectAll("text")
      .style("fill", "#cbd5e1")
      .style("font-size", "10px")
      .attr("dx", "-8px");

    g.select(".y-axis path").style("display", "none");

    // Filter matrix for selected metric or show full grid
    const currentMetricObj = METRICS.find(m => m.key === selectedMetric) || METRICS[0];

    // Filter matrix to current view or render all rows
    const visibleData = heatmapMatrix;

    // Heatmap Cells
    const cellGroup = g.selectAll<SVGGElement, HeatmapCellData>(".cell")
      .data<HeatmapCellData>(visibleData)
      .enter()
      .append("g")
      .attr("class", "cell")
      .attr("transform", (d: HeatmapCellData) => `translate(${xScale(d.region) || 0}, ${yScale(d.metricLabel) || 0})`);

    // Rectangles
    cellGroup.append("rect")
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", (d: HeatmapCellData) => colorScale(d.value))
      .attr("stroke", (d: HeatmapCellData) => {
        if (d.metricKey === selectedMetric) return "#3b82f6";
        if (d.value >= 75) return "#ef4444";
        return "#1e293b";
      })
      .attr("stroke-width", (d: HeatmapCellData) => (d.metricKey === selectedMetric ? 1.5 : 1))
      .attr("stroke-opacity", (d: HeatmapCellData) => (d.metricKey === selectedMetric ? 0.9 : 0.6))
      .style("cursor", "pointer")
      .style("transition", "fill 0.5s ease, stroke 0.3s ease")
      .on("mouseover", (event, d: HeatmapCellData) => {
        setHoveredCell(d);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltipPos({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          });
        }
      })
      .on("mousemove", (event) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setTooltipPos({
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          });
        }
      })
      .on("mouseout", () => {
        setHoveredCell(null);
        setTooltipPos(null);
      })
      .on("click", (event, d: HeatmapCellData) => {
        if (d.nodesInRegion.length > 0) {
          onSelectNode(d.nodesInRegion[0]);
        }
      });

    // Value Labels inside cells
    cellGroup.append("text")
      .text((d: HeatmapCellData) => `${d.value}`)
      .attr("x", xScale.bandwidth() / 2)
      .attr("y", yScale.bandwidth() / 2 + 4)
      .attr("text-anchor", "middle")
      .style("fill", (d: HeatmapCellData) => (d.value > 60 ? "#ffffff" : d.value > 20 ? "#f8fafc" : "#94a3b8"))
      .style("font-size", "10px")
      .style("font-family", "monospace")
      .style("font-weight", "bold")
      .style("pointer-events", "none");

    // Pulsing outline overlay for high risk (>75) cells
    cellGroup.filter((d: HeatmapCellData) => d.value >= 75)
      .append("rect")
      .attr("width", xScale.bandwidth())
      .attr("height", yScale.bandwidth())
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .style("pointer-events", "none")
      .attr("class", "animate-pulse");

  }, [heatmapMatrix, dimensions, regions, selectedMetric, onSelectNode]);

  // Calculate highest risk region summary
  const highestRiskRegion = useMemo(() => {
    let maxVal = -1;
    let targetRegion = "";
    regions.forEach(r => {
      const compositeCell = heatmapMatrix.find(c => c.region === r && c.metricKey === "composite");
      if (compositeCell && compositeCell.value > maxVal) {
        maxVal = compositeCell.value;
        targetRegion = r;
      }
    });
    return { region: targetRegion, score: maxVal };
  }, [heatmapMatrix, regions]);

  return (
    <div className="bg-[#0f0f12] border border-[#262629] rounded-lg p-4 shadow-2xl relative overflow-hidden" id="d3-risk-heatmap-card">
      {/* Background ambient pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f1f23_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#232326] relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#161619] border border-[#2a2a2e] rounded text-red-400">
            <Flame className="h-4 w-4 animate-bounce" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-widest uppercase font-mono flex items-center gap-2">
              D3 Regional Security & Traffic Heatmap
              <span className="text-[9px] px-2 py-0.5 rounded bg-red-950/60 border border-red-800/40 text-red-400 font-normal">
                CRITICAL MONITOR
              </span>
            </h3>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
              Live threat risk distribution across cloud availability zones and cluster nodes
            </p>
          </div>
        </div>

        {/* Controls: Provider Filter & Metric Focus */}
        <div className="flex flex-wrap items-center gap-2 relative z-10" id="heatmap-controls">
          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1 bg-[#09090b] p-1 border border-[#232326] rounded text-[10px] font-mono">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key)}
                id={`heatmap-metric-${m.key}`}
                className={`px-2 py-1 rounded transition-all font-semibold ${
                  selectedMetric === m.key
                    ? "bg-blue-950/60 border border-blue-800/40 text-blue-400 font-bold"
                    : "text-gray-400 hover:text-white border border-transparent"
                }`}
              >
                {m.label.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Provider Filter Pill */}
          <div className="flex items-center gap-1 bg-[#09090b] px-2 py-1 border border-[#232326] rounded text-[10px] font-mono text-gray-400">
            <Filter className="h-3 w-3 text-gray-500" />
            <select
              value={providerFilter}
              onChange={e => setProviderFilter(e.target.value)}
              className="bg-transparent text-gray-200 outline-none cursor-pointer"
              id="heatmap-provider-filter"
            >
              <option value="all" className="bg-[#0f0f12]">All Providers</option>
              <option value="aws" className="bg-[#0f0f12]">AWS</option>
              <option value="gcp" className="bg-[#0f0f12]">GCP</option>
              <option value="azure" className="bg-[#0f0f12]">Azure</option>
              <option value="hybrid" className="bg-[#0f0f12]">Hybrid</option>
            </select>
          </div>
        </div>
      </div>

      {/* Highest Risk Highlight Banner */}
      <div className="mb-3 flex items-center justify-between bg-[#141418] border border-[#28282d] p-2.5 rounded text-[11px] font-mono relative z-10">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${highestRiskRegion.score >= 60 ? "text-red-400 animate-pulse" : "text-amber-400"}`} />
          <span className="text-gray-300">
            Top Vulnerability Zone:{" "}
            <strong className="text-white font-bold">{highestRiskRegion.region || "None"}</strong>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-[10px]">
            Risk Score: <span className={`font-bold ${highestRiskRegion.score >= 60 ? "text-red-400" : "text-amber-400"}`}>{highestRiskRegion.score}/100</span>
          </span>
          <span className="text-gray-500 text-[10px] hidden sm:inline">
            Hover cells for node breakdown • Click cell to inspect node
          </span>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div ref={containerRef} className="relative bg-[#08080a] rounded border border-[#1c1c20] p-2 overflow-hidden h-64" id="d3-heatmap-container">
        <svg
          ref={svgRef}
          className="w-full h-full block"
          style={{ minHeight: "100%" }}
          id="d3-heatmap-svg"
        />

        {/* Hover Tooltip */}
        {hoveredCell && tooltipPos && (
          <div
            className="absolute z-30 bg-[#0d0d10] border border-[#3b82f6]/50 shadow-2xl rounded p-3 text-[10px] font-mono text-gray-200 pointer-events-none w-60"
            style={{
              left: Math.min(tooltipPos.x + 15, dimensions.width - 250),
              top: Math.max(tooltipPos.y - 110, 10)
            }}
          >
            <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-[#26262b]">
              <span className="font-bold text-white flex items-center gap-1">
                <Globe className="h-3 w-3 text-blue-400" />
                {hoveredCell.region}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                hoveredCell.value >= 75 ? "bg-red-950 text-red-400 border border-red-800/40" :
                hoveredCell.value >= 40 ? "bg-amber-950 text-amber-400 border border-amber-800/40" :
                "bg-emerald-950 text-emerald-400 border border-emerald-800/40"
              }`}>
                Score: {hoveredCell.value}/100
              </span>
            </div>

            <p className="text-gray-400 mb-2">{hoveredCell.metricLabel}</p>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Nodes in Zone:</span>
                <span className="text-white font-bold">{hoveredCell.nodesInRegion.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status Breakdown:</span>
                <span className="text-gray-300">
                  <span className="text-green-400 font-bold">{hoveredCell.statusBreakdown.healthy}H</span> /{" "}
                  <span className="text-amber-400 font-bold">{hoveredCell.statusBreakdown.suspicious}S</span> /{" "}
                  <span className="text-red-400 font-bold">{hoveredCell.statusBreakdown.compromised}C</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recent Log Ingestion:</span>
                <span className="text-blue-400 font-bold">{hoveredCell.totalLogs} entries</span>
              </div>
            </div>

            {hoveredCell.nodesInRegion.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-[#26262b] text-[9px] text-blue-400 italic">
                ▶ Click cell to jump to {hoveredCell.nodesInRegion[0].name.split(" ")[0]}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Heatmap Color Scale Gradient Legend Bar */}
      <div className="mt-3 pt-2 border-t border-[#232326] flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] font-mono text-gray-500 relative z-10" id="heatmap-legend-bar">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-gray-400 font-semibold">Risk Gradient:</span>
          <div className="h-2.5 w-48 rounded bg-gradient-to-r from-[#111827] via-[#064e3b] via-[#854d0e] via-[#ea580c] to-[#dc2626] border border-[#2a2a2e]" />
          <div className="flex items-center gap-3 text-[9px]">
            <span>0 (Low)</span>
            <span>50 (Medium)</span>
            <span className="text-red-400 font-bold">100 (Critical)</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[9px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500 inline-block" /> Low Risk (&lt;30)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-amber-500 inline-block" /> Warning (30-70)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-red-500 inline-block animate-pulse" /> Critical (&gt;70)
          </span>
        </div>
      </div>
    </div>
  );
}
