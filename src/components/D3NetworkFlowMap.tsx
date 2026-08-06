import React, { useState, useEffect, useRef } from "react";
import * as d3 from "d3";
import { CloudNode } from "../types";
import { Globe, Database, Cloud, Cpu, HardDrive, ShieldCheck, ShieldAlert, Wifi, Zap, RefreshCw, AlertOctagon } from "lucide-react";

interface D3NetworkFlowMapProps {
  nodes: CloudNode[];
  selectedNodeId: string;
  onSelectNode: (node: CloudNode) => void;
  underAttackNodeId?: string;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  status: "healthy" | "suspicious" | "compromised";
  provider: string;
  ipAddress: string;
}

interface GraphLink {
  source: string;
  target: string;
  id: string;
  baseVolume: number;
}

export function D3NetworkFlowMap({
  nodes,
  selectedNodeId,
  onSelectNode,
  underAttackNodeId
}: D3NetworkFlowMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 320 });
  const [simNodes, setSimNodes] = useState<GraphNode[]>([]);
  const [simLinks, setSimLinks] = useState<GraphLink[]>([]);
  const [isSimulationActive, setIsSimulationActive] = useState(true);

  // Define static topological linkages between our 6 nodes
  const STATIC_LINKS: GraphLink[] = [
    { id: "link-gw-fe", source: "node-gateway", target: "node-frontend", baseVolume: 25 },
    { id: "link-gw-auth", source: "node-gateway", target: "node-auth", baseVolume: 10 },
    { id: "link-fe-bill", source: "node-frontend", target: "node-billing", baseVolume: 15 },
    { id: "link-fe-pay", source: "node-frontend", target: "node-payment", baseVolume: 12 },
    { id: "link-auth-bill", source: "node-auth", target: "node-billing", baseVolume: 8 },
    { id: "link-daemon-gw", source: "node-k8s-daemon", target: "node-gateway", baseVolume: 5 },
    { id: "link-daemon-fe", source: "node-k8s-daemon", target: "node-frontend", baseVolume: 5 }
  ];

  // Track responsive container size
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 300),
        height: 320
      });
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Sync node data changes (status updates) from parent into the simulation nodes
  useEffect(() => {
    const updatedNodes: GraphNode[] = nodes.map((node) => {
      // Preserve existing coordinate positions if they exist to prevent jumping
      const existing = simNodes.find((n) => n.id === node.id);
      return {
        id: node.id,
        name: node.name,
        type: node.type,
        status: node.status,
        provider: node.provider,
        ipAddress: node.ipAddress,
        x: existing?.x ?? undefined,
        y: existing?.y ?? undefined,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0
      };
    });

    setSimNodes(updatedNodes);
    setSimLinks(STATIC_LINKS);
  }, [nodes]);

  // Run D3 force simulation to calculate optimal graph positions
  useEffect(() => {
    if (simNodes.length === 0) return;

    // Fixed pre-positioning targets to keep graph structured and clean, but elastic
    const targets: { [id: string]: { x: number; y: number } } = {
      "node-gateway": { x: dimensions.width * 0.15, y: dimensions.height * 0.5 },
      "node-frontend": { x: dimensions.width * 0.5, y: dimensions.height * 0.35 },
      "node-k8s-daemon": { x: dimensions.width * 0.35, y: dimensions.height * 0.75 },
      "node-auth": { x: dimensions.width * 0.5, y: dimensions.height * 0.7 },
      "node-billing": { x: dimensions.width * 0.85, y: dimensions.height * 0.5 },
      "node-payment": { x: dimensions.width * 0.82, y: dimensions.height * 0.25 }
    };

    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force("link", d3.forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>()
        .id((d) => d.id)
        .links(simLinks.map(l => ({ source: l.source, target: l.target })))
        .distance(120)
        .strength(0.4)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collision", d3.forceCollide().radius(45))
      // Gently pull nodes toward their topological target positions to preserve clean logical hierarchies
      .force("x", d3.forceX<GraphNode>((d) => targets[d.id]?.x ?? dimensions.width / 2).strength(0.3))
      .force("y", d3.forceY<GraphNode>((d) => targets[d.id]?.y ?? dimensions.height / 2).strength(0.3));

    simulation.on("tick", () => {
      // Force constraints to keep nodes inside SVG bounds
      const radius = 35;
      simNodes.forEach((node) => {
        if (node.x !== undefined) {
          node.x = Math.max(radius, Math.min(dimensions.width - radius, node.x));
        }
        if (node.y !== undefined) {
          node.y = Math.max(radius, Math.min(dimensions.height - radius, node.y));
        }
      });
      // Trigger state re-render
      setSimNodes([...simNodes]);
    });

    return () => {
      simulation.stop();
    };
  }, [simLinks, dimensions.width, dimensions.height, isSimulationActive]);

  // Support custom drag behavior for D3 force nodes
  const handleNodeDrag = (e: React.MouseEvent, node: GraphNode) => {
    const svgElement = e.currentTarget.parentElement;
    if (!svgElement) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initX = node.x ?? 0;
    const initY = node.y ?? 0;

    node.fx = initX;
    node.fy = initY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      node.fx = initX + dx;
      node.fy = initY + dy;
      node.x = initX + dx;
      node.y = initY + dy;
      setSimNodes([...simNodes]);
    };

    const handleMouseUp = () => {
      node.fx = undefined;
      node.fy = undefined;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Helper to retrieve node positions for path lines
  const getNodePos = (id: string) => {
    const found = simNodes.find((n) => n.id === id);
    return {
      x: found?.x ?? 0,
      y: found?.y ?? 0
    };
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "API Gateway":
        return Globe;
      case "Database Server":
        return Database;
      case "Kubernetes Cluster":
        return Cloud;
      case "Serverless Function":
        return Cpu;
      default:
        return HardDrive;
    }
  };

  return (
    <div className="bg-[#0c0c0e] border border-[#232325] rounded-lg p-4 relative overflow-hidden" ref={containerRef} id="d3-network-flow-card">
      
      {/* Background ambient glowing gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(#1f1f23_1px,transparent_1px)] [background-size:16px_16px] opacity-35 pointer-events-none" />
      {underAttackNodeId && (
        <div className="absolute inset-0 bg-red-950/[0.02] border border-red-500/10 pointer-events-none rounded-lg animate-pulse" />
      )}

      {/* Title block */}
      <div className="flex items-center justify-between mb-4 relative z-10 border-b border-[#232325] pb-3">
        <div>
          <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2 font-mono">
            <Zap className="h-4 w-4 text-amber-400 animate-pulse" />
            Interactive D3 Traffic Control Matrix
          </h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            Click to audit a node. Drag nodes to reshape topology dynamically. Flow rates animate in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {underAttackNodeId && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-red-950/40 border border-red-900/50 rounded text-red-400 font-mono text-[9px] font-bold animate-pulse">
              <AlertOctagon className="h-3 w-3 shrink-0" />
              <span>ATTACK VECTOR LIVE</span>
            </div>
          )}
          <button
            onClick={() => setIsSimulationActive(!isSimulationActive)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#161618] border border-[#2a2a2c] hover:border-gray-500 text-[9px] font-mono text-gray-400 hover:text-white transition-all"
            title="Re-stabilize forces"
          >
            <RefreshCw className="h-2.5 w-2.5" />
            Reset Physics
          </button>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative bg-[#070709] rounded border border-[#1a1a1c] h-80 overflow-hidden" id="d3-traffic-svg-canvas-container">
        <svg
          className="w-full h-full block"
          style={{ minHeight: "100%" }}
        >
          {/* SVG Definitions for Arrowheads, filters, and glow elements */}
          <defs>
            <marker
              id="arrow-normal"
              viewBox="0 0 10 10"
              refX="32"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3a3a3c" />
            </marker>

            <marker
              id="arrow-attack"
              viewBox="0 0 10 10"
              refX="32"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>

            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="32"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
            </marker>

            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* BACKGROUND CLIENT INGRESS VECTOR */}
          <g transform={`translate(${dimensions.width * 0.03}, ${dimensions.height * 0.5})`} className="opacity-80">
            <circle r="12" fill="#141416" stroke="#2a2a2c" strokeWidth="1" />
            <path d="M-6-4 L-6 4 L2 0 Z" fill="#6b7280" transform="translate(1, 0)" />
            <text x="16" y="3" fill="#6b7280" className="text-[9px] font-mono font-bold select-none">INTERNET</text>
          </g>

          {/* Client flow path to Edge Gateway */}
          {simNodes.find(n => n.id === "node-gateway") && (() => {
            const gw = getNodePos("node-gateway");
            const startX = dimensions.width * 0.03 + 12;
            const startY = dimensions.height * 0.5;
            const isTargetAttacked = underAttackNodeId === "node-gateway" || underAttackNodeId !== undefined;
            
            return (
              <g>
                <line
                  x1={startX}
                  y1={startY}
                  x2={gw.x}
                  y2={gw.y}
                  stroke={isTargetAttacked ? "#ef4444" : "#1e1e24"}
                  strokeWidth={isTargetAttacked ? 2.5 : 1.5}
                  strokeDasharray={isTargetAttacked ? "6, 6" : "5, 5"}
                  className={isTargetAttacked ? "animate-[flow-attack_0.4s_linear_infinite]" : "animate-[flow-normal_1.5s_linear_infinite]"}
                  style={{
                    animationName: "flow-normal",
                    animationDuration: isTargetAttacked ? "0.3s" : "1.2s"
                  }}
                />
                {/* Glowing Flow Packets */}
                <circle
                  cx={startX}
                  cy={startY}
                  r={isTargetAttacked ? 4 : 2.5}
                  fill={isTargetAttacked ? "#ef4444" : "#10b981"}
                  filter={isTargetAttacked ? "url(#glow-red)" : undefined}
                >
                  <animateMotion
                    path={`M ${startX} ${startY} L ${gw.x} ${gw.y}`}
                    dur={isTargetAttacked ? "0.7s" : "2s"}
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })()}

          {/* EDGE LINKS (NETWORK FLOW PIPES) */}
          {simLinks.map((link) => {
            const srcPos = getNodePos(link.source);
            const tgtPos = getNodePos(link.target);

            // Determine if this path is carrying an active attack stream
            const isAttackActive = underAttackNodeId !== undefined && 
              (link.source === underAttackNodeId || link.target === underAttackNodeId);

            // Color scheme based on load or threat levels
            const strokeColor = isAttackActive 
              ? "#ef4444" 
              : (link.source === selectedNodeId || link.target === selectedNodeId) 
                ? "#3b82f6" 
                : "#1b1b1e";

            const strokeWidth = isAttackActive 
              ? 3.2 
              : (link.source === selectedNodeId || link.target === selectedNodeId)
                ? 2.2
                : 1.2;

            const dashPattern = isAttackActive ? "6, 4" : "4, 6";
            const flowSpeed = isAttackActive ? "0.25s" : "1.8s";

            // Arrow marker template
            const markerType = isAttackActive 
              ? "url(#arrow-attack)" 
              : (link.source === selectedNodeId || link.target === selectedNodeId) 
                ? "url(#arrow-active)" 
                : "url(#arrow-normal)";

            return (
              <g key={link.id}>
                {/* Underlay glow path during attacks */}
                {isAttackActive && (
                  <line
                    x1={srcPos.x}
                    y1={srcPos.y}
                    x2={tgtPos.x}
                    y2={tgtPos.y}
                    stroke="#ef4444"
                    strokeWidth={6}
                    strokeOpacity={0.15}
                    filter="url(#glow-red)"
                  />
                )}

                {/* Main Link Cable */}
                <line
                  x1={srcPos.x}
                  y1={srcPos.y}
                  x2={tgtPos.x}
                  y2={tgtPos.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  markerEnd={markerType}
                  className="opacity-70 transition-all duration-300"
                />

                {/* Flowing Dash Overlays */}
                <line
                  x1={srcPos.x}
                  y1={srcPos.y}
                  x2={tgtPos.x}
                  y2={tgtPos.y}
                  stroke={isAttackActive ? "#f43f5e" : "#0ea5e9"}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dashPattern}
                  className="transition-all duration-300"
                  style={{
                    animation: `flow-normal ${flowSpeed} linear infinite`,
                    animationName: "flow-normal",
                    strokeOpacity: isAttackActive ? 1.0 : 0.4
                  }}
                />

                {/* Animated Flying Packet Particles */}
                <circle
                  cx="0"
                  cy="0"
                  r={isAttackActive ? 4 : 2.5}
                  fill={isAttackActive ? "#ef4444" : "#38bdf8"}
                  filter={isAttackActive ? "url(#glow-red)" : undefined}
                >
                  <animateMotion
                    path={`M ${srcPos.x} ${srcPos.y} L ${tgtPos.x} ${tgtPos.y}`}
                    dur={isAttackActive ? "0.8s" : "2.5s"}
                    repeatCount="indefinite"
                  />
                </circle>

                {/* Additional anti-packet to increase visual attack density */}
                {isAttackActive && (
                  <circle
                    cx="0"
                    cy="0"
                    r="3.5"
                    fill="#f43f5e"
                    filter="url(#glow-red)"
                  >
                    <animateMotion
                      path={`M ${srcPos.x} ${srcPos.y} L ${tgtPos.x} ${tgtPos.y}`}
                      dur="0.5s"
                      begin="0.25s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* NODES LAYER */}
          {simNodes.map((node) => {
            const NodeIcon = getNodeIcon(node.type);
            const isSelected = node.id === selectedNodeId;
            const isUnderAttack = node.id === underAttackNodeId;

            // Health status metrics configuration
            let ringColor = "stroke-green-500/40";
            let centerColor = "bg-green-500/10";
            let iconColor = "text-green-400";
            let statusText = "SECURE";

            if (node.status === "suspicious") {
              ringColor = "stroke-orange-500/40";
              centerColor = "bg-orange-500/10";
              iconColor = "text-orange-400";
              statusText = "WARN";
            } else if (node.status === "compromised") {
              ringColor = "stroke-red-500/60";
              centerColor = "bg-red-500/10";
              iconColor = "text-red-400";
              statusText = "EXPLOITED";
            }

            const posX = node.x ?? 0;
            const posY = node.y ?? 0;

            return (
              <g
                key={node.id}
                transform={`translate(${posX}, ${posY})`}
                className="cursor-pointer select-none"
                onClick={() => {
                  const rawNode = nodes.find((n) => n.id === node.id);
                  if (rawNode) onSelectNode(rawNode);
                }}
                onMouseDown={(e) => handleNodeDrag(e, node)}
              >
                {/* Live pulsating shockwave ring for active attacks */}
                {isUnderAttack && (
                  <circle
                    r="32"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    className="animate-ping opacity-75"
                  />
                )}

                {/* Selected Node Aura */}
                {isSelected && (
                  <circle
                    r="28"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeDasharray="4, 2"
                    className="animate-[spin_10s_linear_infinite]"
                  />
                )}

                {/* Main Node Body Base Circle */}
                <circle
                  r="22"
                  fill="#0b0b0d"
                  stroke={isSelected ? "#3b82f6" : isUnderAttack ? "#ef4444" : "#262629"}
                  strokeWidth={isSelected ? 2 : isUnderAttack ? 2 : 1}
                  className="transition-all duration-200"
                />

                {/* Outer status ring indicator */}
                <circle
                  r="19"
                  fill="none"
                  className={`${ringColor} stroke-2`}
                />

                {/* Central Icon Container */}
                <g transform="translate(-8, -8)" className={iconColor}>
                  <NodeIcon size={16} />
                </g>

                {/* Label metadata - Box layout for clean rendering */}
                <g transform="translate(0, 32)">
                  {/* Backdrop shield */}
                  <rect
                    x="-55"
                    y="-9"
                    width="110"
                    height="28"
                    rx="3"
                    fill="#0a0a0c"
                    stroke={isSelected ? "#3b82f6/40" : "#232325"}
                    strokeWidth="1"
                    className="opacity-95"
                  />
                  {/* Node short name */}
                  <text
                    textAnchor="middle"
                    fill="#ffffff"
                    className="text-[9px] font-semibold font-sans tracking-wide"
                  >
                    {node.name.length > 20 ? node.name.substring(0, 18) + ".." : node.name}
                  </text>
                  {/* IP Address secondary metric */}
                  <text
                    y="11"
                    textAnchor="middle"
                    fill={isUnderAttack ? "#f43f5e" : "#64748b"}
                    className="text-[8px] font-mono font-medium"
                  >
                    {node.ipAddress} | {statusText}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {/* Hover Tip indicator box */}
        <div className="absolute bottom-2.5 left-2.5 bg-[#0a0a0c]/90 border border-[#232325] px-2.5 py-1.5 rounded text-[8.5px] font-mono text-gray-500 space-y-0.5 pointer-events-none">
          <p><span className="text-blue-400 font-bold">● Highlight:</span> Current inspected node is haloed in blue</p>
          <p><span className="text-red-400 font-bold">● Live Vectors:</span> Red pulses highlight the attack entry and spread paths</p>
        </div>
      </div>

      {/* CSS Animation Overrides */}
      <style>{`
        @keyframes flow-normal {
          to {
            stroke-dashoffset: -20;
          }
        }
        @keyframes flow-attack {
          to {
            stroke-dashoffset: -40;
          }
        }
      `}</style>
    </div>
  );
}
