import React, { useState } from "react";
import { SecurityScenario } from "../types";
import { Zap, Play, Upload, Code2, AlertTriangle, FileWarning, Eye } from "lucide-react";
import { motion } from "motion/react";

interface ThreatSimulatorProps {
  scenarios: SecurityScenario[];
  onTriggerScenario: (scenario: SecurityScenario) => void;
  isLoading: boolean;
  onTriggerCustom: (title: string, payload: string, logSnippet: string) => void;
}

export const ThreatSimulator: React.FC<ThreatSimulatorProps> = ({
  scenarios,
  onTriggerScenario,
  isLoading,
  onTriggerCustom
}) => {
  const [activeTab, setActiveTab] = useState<"preset" | "custom">("preset");
  const [customTitle, setCustomTitle] = useState("Ad-Hoc Container Configuration Audit");
  const [customPayload, setCustomPayload] = useState(`apiVersion: v1
kind: Pod
metadata:
  name: privileged-pod
spec:
  containers:
  - name: exploit-container
    image: ubuntu
    securityContext:
      privileged: true # Potential Host Escape!`);
  const [customLogs, setCustomLogs] = useState(`[09:12:01] [INFO] kubelet: Pod privileged-pod successfully scheduled.
[09:12:05] [WARN] security-agent: privileged: true detected on host execution path.`);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onTriggerCustom(customTitle, customPayload, customLogs);
  };

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-5 shadow-xl" id="threat-simulator-root">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a2a2c]">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-500 fill-blue-500/20" />
            VULNERABILITY & ZERO-DAY INJECTOR
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Simulate complex exploits to evaluate real-time AI security detection.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#0d0d0f] p-1 rounded border border-[#2a2a2c] text-xs font-mono">
          <button
            onClick={() => setActiveTab("preset")}
            className={`px-3 py-1.5 rounded transition-all ${
              activeTab === "preset"
                ? "bg-blue-600 text-white font-bold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Preset Attack Scenarios
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`px-3 py-1.5 rounded transition-all ${
              activeTab === "custom"
                ? "bg-blue-600 text-white font-bold"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Custom Ad-Hoc Payload
          </button>
        </div>
      </div>

      {activeTab === "preset" ? (
        <div className="space-y-3" id="preset-scenarios-stack">
          {scenarios.map((scen) => {
            const isCritical = scen.urgency === "CRITICAL";

            return (
              <div
                key={scen.id}
                id={`scenario-card-${scen.id}`}
                className="bg-[#0d0d0f] border border-[#2a2a2c] rounded-lg p-4 hover:border-blue-500/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                      isCritical ? "bg-red-950/40 text-red-400 border border-red-900/30" : "bg-orange-950/40 text-orange-400 border border-orange-900/30"
                    }`}>
                      {scen.urgency} Urgency
                    </span>
                    <span className="text-[9px] font-mono text-gray-400 bg-[#1a1a1c] px-2 py-0.5 rounded border border-[#2a2a2c]">
                      {scen.category}
                    </span>
                    <span className="text-[9px] font-mono text-blue-400">
                      Target: {scen.service}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-white mt-1.5 tracking-tight">{scen.name}</h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed font-sans">
                    {scen.description}
                  </p>
                </div>

                <motion.button
                  disabled={isLoading}
                  onClick={() => onTriggerScenario(scen)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded text-xs font-mono flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Inject Vector
                </motion.button>
              </div>
            );
          })}
        </div>
      ) : (
        <form onSubmit={handleCustomSubmit} className="space-y-4" id="custom-payload-form">
          <div>
            <label className="block text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-1.5">
              Incident or File Title
            </label>
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full bg-[#1a1a1c] border border-[#2a2a2c] rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. Terraform S3 Policy Leak, Log4j Payload"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                  Attack Code / Target Config Snippet
                </label>
                <span className="text-[9px] text-gray-600 font-mono">Payload Vector</span>
              </div>
              <textarea
                value={customPayload}
                onChange={(e) => setCustomPayload(e.target.value)}
                className="w-full h-32 bg-[#1a1a1c] border border-[#2a2a2c] rounded p-3 text-[11px] font-mono text-green-400 focus:outline-none focus:border-blue-500 resize-none leading-normal"
                placeholder="Paste code snippet, payload headers, or HTTP body to analyze..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">
                  Distributed Trace / Host System Logs
                </label>
                <span className="text-[9px] text-gray-600 font-mono">Syscalls & Logs</span>
              </div>
              <textarea
                value={customLogs}
                onChange={(e) => setCustomLogs(e.target.value)}
                className="w-full h-32 bg-[#1a1a1c] border border-[#2a2a2c] rounded p-3 text-[11px] font-mono text-orange-300 focus:outline-none focus:border-blue-500 resize-none leading-normal"
                placeholder="Paste active console traces, timing loops, or error outputs..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded text-xs font-mono flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Analyze Custom Artifact via Gemini AI
            </motion.button>
          </div>
        </form>
      )}
    </div>
  );
};
