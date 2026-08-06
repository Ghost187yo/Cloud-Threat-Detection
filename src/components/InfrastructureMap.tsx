import React, { useState } from "react";
import { CloudNode } from "../types";
import { Cloud, Database, Cpu, HardDrive, ShieldCheck, ShieldAlert, Wifi, Globe, Terminal } from "lucide-react";
import { motion } from "motion/react";
import { D3NetworkFlowMap } from "./D3NetworkFlowMap";

interface InfrastructureMapProps {
  nodes: CloudNode[];
  selectedNodeId: string;
  onSelectNode: (node: CloudNode) => void;
  underAttackNodeId?: string;
}

export const InfrastructureMap: React.FC<InfrastructureMapProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  underAttackNodeId
}) => {
  const [activeView, setActiveView] = useState<"d3" | "grid">("d3");

  const getNodeIcon = (type: CloudNode["type"]) => {
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

  const getStatusColor = (status: CloudNode["status"]) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/10 border-green-500/20 text-green-400";
      case "suspicious":
        return "bg-orange-500/10 border-orange-500/20 text-orange-400";
      case "compromised":
        return "bg-red-500/10 border-red-500/20 text-red-400 animate-pulse";
    }
  };

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-5 shadow-xl relative overflow-hidden" id="infrastructure-map-container">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#2a2a2c_1px,transparent_1px)] [background-size:20px_20px] opacity-40 pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 relative z-10">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            DISTRIBUTED CLOUD TOPOLOGY
          </h2>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Click on any microservice or server node below to inspect live traces.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Layout view tab selector */}
          <div className="flex items-center gap-1 bg-[#0d0d0f] p-1 border border-[#2a2a2c] rounded text-[10px] font-mono mr-1" id="infra-map-toggles">
            <button
              onClick={() => setActiveView("d3")}
              id="btn-view-d3"
              className={`px-2.5 py-1 rounded transition-all font-semibold ${
                activeView === "d3"
                  ? "bg-blue-950/50 border border-blue-900/30 text-blue-400 font-bold"
                  : "text-gray-400 hover:text-white border border-transparent"
              }`}
            >
              Interactive Traffic Flow (D3)
            </button>
            <button
              onClick={() => setActiveView("grid")}
              id="btn-view-grid"
              className={`px-2.5 py-1 rounded transition-all font-semibold ${
                activeView === "grid"
                  ? "bg-blue-950/50 border border-blue-900/30 text-blue-400 font-bold"
                  : "text-gray-400 hover:text-white border border-transparent"
              }`}
            >
              Bento Pods
            </button>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs font-mono text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-green-500/20 border border-green-500 inline-block" /> Healthy
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-orange-500/20 border border-orange-500 inline-block" /> Anomalies
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-red-500/20 border border-red-500 inline-block animate-pulse" /> Exploited
            </span>
          </div>
        </div>
      </div>

      {activeView === "d3" ? (
        <div className="relative z-10" id="d3-map-view">
          <D3NetworkFlowMap
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            underAttackNodeId={underAttackNodeId}
          />
        </div>
      ) : (
        /* Grid Layout of Nodes (Original View) */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10" id="nodes-layout-grid">
          {nodes.map((node) => {
            const NodeIcon = getNodeIcon(node.type);
            const isSelected = node.id === selectedNodeId;
            const statusStyle = getStatusColor(node.status);
            const isUnderAttack = node.id === underAttackNodeId;

            return (
              <motion.div
                key={node.id}
                id={`node-${node.id}`}
                onClick={() => onSelectNode(node)}
                className={`cursor-pointer rounded-lg border p-4 transition-all relative ${
                  isSelected 
                    ? "border-blue-500 bg-[#161618] shadow-md ring-1 ring-blue-500/30" 
                    : "border-[#2a2a2c] bg-[#0d0d0f] hover:border-gray-600 hover:bg-[#161618]"
                }`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {/* Pulsing Red Aura if Target is undergoing live attack simulation */}
                {isUnderAttack && (
                  <div className="absolute inset-0 border border-red-500/60 rounded bg-red-500/[0.04] animate-pulse pointer-events-none" />
                )}

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded ${
                      node.status === "healthy" 
                        ? "bg-green-950/40 text-green-400 border border-green-900/30" 
                        : node.status === "suspicious"
                        ? "bg-orange-950/40 text-orange-400 border border-orange-900/30"
                        : "bg-red-950/40 text-red-400 border border-red-900/30"
                    }`}>
                      <NodeIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white tracking-tight">{node.name}</h4>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{node.type}</p>
                    </div>
                  </div>
                  
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase ${statusStyle}`}>
                    {node.status}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-[#2a2a2c] grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                  <div>
                    <span className="text-gray-600 block">REGION:</span>
                    <span className="text-[#e1e1e3]">{node.region}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 block">IP ADDR:</span>
                    <span className="text-[#e1e1e3]">{node.ipAddress}</span>
                  </div>
                </div>

                {/* Little simulated activity signal */}
                <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-gray-500">
                  <span className="flex items-center gap-1">
                    <Wifi className="h-3 w-3 text-blue-500/60" /> {node.provider} Node
                  </span>
                  {node.status === "compromised" ? (
                    <span className="text-red-400 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3 animate-bounce" /> Compromised Trace
                    </span>
                  ) : (
                    <span className="text-green-400 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Secure Egress
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Simulated Network Backplane Status bar */}
      <div className="mt-4 pt-3 border-t border-[#2a2a2c] flex flex-wrap items-center justify-between text-[10px] font-mono text-gray-500 relative z-10" id="network-backplane-status">
        <span className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-blue-500" />
          <span>Active Egress Interceptor Network Layer (Port-Mirroring Enabled)</span>
        </span>
        <span className="text-blue-400">
          Telemetry stream: 124.8 kb/sec
        </span>
      </div>
    </div>
  );
};
