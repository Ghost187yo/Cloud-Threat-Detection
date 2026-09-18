import React, { useState } from "react";
import { CloudNode, ExportColumnOptions, ThreatAnalysisResult } from "../types";
import { detectThreatsInLogs, getThreatProbabilityScore } from "../utils/threatScore";
import { Eye, Download, Copy, Check, X, Info, SlidersHorizontal, CheckSquare, Square } from "lucide-react";
import { motion } from "motion/react";

interface ExportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  format: "json" | "csv";
  node: CloudNode;
  filteredLogs: string[];
  searchQuery: string;
  severityFilter: "all" | "critical";
  startTime: string;
  endTime: string;
  exportColumns: ExportColumnOptions;
  analysis?: ThreatAnalysisResult | null;
  onToggleColumn: (key: keyof ExportColumnOptions) => void;
  onSelectAllColumns: () => void;
  onSelectMinimalColumns: () => void;
  onConfirmExport: () => void;
}

export const EXPORT_COLUMN_LABELS: Record<keyof ExportColumnOptions, string> = {
  logIndex: "Index (#)",
  nodeId: "Node ID",
  nodeName: "Node Name",
  nodeType: "Node Type",
  region: "Region",
  ipAddress: "IP Address",
  severity: "Severity",
  threatProbability: "Threat Probability Score",
  logContent: "Log Content",
  exportedAt: "Timestamp",
};

export const ExportPreviewModal: React.FC<ExportPreviewModalProps> = ({
  isOpen,
  onClose,
  format,
  node,
  filteredLogs,
  searchQuery,
  severityFilter,
  startTime,
  endTime,
  exportColumns,
  analysis,
  onToggleColumn,
  onSelectAllColumns,
  onSelectMinimalColumns,
  onConfirmExport
}) => {
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  if (!isOpen) return null;

  const sampleLogs = filteredLogs.slice(0, 10);
  const nowIso = new Date().toISOString();

  // Detect whether any threat exists in the active filtered logs or analysis
  const hasThreatInLogs = detectThreatsInLogs(filteredLogs, analysis, node);
  const includeThreatScore = hasThreatInLogs && (exportColumns.threatProbability !== false);

  let previewText = "";

  const activeColumnCount = Object.values(exportColumns).filter(Boolean).length;

  if (format === "json") {
    const structuredSample = sampleLogs.map((logStr, idx) => {
      let severity = "INFO";
      if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
        severity = "CRITICAL";
      } else if (logStr.includes("[WARN]")) {
        severity = "WARN";
      }

      const rowObj: Record<string, any> = {};
      if (exportColumns.logIndex) rowObj.logIndex = idx + 1;
      if (exportColumns.nodeId) rowObj.nodeId = node.id;
      if (exportColumns.nodeName) rowObj.nodeName = node.name;
      if (exportColumns.nodeType) rowObj.nodeType = node.type;
      if (exportColumns.region) rowObj.region = node.region;
      if (exportColumns.ipAddress) rowObj.ipAddress = node.ipAddress;
      if (exportColumns.severity) rowObj.severity = severity;
      if (includeThreatScore) {
        rowObj.threatProbabilityScore = getThreatProbabilityScore(logStr, analysis, node);
      }
      if (exportColumns.logContent) rowObj.logContent = logStr;
      if (exportColumns.exportedAt) rowObj.exportedAt = nowIso;

      return rowObj;
    });

    previewText = JSON.stringify(
      {
        node: {
          id: node.id,
          name: node.name,
          type: node.type,
          ip: node.ipAddress,
          region: node.region
        },
        filter: {
          query: searchQuery || "none",
          severityFilter,
          timeWindow: {
            startTime: startTime || "unrestricted",
            endTime: endTime || "unrestricted"
          }
        },
        exportedAt: nowIso,
        activeColumnsCount: activeColumnCount,
        totalMatchedLogs: filteredLogs.length,
        sampleRowsCount: sampleLogs.length,
        hasThreatDetected: hasThreatInLogs,
        logs: structuredSample
      },
      null,
      2
    );
  } else {
    const headers: string[] = [];
    if (exportColumns.logIndex) headers.push("Log Index");
    if (exportColumns.nodeId) headers.push("Node ID");
    if (exportColumns.nodeName) headers.push("Node Name");
    if (exportColumns.nodeType) headers.push("Node Type");
    if (exportColumns.region) headers.push("Region");
    if (exportColumns.ipAddress) headers.push("IP Address");
    if (exportColumns.severity) headers.push("Severity");
    if (includeThreatScore) headers.push("Threat Probability Score");
    if (exportColumns.logContent) headers.push("Log Content");
    if (exportColumns.exportedAt) headers.push("Exported At");

    const csvRows = [
      headers.join(","),
      ...sampleLogs.map((logStr, idx) => {
        let severity = "INFO";
        if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
          severity = "CRITICAL";
        } else if (logStr.includes("[WARN]")) {
          severity = "WARN";
        }

        const fields: (string | number)[] = [];
        if (exportColumns.logIndex) fields.push(idx + 1);
        if (exportColumns.nodeId) fields.push(`"${node.id}"`);
        if (exportColumns.nodeName) fields.push(`"${node.name.replace(/"/g, '""')}"`);
        if (exportColumns.nodeType) fields.push(`"${node.type.replace(/"/g, '""')}"`);
        if (exportColumns.region) fields.push(`"${node.region}"`);
        if (exportColumns.ipAddress) fields.push(`"${node.ipAddress}"`);
        if (exportColumns.severity) fields.push(`"${severity}"`);
        if (includeThreatScore) {
          const score = getThreatProbabilityScore(logStr, analysis, node);
          fields.push(`"${score}"`);
        }
        if (exportColumns.logContent) fields.push(`"${logStr.replace(/"/g, '""')}"`);
        if (exportColumns.exportedAt) fields.push(`"${nowIso}"`);

        return fields.join(",");
      })
    ];
    previewText = csvRows.join("\n");
  }

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(previewText);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" id="export-preview-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#111114] border border-[#2a2a2e] rounded-xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[88vh] overflow-hidden text-gray-200"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#2a2a2e] flex items-center justify-between bg-[#16161a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-400">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Export File Sample Preview
                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
                  format === "json"
                    ? "bg-amber-950/70 text-amber-300 border-amber-800/60"
                    : "bg-emerald-950/70 text-emerald-300 border-emerald-800/60"
                }`}>
                  {format === "json" ? "JSON Format" : "CSV Format"}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Previewing sample rows with <strong className="text-cyan-300">{activeColumnCount} active columns</strong> for <strong className="text-gray-200">{node.name}</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#222228] transition-colors"
            title="Close preview"
            id="btn-close-export-preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar & Column Selector Toggle */}
        <div className="bg-[#16161c] px-6 py-2.5 border-b border-[#2a2a2e] text-xs font-mono text-gray-400 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className={`px-2.5 py-1 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                showColumnPicker
                  ? "bg-blue-950/80 border-blue-700 text-blue-300"
                  : "bg-[#202026] hover:bg-[#2a2a32] border-[#2a2a2e] text-gray-200"
              }`}
              id="btn-toggle-preview-column-picker"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              Toggle Columns ({activeColumnCount}/9)
            </button>

            <button
              onClick={onSelectAllColumns}
              className="text-[11px] text-gray-400 hover:text-blue-300 underline underline-offset-2"
            >
              All Columns
            </button>

            <span className="text-gray-600">|</span>

            <button
              onClick={onSelectMinimalColumns}
              className="text-[11px] text-gray-400 hover:text-blue-300 underline underline-offset-2"
            >
              Minimal (Logs Only)
            </button>
          </div>

          <button
            onClick={handleCopyPreview}
            className="px-2.5 py-1 rounded bg-[#202026] hover:bg-[#2a2a32] text-gray-200 text-[11px] font-semibold border border-[#2a2a2e] transition-colors flex items-center gap-1 shrink-0"
            title="Copy preview text snippet to clipboard"
            id="btn-copy-preview-snippet"
          >
            {copiedSnippet ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" /> Snippet Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-gray-400" /> Copy Snippet
              </>
            )}
          </button>
        </div>

        {/* Interactive Column Toggles Grid (Expandable) */}
        {showColumnPicker && (
          <div className="bg-[#131317] p-4 border-b border-[#2a2a2e] font-mono text-xs space-y-2">
            <span className="text-[11px] font-semibold text-gray-400 block">
              TOGGLE EXPORT DATA FIELDS & COLUMNS TO REDUCE FILE NOISE:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(EXPORT_COLUMN_LABELS) as Array<keyof ExportColumnOptions>).map((colKey) => {
                const isChecked = exportColumns[colKey];
                return (
                  <button
                    key={colKey}
                    onClick={() => onToggleColumn(colKey)}
                    className={`p-2 rounded-lg border text-left flex items-center gap-2 transition-all ${
                      isChecked
                        ? "bg-blue-950/50 border-blue-800/80 text-blue-200 font-semibold"
                        : "bg-[#18181c] border-[#26262a] text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {isChecked ? (
                      <CheckSquare className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                    )}
                    <span className="truncate">{EXPORT_COLUMN_LABELS[colKey]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Code/Text Sample Box */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#09090b] font-mono text-xs text-gray-300 leading-relaxed select-text">
          <pre className="whitespace-pre-wrap break-all p-4 rounded-lg bg-[#111115] border border-[#232328] overflow-x-auto text-[11px] text-gray-200">
            {previewText}
          </pre>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#2a2a2e] bg-[#16161a] flex items-center justify-between text-xs font-mono">
          <div className="text-gray-400">
            Total Export Stream: <strong className="text-white">{filteredLogs.length} rows</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#202026] hover:bg-[#2a2a32] text-gray-300 font-semibold transition-colors"
            >
              Close
            </button>

            <button
              onClick={() => {
                onConfirmExport();
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-blue-950/50 transition-all"
              id="btn-confirm-export-download"
            >
              <Download className="h-3.5 w-3.5" />
              Download Full Export ({filteredLogs.length} rows)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
