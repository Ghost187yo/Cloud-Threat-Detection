import React from "react";
import { CloudNode, ExportColumnOptions } from "../types";
import { EXPORT_COLUMN_LABELS } from "./ExportPreviewModal";
import { Download, X, AlertCircle, FileText, Database, ShieldAlert, Filter, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

interface ExportConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  format: "json" | "csv";
  node: CloudNode;
  filteredLogsCount: number;
  searchQuery: string;
  severityFilter: "all" | "critical";
  startTime: string;
  endTime: string;
  exportColumns: ExportColumnOptions;
}

export const ExportConfirmModal: React.FC<ExportConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  format,
  node,
  filteredLogsCount,
  searchQuery,
  severityFilter,
  startTime,
  endTime,
  exportColumns,
}) => {
  if (!isOpen) return null;

  const activeColumns = (Object.keys(exportColumns) as Array<keyof ExportColumnOptions>).filter(
    (key) => exportColumns[key]
  );
  const inactiveColumns = (Object.keys(exportColumns) as Array<keyof ExportColumnOptions>).filter(
    (key) => !exportColumns[key]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" id="export-confirm-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-[#111114] border border-[#2a2a2e] rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-gray-200"
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
                Review export parameters before generating the download file.
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
                <FileText className="h-3 w-3 text-amber-400 shrink-0" /> Format
              </span>
              <span className="text-sm font-bold font-mono text-amber-300 mt-1 uppercase flex items-center gap-1">
                {format} <span className="text-[10px] text-gray-400 font-normal">(.{format})</span>
              </span>
            </div>

            <div className="bg-[#16161b] p-3 rounded-lg border border-[#232328] flex flex-col justify-between">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3 w-3 text-emerald-400 shrink-0" /> Columns
              </span>
              <span className="text-sm font-bold font-mono text-emerald-300 mt-1">
                {activeColumns.length} <span className="text-[10px] text-gray-400 font-normal">/ 9 active</span>
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
