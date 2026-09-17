import React, { useState } from "react";
import { CloudNode, ScheduledExportJob, ExportHistoryRecord } from "../types";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Download, 
  FileJson, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw,
  Sliders,
  Sparkles,
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ScheduledExportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: CloudNode[];
  activeNodeId: string;
  jobs: ScheduledExportJob[];
  history: ExportHistoryRecord[];
  onCreateJob: (job: Omit<ScheduledExportJob, "id" | "createdAt" | "nextRunAt" | "runCount">) => void;
  onToggleJobStatus: (id: string) => void;
  onDeleteJob: (id: string) => void;
  onRunJobNow: (id: string) => void;
  onDownloadCompletedExport: (record: ExportHistoryRecord) => void;
  onClearHistory: () => void;
}

export const ScheduledExportsModal: React.FC<ScheduledExportsModalProps> = ({
  isOpen,
  onClose,
  nodes,
  activeNodeId,
  jobs,
  history,
  onCreateJob,
  onToggleJobStatus,
  onDeleteJob,
  onRunJobNow,
  onDownloadCompletedExport,
  onClearHistory
}) => {
  const [activeTab, setActiveTab] = useState<"active_schedules" | "create_new" | "export_history">("active_schedules");

  // Form State
  const [selectedNodeId, setSelectedNodeId] = useState<string>(activeNodeId);
  const [selectedFormat, setSelectedFormat] = useState<"json" | "csv">("json");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical">("all");

  const intervalOptions = [
    { value: 1, label: "Every 1 Minute (Test Mode)" },
    { value: 15, label: "Every 15 Minutes" },
    { value: 30, label: "Every 30 Minutes" },
    { value: 60, label: "Hourly (Every 1 Hour)" },
    { value: 360, label: "Every 6 Hours" },
    { value: 1440, label: "Daily (Every 24 Hours)" }
  ];

  if (!isOpen) return null;

  const handleSubmitNewJob = (e: React.FormEvent) => {
    e.preventDefault();
    const targetNode = nodes.find((n) => n.id === selectedNodeId);
    const nodeName = targetNode ? targetNode.name : "All Nodes";
    const selectedOption = intervalOptions.find((o) => o.value === intervalMinutes);
    const intervalLabel = selectedOption ? selectedOption.label : `Every ${intervalMinutes} mins`;

    onCreateJob({
      nodeId: selectedNodeId,
      nodeName,
      format: selectedFormat,
      intervalMinutes,
      intervalLabel,
      severityFilter,
      status: "active"
    });

    setActiveTab("active_schedules");
  };

  const getFormatBadge = (fmt: "json" | "csv" | "JSON" | "CSV") => {
    const isJson = fmt.toUpperCase() === "JSON";
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
        isJson 
          ? "bg-amber-950/70 text-amber-300 border-amber-800/60" 
          : "bg-emerald-950/70 text-emerald-300 border-emerald-800/60"
      }`}>
        {isJson ? <FileJson className="h-3 w-3 text-amber-400" /> : <FileSpreadsheet className="h-3 w-3 text-emerald-400" />}
        {fmt.toUpperCase()}
      </span>
    );
  };

  const getTimeRemaining = (nextRunAt: number) => {
    const diffMs = nextRunAt - Date.now();
    if (diffMs <= 0) return "Executing now...";
    const seconds = Math.floor((diffMs / 1000) % 60);
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    const hours = Math.floor(diffMs / (1000 * 60 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" id="scheduled-exports-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#111114] border border-[#2a2a2e] rounded-xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh] overflow-hidden text-gray-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2a2a2e] flex items-center justify-between bg-[#16161a]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Automated & Scheduled Log Exports
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-800/60">
                  {jobs.filter((j) => j.status === "active").length} Active Schedules
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Configure background recurring intervals to extract JSON/CSV log segments automatically.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-[#222228] transition-colors"
            title="Close modal"
            id="btn-close-schedule-modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 bg-[#131316] border-b border-[#2a2a2e] text-xs font-mono">
          <button
            onClick={() => setActiveTab("active_schedules")}
            className={`px-3 py-2 border-b-2 font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "active_schedules"
                ? "border-blue-500 text-blue-400 bg-blue-950/20"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
            id="tab-schedules-list"
          >
            <Clock className="h-3.5 w-3.5" />
            Pending Schedules ({jobs.length})
          </button>

          <button
            onClick={() => setActiveTab("create_new")}
            className={`px-3 py-2 border-b-2 font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "create_new"
                ? "border-blue-500 text-blue-400 bg-blue-950/20"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
            id="tab-create-schedule"
          >
            <Plus className="h-3.5 w-3.5" />
            New Recurring Rule
          </button>

          <button
            onClick={() => setActiveTab("export_history")}
            className={`px-3 py-2 border-b-2 font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "export_history"
                ? "border-blue-500 text-blue-400 bg-blue-950/20"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
            id="tab-export-history"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed Archives ({history.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 font-sans">
          {/* TAB 1: ACTIVE SCHEDULES */}
          {activeTab === "active_schedules" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 font-mono">
                  ACTIVE & PENDING AUTOMATED EXPORT RULES
                </span>
                <button
                  onClick={() => setActiveTab("create_new")}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-950/80 hover:bg-blue-900 border border-blue-800/80 text-blue-300 flex items-center gap-1 transition-all"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Schedule
                </button>
              </div>

              {jobs.length === 0 ? (
                <div className="p-8 text-center bg-[#16161a] border border-dashed border-[#2a2a2e] rounded-xl space-y-3">
                  <Clock className="h-8 w-8 text-gray-500 mx-auto" />
                  <p className="text-sm font-semibold text-gray-300">No Automated Export Rules Configured</p>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    Set up recurring background exports to automatically dump logs in JSON or CSV format at hourly, daily, or custom intervals.
                  </p>
                  <button
                    onClick={() => setActiveTab("create_new")}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all inline-flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create First Schedule
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        job.status === "active"
                          ? "bg-[#16161a] border-[#2a2a2e] hover:border-blue-900/50"
                          : "bg-[#121215] border-[#222226] opacity-70"
                      }`}
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5 text-blue-400" />
                            {job.nodeName}
                          </span>
                          {getFormatBadge(job.format)}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202026] text-gray-300 border border-[#2a2a2e]">
                            {job.intervalLabel}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                            job.severityFilter === "critical"
                              ? "bg-red-950/60 text-red-300 border-red-800/50"
                              : "bg-gray-800/60 text-gray-300 border-gray-700/50"
                          }`}>
                            {job.severityFilter === "critical" ? "Critical Logs Only" : "All Severity Stream"}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono text-gray-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-cyan-400" />
                            Next run in:{" "}
                            <span className="text-cyan-300 font-bold">
                              {job.status === "active" ? getTimeRemaining(job.nextRunAt) : "Paused"}
                            </span>
                          </span>
                          <span>Executions: <strong className="text-gray-200">{job.runCount}</strong></span>
                          {job.lastRunAt && <span>Last run: {job.lastRunAt}</span>}
                        </div>
                      </div>

                      {/* Job Controls */}
                      <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#2a2a2e]">
                        <button
                          onClick={() => onRunJobNow(job.id)}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-blue-950/80 hover:bg-blue-900 border border-blue-800/80 text-blue-300 flex items-center gap-1 transition-all"
                          title="Trigger export execution right now"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Run Now
                        </button>

                        <button
                          onClick={() => onToggleJobStatus(job.id)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold border transition-all flex items-center gap-1 ${
                            job.status === "active"
                              ? "bg-amber-950/60 hover:bg-amber-900/80 border-amber-800/60 text-amber-300"
                              : "bg-emerald-950/60 hover:bg-emerald-900/80 border-emerald-800/60 text-emerald-300"
                          }`}
                          title={job.status === "active" ? "Pause automated schedule" : "Resume schedule"}
                        >
                          {job.status === "active" ? (
                            <>
                              <Pause className="h-3 w-3" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="h-3 w-3" /> Resume
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => onDeleteJob(job.id)}
                          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/40 transition-all"
                          title="Delete export schedule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CREATE NEW RULE */}
          {activeTab === "create_new" && (
            <form onSubmit={handleSubmitNewJob} className="space-y-5 bg-[#16161a] p-5 rounded-xl border border-[#2a2a2e]">
              <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#2a2a2e] pb-3">
                <Sliders className="h-4 w-4 text-blue-400" />
                Configure New Recurring Export Rule
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Node Target */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 block font-mono">
                    Target Node Stream
                  </label>
                  <select
                    value={selectedNodeId}
                    onChange={(e) => setSelectedNodeId(e.target.value)}
                    className="w-full bg-[#0d0d0f] border border-[#2a2a2e] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:border-blue-500 focus:outline-none"
                  >
                    {nodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.name} ({node.ipAddress})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recurring Interval */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 block font-mono">
                    Recurring Frequency / Interval
                  </label>
                  <select
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    className="w-full bg-[#0d0d0f] border border-[#2a2a2e] rounded-lg px-3 py-2 text-xs text-gray-200 font-mono focus:border-blue-500 focus:outline-none"
                  >
                    {intervalOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Export Format */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 block font-mono">
                    Export Output Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedFormat("json")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        selectedFormat === "json"
                          ? "bg-amber-950/60 border-amber-800 text-amber-300 font-bold"
                          : "bg-[#0d0d0f] border-[#2a2a2e] text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      <FileJson className="h-4 w-4 text-amber-400" />
                      Compressed JSON
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedFormat("csv")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        selectedFormat === "csv"
                          ? "bg-emerald-950/60 border-emerald-800 text-emerald-300 font-bold"
                          : "bg-[#0d0d0f] border-[#2a2a2e] text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                      Standard CSV
                    </button>
                  </div>
                </div>

                {/* Severity Filter Scope */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 block font-mono">
                    Log Severity Scope
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSeverityFilter("all")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        severityFilter === "all"
                          ? "bg-blue-950/60 border-blue-800 text-blue-300 font-bold"
                          : "bg-[#0d0d0f] border-[#2a2a2e] text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      All Severity Stream
                    </button>

                    <button
                      type="button"
                      onClick={() => setSeverityFilter("critical")}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        severityFilter === "critical"
                          ? "bg-red-950/60 border-red-800 text-red-300 font-bold"
                          : "bg-[#0d0d0f] border-[#2a2a2e] text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      Critical Only
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#2a2a2e] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("active_schedules")}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-950/50 transition-all"
                  id="btn-save-schedule-rule"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Save Schedule Rule
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: COMPLETED EXPORT HISTORY */}
          {activeTab === "export_history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 font-mono">
                  COMPLETED & DUMPED ARCHIVE LOGS ({history.length})
                </span>
                {history.length > 0 && (
                  <button
                    onClick={onClearHistory}
                    className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear History
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="p-8 text-center bg-[#16161a] border border-dashed border-[#2a2a2e] rounded-xl space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-gray-500 mx-auto" />
                  <p className="text-sm font-semibold text-gray-300">No Automated Export Archives Yet</p>
                  <p className="text-xs text-gray-500">
                    When active export rules trigger or manual downloads are executed, completed files will appear here for instant redownload.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((record) => (
                    <div
                      key={record.id}
                      className="p-3.5 rounded-xl bg-[#16161a] border border-[#2a2a2e] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {getFormatBadge(record.format)}
                          <span className="font-mono text-gray-200 font-semibold truncate" title={record.filename}>
                            {record.filename}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                            {record.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-mono">
                          <span>Node: <strong className="text-gray-300">{record.nodeName}</strong></span>
                          <span>Entries: <strong className="text-gray-300">{record.logCount}</strong></span>
                          <span>Time: {record.timestamp}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => onDownloadCompletedExport(record)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-950/60 hover:bg-blue-900 border border-blue-800/60 text-blue-300 flex items-center gap-1.5 shrink-0 transition-all"
                        title="Download archived export file"
                      >
                        <Download className="h-3.5 w-3.5 text-blue-400" />
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#2a2a2e] bg-[#16161a] flex items-center justify-between text-xs text-gray-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Automated Export Daemon Active
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#202026] hover:bg-[#2a2a32] text-gray-200 font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
