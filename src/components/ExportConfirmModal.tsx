import React, { useMemo } from "react";
import { CloudNode, ExportColumnOptions, ThreatAnalysisResult } from "../types";
import { EXPORT_COLUMN_LABELS } from "./ExportPreviewModal";
import { detectThreatsInLogs, getThreatProbabilityScore } from "../utils/threatScore";
import {
  Download,
  X,
  AlertCircle,
  FileText,
  Database,
  ShieldAlert,
  Filter,
  CheckCircle2,
  HardDrive,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";

interface ExportConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  format: "json" | "csv";
  node: CloudNode;
  filteredLogs?: string[];
  filteredLogsCount: number;
  searchQuery: string;
  severityFilter: "all" | "critical";
  startTime: string;
  endTime: string;
  exportColumns: ExportColumnOptions;
  analysis?: ThreatAnalysisResult | null;
}

// Check if a log entry falls within the optional start-time and end-time window
const isLogInTimeWindow = (logStr: string, start: string, end: string): boolean => {
  if (!start && !end) return true;
  const timeMatch = logStr.match(/\[(\d{2}:\d{2}(?::\d{2})?)\]/);
  if (!timeMatch) return true;

  const logTime = timeMatch[1].length === 5 ? `${timeMatch[1]}:00` : timeMatch[1];
  const startFormatted = start ? (start.length === 5 ? `${start}:00` : start) : "00:00:00";
  const endFormatted = end ? (end.length === 5 ? `${end}:59` : end) : "23:59:59";

  return logTime >= startFormatted && logTime <= endFormatted;
};

// Calculate byte-accurate estimation based on format, selected fields, and log row lengths
const formatByteSize = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const calculateEstimatedSize = (
  logs: string[],
  format: "json" | "csv",
  columns: ExportColumnOptions,
  node: CloudNode,
  analysis?: ThreatAnalysisResult | null
) => {
  if (logs.length === 0) {
    return { totalBytes: 0, formatted: "0 B", bytesPerRow: 0 };
  }

  const activeCols = Object.keys(columns).filter((k) => columns[k as keyof ExportColumnOptions]);
  if (activeCols.length === 0) {
    return { totalBytes: 0, formatted: "0 B", bytesPerRow: 0 };
  }

  const sampleSize = Math.min(logs.length, 25);
  const sampleLogs = logs.slice(0, sampleSize);
  const nowIso = new Date().toISOString();

  const hasThreatInLogs = detectThreatsInLogs(logs, analysis, node);
  const includeThreatScore = hasThreatInLogs && (columns.threatProbability !== false);

  if (format === "json") {
    const sampleRows = sampleLogs.map((logStr, idx) => {
      let severity = "INFO";
      if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
        severity = "CRITICAL";
      } else if (logStr.includes("[WARN]")) {
        severity = "WARN";
      }

      const rowObj: Record<string, any> = {};
      if (columns.logIndex) rowObj.logIndex = idx + 1;
      if (columns.nodeId) rowObj.nodeId = node.id;
      if (columns.nodeName) rowObj.nodeName = node.name;
      if (columns.nodeType) rowObj.nodeType = node.type;
      if (columns.region) rowObj.region = node.region;
      if (columns.ipAddress) rowObj.ipAddress = node.ipAddress;
      if (columns.severity) rowObj.severity = severity;
      if (includeThreatScore) {
        rowObj.threatProbabilityScore = getThreatProbabilityScore(logStr, analysis, node);
      }
      if (columns.logContent) rowObj.logContent = logStr;
      if (columns.exportedAt) rowObj.exportedAt = nowIso;
      return rowObj;
    });

    const sampleRowBytes = sampleRows.reduce((acc, r) => acc + JSON.stringify(r).length + 1, 0);
    const avgRowBytes = sampleRowBytes / sampleSize;

    // Envelope JSON wrapper size
    const envelope = JSON.stringify({
      node: { id: node.id, name: node.name, type: node.type, region: node.region, ipAddress: node.ipAddress, status: node.status },
      filter: { query: "none", severityFilter: "all", timeWindow: { startTime: "unrestricted", endTime: "unrestricted" } },
      exportedAt: nowIso,
      activeColumnsCount: activeCols.length,
      totalMatchedLogs: logs.length,
      hasThreatDetected: hasThreatInLogs,
      logs: []
    });

    const totalBytes = Math.round(envelope.length + avgRowBytes * logs.length);
    return {
      totalBytes,
      formatted: formatByteSize(totalBytes),
      bytesPerRow: Math.round(avgRowBytes)
    };
  } else {
    // CSV format estimation
    const activeHeaders: string[] = [];
    if (columns.logIndex) activeHeaders.push("Log Index");
    if (columns.nodeId) activeHeaders.push("Node ID");
    if (columns.nodeName) activeHeaders.push("Node Name");
    if (columns.nodeType) activeHeaders.push("Node Type");
    if (columns.region) activeHeaders.push("Region");
    if (columns.ipAddress) activeHeaders.push("IP Address");
    if (columns.severity) activeHeaders.push("Severity");
    if (includeThreatScore) activeHeaders.push("Threat Probability Score");
    if (columns.logContent) activeHeaders.push("Log Content");
    if (columns.exportedAt) activeHeaders.push("Exported At");

    const headerLength = activeHeaders.join(",").length + 1;

    const sampleCsvRows = sampleLogs.map((logStr, idx) => {
      let severity = "INFO";
      if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
        severity = "CRITICAL";
      } else if (logStr.includes("[WARN]")) {
        severity = "WARN";
      }

      const fields: (string | number)[] = [];
      if (columns.logIndex) fields.push(idx + 1);
      if (columns.nodeId) fields.push(`"${node.id}"`);
      if (columns.nodeName) fields.push(`"${node.name.replace(/"/g, '""')}"`);
      if (columns.nodeType) fields.push(`"${node.type.replace(/"/g, '""')}"`);
      if (columns.region) fields.push(`"${node.region}"`);
      if (columns.ipAddress) fields.push(`"${node.ipAddress}"`);
      if (columns.severity) fields.push(`"${severity}"`);
      if (includeThreatScore) {
        const score = getThreatProbabilityScore(logStr, analysis, node);
        fields.push(`"${score}"`);
      }
      if (columns.logContent) fields.push(`"${logStr.replace(/"/g, '""')}"`);
      if (columns.exportedAt) fields.push(`"${nowIso}"`);
      return fields.join(",");
    });

    const sampleBytes = sampleCsvRows.reduce((acc, row) => acc + row.length + 1, 0);
    const avgRowBytes = sampleBytes / sampleSize;
    const totalBytes = Math.round(headerLength + avgRowBytes * logs.length);

    return {
      totalBytes,
      formatted: formatByteSize(totalBytes),
      bytesPerRow: Math.round(avgRowBytes)
    };
  }
};

export const ExportConfirmModal: React.FC<ExportConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  format,
  node,
  filteredLogs,
  filteredLogsCount,
  searchQuery,
  severityFilter,
  startTime,
  endTime,
  exportColumns,
  analysis,
}) => {
  if (!isOpen) return null;

  const totalColumns = Object.keys(exportColumns).length;
  const activeColumns = (Object.keys(exportColumns) as Array<keyof ExportColumnOptions>).filter(
    (key) => exportColumns[key]
  );
  const inactiveColumns = (Object.keys(exportColumns) as Array<keyof ExportColumnOptions>).filter(
    (key) => !exportColumns[key]
  );

  // Effective logs array for analytical computation
  const logsToAnalyze = useMemo(() => {
    if (filteredLogs && filteredLogs.length > 0) return filteredLogs;
    if (node.logs) return node.logs;
    return [];
  }, [filteredLogs, node.logs]);

  // 1. Estimated file size calculation
  const estimatedSize = useMemo(() => {
    return calculateEstimatedSize(logsToAnalyze, format, exportColumns, node, analysis);
  }, [logsToAnalyze, format, exportColumns, node, analysis]);

  // 2. Critical vs. non-critical alerts statistics
  const { criticalCount, nonCriticalCount, criticalPct, nonCriticalPct } = useMemo(() => {
    const critical = logsToAnalyze.filter(
      (log) => log.includes("[CRITICAL]") || log.includes("[ALERT]") || log.includes("ATTACK DETECTED")
    ).length;
    const nonCritical = Math.max(0, logsToAnalyze.length - critical);
    const cPct = logsToAnalyze.length > 0 ? Math.round((critical / logsToAnalyze.length) * 100) : 0;
    const ncPct = logsToAnalyze.length > 0 ? 100 - cPct : 0;
    return {
      criticalCount: critical,
      nonCriticalCount: nonCritical,
      criticalPct: cPct,
      nonCriticalPct: ncPct,
    };
  }, [logsToAnalyze]);

  // 3. Percentage of logs captured within the user-defined time window
  const { hasTimeFilter, timeWindowPercentage, capturedCount, totalAvailableCount } = useMemo(() => {
    const hasFilter = Boolean(startTime || endTime);
    const totalAllLogs = node.logs?.length || logsToAnalyze.length;

    if (!hasFilter) {
      return {
        hasTimeFilter: false,
        timeWindowPercentage: 100,
        capturedCount: totalAllLogs,
        totalAvailableCount: totalAllLogs,
      };
    }

    const matchedInWindow = (node.logs || logsToAnalyze).filter((log) =>
      isLogInTimeWindow(log, startTime, endTime)
    ).length;

    const percentage = totalAllLogs > 0 ? Math.round((matchedInWindow / totalAllLogs) * 100) : 100;

    return {
      hasTimeFilter: true,
      timeWindowPercentage: percentage,
      capturedCount: matchedInWindow,
      totalAvailableCount: totalAllLogs,
    };
  }, [node.logs, logsToAnalyze, startTime, endTime]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" id="export-confirm-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#111114] border border-[#2a2a2e] rounded-xl shadow-2xl max-w-xl w-full flex flex-col overflow-hidden text-gray-200"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#2a2a2e] flex items-center justify-between bg-[#16161a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-950/70 border border-blue-800/60 text-blue-400">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Confirm Log Export
              </h2>
              <p className="text-xs text-gray-400">
                Review export parameters & real-time telemetry before generating the download file.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#222228] transition-colors"
            title="Cancel export"
            id="btn-close-export-confirm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content / Summary */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-sans text-xs">
          
          {/* TOP SUMMARY CARD: Real-time statistics about selected logs */}
          <div
            id="export-realtime-stats-card"
            className="p-4 rounded-xl bg-gradient-to-br from-[#161622] via-[#121218] to-[#0d0d11] border border-blue-900/50 shadow-xl space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-[#242430] pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-950/80 border border-blue-800/50 text-cyan-400">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white tracking-wide font-mono flex items-center gap-2">
                    REAL-TIME LOG TELEMETRY
                    <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/60">
                      LIVE AUDIT
                    </span>
                  </h3>
                  <p className="text-[10px] text-gray-400 font-sans">
                    Calculated for <span className="text-blue-300 font-semibold">{node.name}</span> across active filters
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-gray-400">
                <Zap className="h-3 w-3 text-amber-400" />
                <span>FORMAT:</span>
                <span className={`font-bold px-1.5 py-0.5 rounded uppercase border ${
                  format === "json"
                    ? "bg-amber-950/60 text-amber-300 border-amber-800/50"
                    : "bg-emerald-950/60 text-emerald-300 border-emerald-800/50"
                }`}>
                  {format}
                </span>
              </div>
            </div>

            {/* 3 Real-Time Metric Tiles: Estimated Size, Critical vs Non-Critical, Time Window Capture */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Metric 1: Estimated File Size */}
              <div className="p-3 rounded-lg bg-[#0b0b0f] border border-[#22222b] flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
                  <span className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                    <HardDrive className="h-3.5 w-3.5" />
                    EST. FILE SIZE
                  </span>
                  <span className="text-[9px] text-gray-500 font-sans">~{estimatedSize.bytesPerRow} B/row</span>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-white tracking-tight flex items-baseline gap-1">
                    ~{estimatedSize.formatted}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {activeColumns.length} of {totalColumns} columns selected
                  </div>
                </div>
                <div className="w-full bg-[#1b1b24] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(12, (activeColumns.length / totalColumns) * 100))}%` }}
                    title={`${activeColumns.length} of ${totalColumns} columns`}
                  />
                </div>
              </div>

              {/* Metric 2: Critical vs. Non-Critical Alerts */}
              <div className="p-3 rounded-lg bg-[#0b0b0f] border border-[#22222b] flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    ALERT BREAKDOWN
                  </span>
                  <span className="text-[9px] font-mono text-gray-500">
                    {logsToAnalyze.length} rows
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold font-mono text-white flex items-center gap-1.5">
                    <span className="text-red-400">{criticalCount} Critical</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-gray-300">{nonCriticalCount} Normal</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {criticalPct}% critical threat severity
                  </div>
                </div>
                {/* Visual Ratio Bar */}
                <div className="w-full bg-[#1b1b24] h-1.5 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{ width: `${criticalPct}%` }}
                    title={`Critical Alerts: ${criticalCount} (${criticalPct}%)`}
                  />
                  <div
                    className="h-full bg-blue-500/70 transition-all duration-300"
                    style={{ width: `${nonCriticalPct}%` }}
                    title={`Non-Critical Logs: ${nonCriticalCount} (${nonCriticalPct}%)`}
                  />
                </div>
              </div>

              {/* Metric 3: Percentage of Logs Captured within Time Window */}
              <div className="p-3 rounded-lg bg-[#0b0b0f] border border-[#22222b] flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
                  <span className="flex items-center gap-1.5 text-purple-400 font-semibold">
                    <Clock className="h-3.5 w-3.5" />
                    WINDOW CAPTURE
                  </span>
                  <span className={`text-[9px] font-mono px-1 rounded ${
                    hasTimeFilter
                      ? "bg-purple-950/60 text-purple-300 border border-purple-800/40"
                      : "text-gray-500"
                  }`}>
                    {hasTimeFilter ? "RESTRICTED" : "FULL TIMELINE"}
                  </span>
                </div>
                <div>
                  <div className="text-lg font-bold font-mono text-white tracking-tight flex items-baseline gap-1">
                    <span className={hasTimeFilter ? "text-purple-300" : "text-emerald-400"}>
                      {timeWindowPercentage}%
                    </span>
                    <span className="text-[10px] font-normal text-gray-400 font-sans">
                      of node logs
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5 truncate" title={hasTimeFilter ? `${capturedCount} of ${totalAvailableCount} logs inside [${startTime || "00:00"} - ${endTime || "23:59"}]` : "100% captured • Unrestricted window"}>
                    {hasTimeFilter
                      ? `${capturedCount}/${totalAvailableCount} in time window`
                      : "100% logs captured (no cutoff)"}
                  </div>
                </div>
                {/* Time Window Ratio Bar */}
                <div className="w-full bg-[#1b1b24] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      hasTimeFilter
                        ? "bg-gradient-to-r from-purple-500 to-indigo-400"
                        : "bg-gradient-to-r from-emerald-500 to-teal-400"
                    }`}
                    style={{ width: `${timeWindowPercentage}%` }}
                    title={`Window Capture: ${timeWindowPercentage}%`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Key Summary Cards Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-[#16161b] p-3 rounded-lg border border-[#232328] flex flex-col justify-between">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Database className="h-3 w-3 text-cyan-400 shrink-0" /> Total Rows
              </span>
              <span className="text-lg font-bold font-mono text-white mt-1">
                {filteredLogsCount.toLocaleString()}
              </span>
            </div>

            <div className="bg-[#16161b] p-3 rounded-lg border border-[#232328] flex flex-col justify-between">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <FileText className="h-3 w-3 text-amber-400 shrink-0" /> Target Format
              </span>
              <span className="text-sm font-bold font-mono text-amber-300 mt-1 uppercase flex items-center gap-1">
                {format} <span className="text-[10px] text-gray-400 font-normal">(.{format})</span>
              </span>
            </div>

            <div className="bg-[#16161b] p-3 rounded-lg border border-[#232328] flex flex-col justify-between">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3 text-emerald-400 shrink-0" /> Active Fields
              </span>
              <span className="text-sm font-bold font-mono text-emerald-300 mt-1">
                {activeColumns.length} <span className="text-[10px] text-gray-400 font-normal">/ 9 enabled</span>
              </span>
            </div>
          </div>

          {/* Target Node & Filter Parameters */}
          <div className="bg-[#141418] p-3.5 rounded-lg border border-[#232328] space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-[#222228] pb-2 text-gray-300 font-mono">
              <span className="text-gray-400 text-[11px]">Target Cloud Node:</span>
              <span className="font-bold text-white flex items-center gap-1.5">
                {node.name}
                <span className="text-[10px] text-gray-500 font-normal">({node.ipAddress})</span>
              </span>
            </div>

            <div className="flex items-center justify-between text-gray-300 font-mono text-[11px]">
              <span className="text-gray-400">Severity Scope:</span>
              <span className={`font-semibold ${severityFilter === "critical" ? "text-red-400" : "text-gray-200"}`}>
                {severityFilter === "critical" ? "CRITICAL & ALERTS ONLY" : "ALL SEVERITIES"}
              </span>
            </div>

            <div className="flex items-center justify-between text-gray-300 font-mono text-[11px]">
              <span className="text-gray-400">Search Filter:</span>
              <span className="text-gray-200 truncate max-w-[200px]">
                {searchQuery ? `"${searchQuery}"` : "None (All lines)"}
              </span>
            </div>

            {(startTime || endTime) && (
              <div className="flex items-center justify-between text-gray-300 font-mono text-[11px]">
                <span className="text-gray-400">Time Window:</span>
                <span className="text-cyan-300">
                  {startTime || "Start"} → {endTime || "Now"}
                </span>
              </div>
            )}
          </div>

          {/* Included Columns Badges */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold font-mono text-gray-400 uppercase tracking-wider block">
              Chosen Data Columns ({activeColumns.length}):
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-[#0d0d10] border border-[#222226] rounded-lg">
              {activeColumns.map((colKey) => (
                <span
                  key={colKey}
                  className="px-2 py-0.5 rounded bg-blue-950/70 border border-blue-800/60 text-blue-300 font-mono text-[11px] flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3 w-3 text-blue-400" />
                  {EXPORT_COLUMN_LABELS[colKey]}
                </span>
              ))}
            </div>
            {inactiveColumns.length > 0 && (
              <p className="text-[10px] font-mono text-gray-500 italic">
                * {inactiveColumns.length} column(s) excluded: {inactiveColumns.map((c) => EXPORT_COLUMN_LABELS[c]).join(", ")}
              </p>
            )}
          </div>

          {/* Info Banner */}
          <div className="bg-blue-950/30 border border-blue-900/40 p-2.5 rounded-lg flex items-center gap-2 text-[11px] text-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-400 shrink-0" />
            <span>
              Clicking confirm will generate and trigger a standard browser download for <strong className="text-white">{filteredLogsCount} log rows</strong>.
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#2a2a2e] bg-[#16161a] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#202026] hover:bg-[#2a2a32] text-gray-300 text-xs font-semibold transition-colors"
            id="btn-cancel-export-modal"
          >
            Cancel
          </button>

          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-950/50 transition-all"
            id="btn-confirm-export-start"
          >
            <Download className="h-3.5 w-3.5" />
            Confirm & Start Export
          </button>
        </div>
      </motion.div>
    </div>
  );
};
