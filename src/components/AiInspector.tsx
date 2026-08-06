import React, { useState } from "react";
import { ThreatAnalysisResult } from "../types";
import { ShieldCheck, ShieldAlert, Cpu, Clipboard, Check, HelpCircle, Info, Sliders, KeyRound, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AiInspectorProps {
  analysis: ThreatAnalysisResult | null;
  isLoading: boolean;
  activeNodeName: string;
}

export const AiInspector: React.FC<AiInspectorProps> = ({
  analysis,
  isLoading,
  activeNodeName
}) => {
  const [copied, setCopied] = useState(false);
  const [fpFilterLevel, setFpFilterLevel] = useState<number>(15); // Calibration threshold slider

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "CRITICAL":
        return "text-rose-400 bg-rose-950/40 border-rose-800/60";
      case "HIGH":
        return "text-amber-400 bg-amber-950/40 border-amber-800/60";
      case "MEDIUM":
        return "text-yellow-400 bg-yellow-950/30 border-yellow-800/40";
      default:
        return "text-cyan-400 bg-cyan-950/30 border-cyan-800/40";
    }
  };

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-5 shadow-xl relative overflow-hidden" id="ai-inspector-panel">
      {/* Visual background accents */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a2a2c]">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="h-5 w-5 text-blue-400" />
            GEMINI THREAT INTELLIGENCE
          </h2>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Evaluating: <span className="text-blue-400 font-bold">{activeNodeName}</span>
          </p>
        </div>
        <div className="text-[10px] bg-blue-950/50 border border-blue-800/50 text-blue-400 font-mono px-2 py-1 rounded">
          Model: gemini-3.5-flash
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-96 flex flex-col items-center justify-center text-center space-y-4"
          >
            {/* Spinning AI core */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-12 h-12 rounded-full border-2 border-cyan-500/20 animate-ping" />
              <div className="w-10 h-10 rounded-full border-t-2 border-b-2 border-cyan-400 animate-spin" />
            </div>
            
            <div>
              <h4 className="text-sm font-semibold text-white font-mono animate-pulse">Running Cognitive Vulnerability Inspection...</h4>
              <p className="text-xs text-gray-400 max-w-sm mt-1 mx-auto leading-relaxed font-mono">
                Gemini is profiling payload arrays, mapping distributed egress targets, and checking against zero-day handshakes.
              </p>
            </div>
          </motion.div>
        ) : analysis ? (
          <motion.div
            key="analysis"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Danger / Threat Alert Banner */}
            <div className={`border rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${getUrgencyColor(analysis.urgency)}`}>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-[#0a0a0b]/60 rounded shrink-0 mt-0.5">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#0a0a0b]/80 border border-[#2a2a2c] inline-block">
                      {analysis.urgency} SEVERITY
                    </span>
                    <span className="text-xs font-mono font-semibold">
                      Threat Index: {analysis.threatIdentified ? "VULNERABILITY IDENTIFIED" : "SAFE / CLEAR"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold mt-1 tracking-tight">
                    {analysis.vulnerabilityType}
                  </h3>
                </div>
              </div>

              {/* False Positive Confidence Tuning */}
              <div className="w-full md:w-56 bg-[#0a0a0b]/80 p-3 rounded border border-[#2a2a2c]/80 text-xs">
                <div className="flex items-center justify-between font-mono text-[10px] text-gray-400 mb-1">
                  <span className="flex items-center gap-1"><Sliders className="w-3.5 h-3.5 text-blue-400" /> Policy Confidence</span>
                  <span className="text-blue-400 font-bold">{analysis.falsePositiveLikelihood} FP</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={fpFilterLevel}
                  onChange={(e) => setFpFilterLevel(Number(e.target.value))}
                  className="w-full accent-blue-500 bg-[#2a2a2c] h-1 rounded cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-gray-500 font-mono mt-1">
                  <span>Aggressive Filter</span>
                  <span>Balanced ({fpFilterLevel}%)</span>
                </div>
              </div>
            </div>

            {/* Explainer Block */}
            <div className="bg-[#0d0d0f] border border-[#2a2a2c] rounded p-4 space-y-3">
              <div>
                <h4 className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-blue-400" />
                  Active Mechanism Analysis
                </h4>
                <p className="text-xs text-gray-300 mt-1.5 leading-relaxed font-sans">
                  {analysis.mechanismExplainer}
                </p>
              </div>

              {/* Zero Day Profiling */}
              <div className="pt-3 border-t border-[#2a2a2c]">
                <h4 className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-orange-400" />
                  Zero-Day Heuristic Signature Check
                </h4>
                <p className="text-xs text-orange-200/90 bg-orange-950/10 border border-orange-950/40 rounded p-3 mt-1.5 leading-relaxed font-mono">
                  {analysis.zeroDayAnalysis}
                </p>
              </div>
            </div>

            {/* Remediation Policy & Code Patch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-green-400" />
                  AI Suggested Remediation Patch ({analysis.remediation.patchLanguage})
                </label>
                <button
                  onClick={() => copyToClipboard(analysis.remediation.patchCode)}
                  className="text-xs text-blue-400 hover:text-white font-mono flex items-center gap-1 transition-colors bg-[#0d0d0f] border border-[#2a2a2c] px-2 py-1 rounded hover:bg-[#1a1a1c]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-green-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-3 w-3" /> Copy Patch
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <pre className="w-full bg-[#0a0a0b] border border-[#2a2a2c] rounded p-4 overflow-x-auto text-[11px] font-mono text-green-400 leading-relaxed shadow-inner max-h-56">
                  <code>{analysis.remediation.patchCode}</code>
                </pre>
              </div>

              <p className="text-[11px] text-gray-500 italic font-sans flex items-center gap-1.5 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                Remediation: Apply this patch directly to your infrastructure manifest to eliminate the verified escape path.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-96 flex flex-col items-center justify-center text-center space-y-3"
          >
            <ShieldCheck className="h-12 w-12 text-blue-500/40" />
            <div>
              <h4 className="text-sm font-semibold text-white">No Threat Log Dispatched</h4>
              <p className="text-xs text-gray-500 max-w-xs mt-1 mx-auto leading-relaxed font-sans">
                Select an attack scenario from the Vulnerability Injector above to analyze simulated exploit vectors in real-time.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
