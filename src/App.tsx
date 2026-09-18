import { useState, useEffect, useRef } from "react";
import { CloudNode, SecurityScenario, ThreatAnalysisResult, ChatMessage, ScheduledExportJob, ExportHistoryRecord, ExportColumnOptions } from "./types";
import { MetricCards } from "./components/MetricCards";
import { InfrastructureMap } from "./components/InfrastructureMap";
import { ThreatSimulator } from "./components/ThreatSimulator";
import { AiInspector } from "./components/AiInspector";
import { SecurityChat } from "./components/SecurityChat";
import { MlThreatClassifier } from "./components/MlThreatClassifier";
import { GmailAlerts } from "./components/GmailAlerts";
import { LogIngestionChart } from "./components/LogIngestionChart";
import { D3RiskHeatmap } from "./components/D3RiskHeatmap";
import { D3ThreatForecastChart } from "./components/D3ThreatForecastChart";
import { ScheduledExportsModal } from "./components/ScheduledExportsModal";
import { ExportPreviewModal, EXPORT_COLUMN_LABELS } from "./components/ExportPreviewModal";
import { ExportConfirmModal } from "./components/ExportConfirmModal";
import { detectThreatsInLogs, getThreatProbabilityScore } from "./utils/threatScore";
import { Shield, Server, Clock, HelpCircle, Activity, LayoutGrid, Terminal, Info, Search, X, Download, FileJson, FileSpreadsheet, Copy, Check, CheckCircle, Calendar, Eye, Loader2, SlidersHorizontal, CheckSquare, Square } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Establish 6 realistic cloud nodes representing distributed services
const INITIAL_NODES: CloudNode[] = [
  {
    id: "node-gateway",
    name: "Hybrid Edge Gateway",
    provider: "Hybrid",
    type: "API Gateway",
    status: "healthy",
    ipAddress: "192.168.1.100",
    region: "Edge-US-East",
    configSnippet: `apiVersion: Gateway\nlisten: 0.0.0.0:8443\nrate_limit: 1000/s\ntls_mode: strict_handshake\nprotocols:\n  - TLSv1.3`,
    logs: [
      "[19:50:01] [INFO] EdgeGateway started. Rate-limiting pool initialized.",
      "[19:51:30] [INFO] Connection established: 44.204.31.2 -> TLSv1.3 handshake ok."
    ]
  },
  {
    id: "node-frontend",
    name: "Frontend Router Web-Pod",
    provider: "AWS",
    type: "Kubernetes Cluster",
    status: "healthy",
    ipAddress: "10.0.4.15",
    region: "us-west-2",
    configSnippet: `server {\n  listen 3000;\n  location /proxy {\n    proxy_pass $arg_url;\n  }\n}`,
    logs: [
      "[19:48:12] [INFO] Frontend Router initialized. Worker count: 4.",
      "[19:52:10] [INFO] Static assets requested by client 198.51.100.41."
    ]
  },
  {
    id: "node-k8s-daemon",
    name: "Syscall Monitor Pod",
    provider: "Azure",
    type: "Kubernetes Cluster",
    status: "healthy",
    ipAddress: "10.240.0.4",
    region: "westeurope",
    configSnippet: `apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: logger\n        securityContext:\n          privileged: true`,
    logs: [
      "[19:45:00] [INFO] DaemonSet registered successfully.",
      "[19:50:45] [INFO] System kernel syscall monitoring loop online."
    ]
  },
  {
    id: "node-billing",
    name: "Billing DB Primary Server",
    provider: "GCP",
    type: "Database Server",
    status: "healthy",
    ipAddress: "10.128.0.22",
    region: "us-east4",
    configSnippet: `# PostgreSQL billing node\nlisten_addresses = '*'\nport = 5432\nshared_buffers = 128MB\nlog_statement = 'all'`,
    logs: [
      "[19:40:12] [INFO] DB Server booted. Connection buffer size set to 256.",
      "[19:46:22] [INFO] Client pool connected successfully."
    ]
  },
  {
    id: "node-auth",
    name: "User Identity Provider",
    provider: "AWS",
    type: "Serverless Function",
    status: "healthy",
    ipAddress: "lambda-arn-9304b",
    region: "us-east-1",
    configSnippet: `export const handler = async (event) => {\n  const token = event.headers.Authorization;\n  return verifyJwt(token);\n};`,
    logs: [
      "[19:49:01] [INFO] Lambda instance initialized (Cold Start: 122ms).",
      "[19:51:11] [INFO] JWT verified for sub: user_94821"
    ]
  },
  {
    id: "node-payment",
    name: "Stripe Integrator Webhook",
    provider: "GCP",
    type: "Serverless Function",
    status: "healthy",
    ipAddress: "cloud-run-pay-v1",
    region: "europe-west3",
    configSnippet: `app.post('/webhook', (req, res) => {\n  const sig = req.headers['stripe-signature'];\n  stripe.webhooks.constructEvent(req.body, sig);\n});`,
    logs: [
      "[19:42:01] [INFO] Cloud Run payment worker ready.",
      "[19:43:00] [INFO] Active webhook route listening on port 3000."
    ]
  }
];

export default function App() {
  const [nodes, setNodes] = useState<CloudNode[]>(INITIAL_NODES);
  const [selectedNode, setSelectedNode] = useState<CloudNode>(INITIAL_NODES[0]);
  const [scenarios, setScenarios] = useState<SecurityScenario[]>([]);
  const [threatsIntercepted, setThreatsIntercepted] = useState(12);
  const [activeCriticals, setActiveCriticals] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<ThreatAnalysisResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [underAttackId, setUnderAttackId] = useState<string | undefined>(undefined);
  const [currentTime, setCurrentTime] = useState<string>("2026-07-18 19:54:57 UTC");
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logSeverityFilter, setLogSeverityFilter] = useState<"all" | "critical">("all");

  // Always get the latest node state from nodes array to ensure logs are fully synchronous
  const activeNode = nodes.find((n) => n.id === selectedNode.id) || selectedNode;

  const [exportStartTime, setExportStartTime] = useState<string>("");
  const [exportEndTime, setExportEndTime] = useState<string>("");

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

  // Real-time filtered log lines
  const filteredLogs = activeNode.logs.filter((log) => {
    const matchesSearch = log.toLowerCase().includes(logSearchQuery.toLowerCase());
    let matchesSeverity = true;
    if (logSeverityFilter === "critical") {
      matchesSeverity = log.includes("[CRITICAL]") || log.includes("[ALERT]") || log.includes("ATTACK DETECTED");
    }
    const matchesTime = isLogInTimeWindow(log, exportStartTime, exportEndTime);
    return matchesSearch && matchesSeverity && matchesTime;
  });

  const [autoScroll, setAutoScroll] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [exportColumns, setExportColumns] = useState<ExportColumnOptions>({
    logIndex: true,
    nodeId: true,
    nodeName: true,
    nodeType: true,
    region: true,
    ipAddress: true,
    severity: true,
    threatProbability: true,
    logContent: true,
    exportedAt: true,
  });

  const handleToggleExportColumn = (key: keyof ExportColumnOptions) => {
    setExportColumns((prev) => {
      const activeCount = Object.values(prev).filter(Boolean).length;
      if (prev[key] && activeCount <= 1) return prev;
      return { ...prev, [key]: !prev[key] };
    });
  };

  const handleSelectAllColumns = () => {
    setExportColumns({
      logIndex: true,
      nodeId: true,
      nodeName: true,
      nodeType: true,
      region: true,
      ipAddress: true,
      severity: true,
      threatProbability: true,
      logContent: true,
      exportedAt: true,
    });
  };

  const handleSelectMinimalColumns = () => {
    setExportColumns({
      logIndex: true,
      nodeId: false,
      nodeName: false,
      nodeType: false,
      region: false,
      ipAddress: false,
      severity: true,
      threatProbability: true,
      logContent: true,
      exportedAt: false,
    });
  };
  const [exportToasts, setExportToasts] = useState<Array<{
    id: string;
    filename: string;
    format: "JSON" | "CSV";
    logCount: number;
    timestamp: string;
  }>>([]);

  // Scheduled Recurring Log Export State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledExportJob[]>([
    {
      id: "job-hourly-ingress",
      nodeId: "node-gateway",
      nodeName: "Hybrid Edge Gateway",
      format: "json",
      intervalMinutes: 60,
      intervalLabel: "Hourly (Every 1 Hour)",
      severityFilter: "all",
      status: "active",
      createdAt: new Date().toLocaleTimeString(),
      nextRunAt: Date.now() + 60 * 60 * 1000,
      runCount: 1,
      lastRunAt: new Date(Date.now() - 30 * 60 * 1000).toLocaleTimeString()
    }
  ]);

  const [exportHistory, setExportHistory] = useState<ExportHistoryRecord[]>([]);

  const addExportToast = (filename: string, format: "JSON" | "CSV", logCount: number) => {
    const newToast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      filename,
      format,
      logCount,
      timestamp: new Date().toLocaleTimeString()
    };
    setExportToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setExportToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setExportToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Execute a scheduled or manual export programmatically
  const executeScheduledJob = (job: ScheduledExportJob | Omit<ScheduledExportJob, "id" | "createdAt" | "nextRunAt" | "runCount">) => {
    const targetNode = nodes.find((n) => n.id === job.nodeId) || activeNode;
    let targetLogs = targetNode.logs;
    if (job.severityFilter === "critical") {
      targetLogs = targetLogs.filter((log) => log.includes("[CRITICAL]") || log.includes("[ALERT]") || log.includes("ATTACK DETECTED"));
    }

    const exportTimestamp = new Date().toISOString();
    const sanitizedNodeId = targetNode.id.replace(/[^a-z0-9_-]/gi, "_");
    const fullFileName = `${sanitizedNodeId}_auto_export_${exportTimestamp.slice(0, 10)}_${Date.now().toString().slice(-4)}.${job.format}`;
    const formatUpper = job.format.toUpperCase() as "JSON" | "CSV";

    let contentString = "";
    let mimeType = "application/json";

    if (job.format === "json") {
      mimeType = "application/json";
      contentString = JSON.stringify({
        node: {
          id: targetNode.id,
          name: targetNode.name,
          type: targetNode.type,
          provider: targetNode.provider,
          ip: targetNode.ipAddress,
          region: targetNode.region
        },
        exportType: "Automated Recurring Scheduled Dump",
        exportedAt: exportTimestamp,
        totalMatchedLogs: targetLogs.length,
        logs: targetLogs
      });
    } else {
      mimeType = "text/csv";
      const hasThreatInLogs = detectThreatsInLogs(targetLogs, analysisResult, targetNode);
      const headers = [
        "Log Index",
        "Node ID",
        "Node Name",
        "Node Type",
        "Region",
        "IP Address",
        "Severity",
        ...(hasThreatInLogs ? ["Threat Probability Score"] : []),
        "Log Content",
        "Exported At"
      ];
      const csvRows = [
        headers.join(","),
        ...targetLogs.map((logStr, idx) => {
          let severity = "INFO";
          if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
            severity = "CRITICAL";
          } else if (logStr.includes("[WARN]")) {
            severity = "WARN";
          }
          const cleanLog = `"${logStr.replace(/"/g, '""')}"`;
          const score = getThreatProbabilityScore(logStr, analysisResult, targetNode);
          const rowFields = [
            idx + 1,
            targetNode.id,
            `"${targetNode.name}"`,
            `"${targetNode.type}"`,
            `"${targetNode.region}"`,
            targetNode.ipAddress,
            severity,
            ...(hasThreatInLogs ? [`"${score}"`] : []),
            cleanLog,
            exportTimestamp
          ];
          return rowFields.join(",");
        })
      ];
      contentString = csvRows.join("\n");
    }

    const historyRecord: ExportHistoryRecord = {
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      jobId: "id" in job ? job.id : undefined,
      nodeId: targetNode.id,
      nodeName: targetNode.name,
      filename: fullFileName,
      format: formatUpper,
      logCount: targetLogs.length,
      type: "Scheduled",
      status: "Completed",
      timestamp: new Date().toLocaleTimeString(),
      downloadData: {
        content: contentString,
        mimeType
      }
    };

    setExportHistory((prev) => [historyRecord, ...prev]);
    addExportToast(fullFileName, formatUpper, targetLogs.length);
  };

  const handleCreateScheduledJob = (newJobData: Omit<ScheduledExportJob, "id" | "createdAt" | "nextRunAt" | "runCount">) => {
    const newJob: ScheduledExportJob = {
      ...newJobData,
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toLocaleTimeString(),
      nextRunAt: Date.now() + newJobData.intervalMinutes * 60 * 1000,
      runCount: 0
    };
    setScheduledJobs((prev) => [...prev, newJob]);
  };

  const handleToggleJobStatus = (id: string) => {
    setScheduledJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, status: j.status === "active" ? "paused" : "active" } : j))
    );
  };

  const handleDeleteJob = (id: string) => {
    setScheduledJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleRunJobNow = (id: string) => {
    const targetJob = scheduledJobs.find((j) => j.id === id);
    if (!targetJob) return;
    executeScheduledJob(targetJob);
    setScheduledJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? {
              ...j,
              lastRunAt: new Date().toLocaleTimeString(),
              nextRunAt: Date.now() + j.intervalMinutes * 60 * 1000,
              runCount: j.runCount + 1
            }
          : j
      )
    );
  };

  const handleDownloadCompletedExport = (record: ExportHistoryRecord) => {
    if (!record.downloadData) return;
    const blob = new Blob([record.downloadData.content], { type: record.downloadData.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", record.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Automated background daemon that executes due scheduled jobs
  useEffect(() => {
    const daemonInterval = setInterval(() => {
      const now = Date.now();
      setScheduledJobs((prevJobs) => {
        let hasChanges = false;
        const updatedJobs = prevJobs.map((job) => {
          if (job.status === "active" && now >= job.nextRunAt) {
            hasChanges = true;
            executeScheduledJob(job);
            return {
              ...job,
              lastRunAt: new Date().toLocaleTimeString(),
              nextRunAt: now + job.intervalMinutes * 60 * 1000,
              runCount: job.runCount + 1
            };
          }
          return job;
        });
        return hasChanges ? updatedJobs : prevJobs;
      });
    }, 5000);

    return () => clearInterval(daemonInterval);
  }, [nodes]);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Copy filtered logs to clipboard as plain text
  const handleCopyLogs = () => {
    if (filteredLogs.length === 0) return;
    const plainTextLogs = filteredLogs.join("\n");
    navigator.clipboard.writeText(plainTextLogs).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy logs to clipboard:", err);
    });
  };

  // Auto-scroll logic when log stream updates
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  // Export current filtered log view as JSON or CSV file
  const handleExportLogs = (targetFormat?: "json" | "csv") => {
    const format = targetFormat || exportFormat;
    if (filteredLogs.length === 0 || isExporting) return;

    setIsExporting(true);
    setExportProgress(15);

    setTimeout(() => {
      setExportProgress(45);
    }, 150);

    setTimeout(() => {
      setExportProgress(80);
    }, 350);

    setTimeout(() => {
      setExportProgress(100);

      const exportTimestamp = new Date().toISOString();
      const structuredLogs = filteredLogs.map((logStr, idx) => {
        let severity = "INFO";
        if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
          severity = "CRITICAL";
        } else if (logStr.includes("[WARN]")) {
          severity = "WARN";
        }

        return {
          logIndex: idx + 1,
          nodeId: activeNode.id,
          nodeName: activeNode.name,
          nodeType: activeNode.type,
          region: activeNode.region,
          ipAddress: activeNode.ipAddress,
          provider: activeNode.provider,
          severity,
          logContent: logStr,
          exportedAt: exportTimestamp
        };
      });

      const sanitizedNodeId = activeNode.id.replace(/[^a-z0-9_-]/gi, "_");
      const windowSuffix = (exportStartTime || exportEndTime) 
        ? `_win_${(exportStartTime || "start").replace(/:/g, "")}_to_${(exportEndTime || "end").replace(/:/g, "")}` 
        : "";
      const filename = `${sanitizedNodeId}_logs_${exportTimestamp.slice(0, 10)}${windowSuffix}`;

      if (format === "json") {
        const jsonLogs = filteredLogs.map((logStr, idx) => {
          let severity = "INFO";
          if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
            severity = "CRITICAL";
          } else if (logStr.includes("[WARN]")) {
            severity = "WARN";
          }

          const rowObj: Record<string, any> = {};
          if (exportColumns.logIndex) rowObj.logIndex = idx + 1;
          if (exportColumns.nodeId) rowObj.nodeId = activeNode.id;
          if (exportColumns.nodeName) rowObj.nodeName = activeNode.name;
          if (exportColumns.nodeType) rowObj.nodeType = activeNode.type;
          if (exportColumns.region) rowObj.region = activeNode.region;
          if (exportColumns.ipAddress) rowObj.ipAddress = activeNode.ipAddress;
          if (exportColumns.severity) rowObj.severity = severity;
          if (exportColumns.logContent) rowObj.logContent = logStr;
          if (exportColumns.exportedAt) rowObj.exportedAt = exportTimestamp;

          return rowObj;
        });

        const jsonContent = JSON.stringify({
          node: {
            id: activeNode.id,
            name: activeNode.name,
            type: activeNode.type,
            region: activeNode.region,
            ipAddress: activeNode.ipAddress,
            status: activeNode.status
          },
          filter: {
            query: logSearchQuery || "none",
            severityFilter: logSeverityFilter,
            timeWindow: {
              startTime: exportStartTime || "unrestricted",
              endTime: exportEndTime || "unrestricted"
            }
          },
          exportedAt: exportTimestamp,
          activeColumnsCount: Object.values(exportColumns).filter(Boolean).length,
          totalMatchedLogs: filteredLogs.length,
          logs: jsonLogs
        });

        const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${filename}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        const fullFileName = `${filename}.json`;
        addExportToast(fullFileName, "JSON", filteredLogs.length);
      } else if (format === "csv") {
        const hasThreatInLogs = detectThreatsInLogs(filteredLogs, analysisResult, activeNode);
        const includeThreatScore = hasThreatInLogs && (exportColumns.threatProbability !== false);

        const activeHeaders: string[] = [];
        if (exportColumns.logIndex) activeHeaders.push("Log Index");
        if (exportColumns.nodeId) activeHeaders.push("Node ID");
        if (exportColumns.nodeName) activeHeaders.push("Node Name");
        if (exportColumns.nodeType) activeHeaders.push("Node Type");
        if (exportColumns.region) activeHeaders.push("Region");
        if (exportColumns.ipAddress) activeHeaders.push("IP Address");
        if (exportColumns.severity) activeHeaders.push("Severity");
        if (includeThreatScore) activeHeaders.push("Threat Probability Score");
        if (exportColumns.logContent) activeHeaders.push("Log Content");
        if (exportColumns.exportedAt) activeHeaders.push("Exported At");

        const csvRows = [
          activeHeaders.join(","),
          ...filteredLogs.map((logStr, idx) => {
            let severity = "INFO";
            if (logStr.includes("[CRITICAL]") || logStr.includes("[ALERT]") || logStr.includes("ATTACK DETECTED")) {
              severity = "CRITICAL";
            } else if (logStr.includes("[WARN]")) {
              severity = "WARN";
            }

            const fields: (string | number)[] = [];
            if (exportColumns.logIndex) fields.push(idx + 1);
            if (exportColumns.nodeId) fields.push(`"${activeNode.id}"`);
            if (exportColumns.nodeName) fields.push(`"${activeNode.name.replace(/"/g, '""')}"`);
            if (exportColumns.nodeType) fields.push(`"${activeNode.type.replace(/"/g, '""')}"`);
            if (exportColumns.region) fields.push(`"${activeNode.region}"`);
            if (exportColumns.ipAddress) fields.push(`"${activeNode.ipAddress}"`);
            if (exportColumns.severity) fields.push(`"${severity}"`);
            if (includeThreatScore) {
              const score = getThreatProbabilityScore(logStr, analysisResult, activeNode);
              fields.push(`"${score}"`);
            }
            if (exportColumns.logContent) fields.push(`"${logStr.replace(/"/g, '""')}"`);
            if (exportColumns.exportedAt) fields.push(`"${exportTimestamp}"`);

            return fields.join(",");
          })
        ];

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        const fullFileName = `${filename}.csv`;
        addExportToast(fullFileName, "CSV", filteredLogs.length);
      }

      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 300);
    }, 550);
  };

  // Keep a mock live clock going
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toUTCString().replace("GMT", "UTC"));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch scenarios from Express server
  useEffect(() => {
    fetch("/api/scenarios")
      .then((res) => res.json())
      .then((data) => {
        if (data.scenarios) {
          setScenarios(data.scenarios);
        }
      })
      .catch((err) => console.error("Error loading scenarios from server:", err));
  }, []);

  // Trigger Gemini Analysis pipeline
  const runAnalysis = async (title: string, payload: string, logSnippet: string, customMode = false) => {
    setIsAnalysisLoading(true);
    setAnalysisResult(null);

    try {
      const response = await fetch("/api/analyze-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, payload, logSnippet, customMode }),
      });
      const data = await response.json();
      setAnalysisResult(data);

      // Increment statistics based on verified threat urgency
      if (data.threatIdentified) {
        setThreatsIntercepted((prev) => prev + 1);
      }
    } catch (err) {
      console.error("Analysis request failed:", err);
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  // Inject a simulated Preset Scenario
  const handleTriggerScenario = (scenario: SecurityScenario) => {
    // Determine which node to target based on the scenario
    let targetNodeId = "node-gateway";
    if (scenario.id === "scen-02") targetNodeId = "node-frontend";
    if (scenario.id === "scen-03") targetNodeId = "node-k8s-daemon";
    if (scenario.id === "scen-04") targetNodeId = "node-billing";

    setUnderAttackId(targetNodeId);

    // Update Nodes State to reflect compromise
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id === targetNodeId) {
          const updatedLogs = [
            `[SIMULATED ATTACK DETECTED] Trigger: ${scenario.name}`,
            `[IP AUDIT] Source IP mapped to suspicious external route.`,
            ...scenario.logSnippet.split("\n"),
            ...n.logs,
          ];
          return {
            ...n,
            status: "compromised" as const,
            activePayload: scenario.payload,
            logs: updatedLogs.slice(0, 8), // keep logs clean
          };
        }
        return n;
      })
    );

    // Update active KPI metrics
    setActiveCriticals((prev) => prev + 1);

    // Find the targeted node object and highlight it
    const updatedNode = nodes.find((n) => n.id === targetNodeId);
    if (updatedNode) {
      setSelectedNode({
        ...updatedNode,
        status: "compromised",
        activePayload: scenario.payload,
        logs: [
          `[SIMULATED ATTACK DETECTED] Trigger: ${scenario.name}`,
          `[IP AUDIT] Source IP mapped to suspicious external route.`,
          ...scenario.logSnippet.split("\n"),
          ...updatedNode.logs,
        ].slice(0, 8),
      });
    }

    // Fire the Gemini pipeline
    runAnalysis(scenario.name, scenario.payload, scenario.logSnippet, false);
  };

  // Trigger Custom ad-hoc code/log submission
  const handleTriggerCustom = (title: string, payload: string, logSnippet: string) => {
    setUnderAttackId(selectedNode.id);

    // Inject custom payload and logs into the currently selected node
    setNodes((prevNodes) =>
      prevNodes.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            status: "suspicious" as const,
            activePayload: payload,
            logs: [
              `[AD-HOC ANALYTIC AUDIT TRIGGERED] Title: ${title}`,
              ...logSnippet.split("\n"),
              ...n.logs,
            ].slice(0, 8),
          };
        }
        return n;
      })
    );

    setSelectedNode((prev) => ({
      ...prev,
      status: "suspicious",
      activePayload: payload,
      logs: [
        `[AD-HOC ANALYTIC AUDIT TRIGGERED] Title: ${title}`,
        ...logSnippet.split("\n"),
        ...prev.logs,
      ].slice(0, 8),
    }));

    // Fire custom mode with Gemini
    runAnalysis(title, payload, logSnippet, true);
  };

  // Conversational Assistant message sender
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    };

    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedHistory,
          activeContext: selectedNode,
        }),
      });
      const data = await response.json();

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        content: data.text || "I was unable to retrieve a response from the security matrix.",
        timestamp: new Date().toLocaleTimeString(),
      };

      setChatHistory((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Chat request failed:", err);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleClearChat = () => {
    setChatHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-[#e1e1e3] flex flex-col font-sans" id="app-root">
      {/* Visual background atmospheric elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/[0.03] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-12 right-1/4 w-[600px] h-[600px] bg-blue-500/[0.01] rounded-full blur-3xl pointer-events-none" />

      {/* Main Control Header */}
      <header className="border-b border-[#2a2a2c] bg-[#111113]/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between" id="app-header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded shadow-md">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              CLOUD THREAT DETECTOR
              <span className="text-[9px] bg-blue-950/40 text-blue-400 border border-blue-900/30 px-2 py-0.5 rounded font-mono font-semibold">
                v3.5 Live Agent
              </span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5 font-mono uppercase tracking-wider">
              REAL-TIME SECURITY AI & ZERO-DAY THREAT HUNTER
            </p>
          </div>
        </div>

        {/* Live system metadata ticker */}
        <div className="hidden lg:flex items-center gap-6 text-[11px] font-mono text-gray-400 bg-[#0d0d0f] border border-[#2a2a2c] rounded px-4 py-2">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-blue-400" />
            {currentTime}
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-green-400" />
            Egress status: SECURE
          </span>
          <span className="text-blue-400">
            Active Nodes: {nodes.length}
          </span>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 p-6 space-y-6 relative z-10 max-w-7xl w-full mx-auto" id="app-workspace">
        
        {/* Real-Time Log Ingestion Frequency Header Monitor */}
        <LogIngestionChart
          nodes={nodes}
          selectedNodeId={selectedNode.id}
          onSelectNode={(node) => setSelectedNode(node)}
        />
        
        {/* KPI stats cards row */}
        <MetricCards
          threatsIntercepted={threatsIntercepted}
          activeCriticals={activeCriticals}
          falsePositiveRate="0.04%"
          scannerAccuracy="99.2%"
        />

        {/* Distributed cloud infrastructure diagram */}
        <InfrastructureMap
          nodes={nodes}
          selectedNodeId={selectedNode.id}
          onSelectNode={(node) => setSelectedNode(node)}
          underAttackNodeId={underAttackId}
        />

        {/* D3 Regional Threat & Security Risk Heatmap */}
        <D3RiskHeatmap
          nodes={nodes}
          selectedNodeId={selectedNode.id}
          onSelectNode={(node) => setSelectedNode(node)}
          underAttackNodeId={underAttackId}
        />

        {/* D3 Predictive Threat Probability Forecast Line Chart */}
        <D3ThreatForecastChart
          nodes={nodes}
          selectedNodeId={selectedNode.id}
          underAttackNodeId={underAttackId}
        />

        {/* Two-Column Workspace split: Threat Selector / Terminal & AI Analysis / Virtual Specialist Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="workspace-columns-layout">
          
          {/* Column Left (Span 7) - Injector controls and selected node logs terminal */}
          <div className="lg:col-span-7 space-y-6">
            <ThreatSimulator
              scenarios={scenarios}
              onTriggerScenario={handleTriggerScenario}
              isLoading={isAnalysisLoading}
              onTriggerCustom={handleTriggerCustom}
            />

            {/* Selected Node Details & Log Terminal */}
            <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-5 shadow-xl" id="logs-terminal-panel">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#2a2a2c]">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-green-400" />
                    SECURE SANDBOX CONTAINER CONSOLE
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Viewing trace telemetry for <span className="text-blue-400 font-semibold font-mono">{activeNode.name}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2.5 self-start md:self-auto">
                  {/* Auto-scroll Toggle */}
                  <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded border text-[11px] font-mono transition-all ${
                      autoScroll
                        ? "bg-blue-950/40 border-blue-900/40 text-blue-400 font-semibold"
                        : "bg-[#0d0d0f] border-[#2a2a2c] text-gray-500 hover:text-gray-300 hover:border-gray-600"
                    }`}
                    title={autoScroll ? "Disable Auto-scroll to inspect older logs" : "Enable Auto-scroll to view real-time log activity"}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${autoScroll ? "bg-blue-500 animate-pulse" : "bg-gray-600"}`} />
                    Auto-scroll: {autoScroll ? "ON" : "OFF"}
                  </button>
                  <span className="text-[10px] font-mono text-gray-500 uppercase bg-[#0d0d0f] border border-[#2a2a2c] px-2 py-1 rounded">
                    {activeNode.ipAddress}
                  </span>
                </div>
              </div>

              {/* Real-time Search & Filter Controls */}
              <div className="mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Search Input */}
                <div className="flex-1 flex items-center gap-2 bg-[#0d0d0f] border border-[#2a2a2c] rounded px-3 py-1.5 focus-within:border-blue-500 transition-all">
                  <Search className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                  <input
                    type="text"
                    placeholder="Filter log lines in real-time... (e.g. CRITICAL, INFO, gateway, webhook)"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-xs text-[#e1e1e3] placeholder-gray-500 focus:outline-none"
                  />
                  {logSearchQuery && (
                    <button
                      onClick={() => setLogSearchQuery("")}
                      className="text-gray-500 hover:text-white transition-colors p-0.5"
                      title="Clear filter"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {logSearchQuery && (
                    <span className="text-[9px] font-mono text-blue-400 bg-blue-950/40 border border-blue-900/20 px-1.5 py-0.5 rounded">
                      {filteredLogs.length} matched
                    </span>
                  )}
                </div>

                {/* Severity Toggle, Time Window Picker & Log Export Action Group */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-[#0d0d0f] border border-[#2a2a2c] rounded p-1 shrink-0 text-xs font-mono">
                    <button
                      onClick={() => setLogSeverityFilter("all")}
                      className={`px-3 py-1 rounded text-[11px] transition-all font-semibold ${
                        logSeverityFilter === "all"
                          ? "bg-[#1d1d21] border border-[#3a3a3c] text-white"
                          : "text-gray-400 hover:text-[#e1e1e3] border border-transparent"
                      }`}
                    >
                      All Logs ({activeNode.logs.length})
                    </button>
                    <button
                      onClick={() => setLogSeverityFilter("critical")}
                      className={`px-3 py-1 rounded text-[11px] transition-all font-semibold flex items-center gap-1.5 ${
                        logSeverityFilter === "critical"
                          ? "bg-red-950/40 border border-red-900/40 text-red-400"
                          : "text-gray-400 hover:text-red-400 border border-transparent"
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
                      Critical Only ({activeNode.logs.filter(log => log.includes("[CRITICAL]") || log.includes("[ALERT]") || log.includes("ATTACK DETECTED")).length})
                    </button>
                  </div>

                  {/* Time Window Filter Segment Picker */}
                  <div className="flex items-center gap-1.5 bg-[#0d0d0f] border border-[#2a2a2c] rounded p-1 shrink-0 text-xs font-mono" id="log-time-window-group">
                    <span className="text-[10px] text-gray-400 px-1 font-semibold flex items-center gap-1 select-none">
                      <Clock className="h-3 w-3 text-cyan-400" /> Time Window:
                    </span>

                    <div className="flex items-center gap-1">
                      <input
                        type="time"
                        step="1"
                        value={exportStartTime}
                        onChange={(e) => setExportStartTime(e.target.value)}
                        className="bg-[#161619] border border-[#2a2a2c] text-gray-200 text-[11px] font-mono rounded px-1.5 py-0.5 focus:border-cyan-500 focus:outline-none"
                        title="Optional Start Time (HH:MM or HH:MM:SS)"
                        id="input-export-start-time"
                      />
                      <span className="text-gray-500 text-[10px] select-none font-sans">to</span>
                      <input
                        type="time"
                        step="1"
                        value={exportEndTime}
                        onChange={(e) => setExportEndTime(e.target.value)}
                        className="bg-[#161619] border border-[#2a2a2c] text-gray-200 text-[11px] font-mono rounded px-1.5 py-0.5 focus:border-cyan-500 focus:outline-none"
                        title="Optional End Time (HH:MM or HH:MM:SS)"
                        id="input-export-end-time"
                      />

                      {(exportStartTime || exportEndTime) ? (
                        <button
                          onClick={() => {
                            setExportStartTime("");
                            setExportEndTime("");
                          }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/60 text-amber-300 transition-all flex items-center gap-0.5"
                          title="Reset time window filter"
                          id="btn-reset-time-filter"
                        >
                          <X className="h-2.5 w-2.5" />
                          Reset
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 pl-0.5">
                          <button
                            onClick={() => {
                              setExportStartTime("19:40");
                              setExportEndTime("19:50");
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-[#161619] hover:bg-cyan-950/50 hover:text-cyan-300 border border-[#2a2a2c] text-gray-400 transition-all"
                            title="Quick filter: 19:40 to 19:50 window"
                          >
                            19:40-19:50
                          </button>
                          <button
                            onClick={() => {
                              setExportStartTime("19:50");
                              setExportEndTime("20:00");
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-[#161619] hover:bg-cyan-950/50 hover:text-cyan-300 border border-[#2a2a2c] text-gray-400 transition-all"
                            title="Quick filter: 19:50 to 20:00 window"
                          >
                            19:50-20:00
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Export Filtered Log View Button Group with Format Toggle */}
                  <div className="flex items-center gap-1.5 bg-[#0d0d0f] border border-[#2a2a2c] rounded p-1 shrink-0 text-xs font-mono" id="log-export-group">
                    <span className="text-[10px] text-gray-500 px-1 font-semibold flex items-center gap-1 select-none">
                      Format:
                    </span>
                    
                    {/* Format Selector Toggle Pills */}
                    <div className="flex items-center gap-1 bg-[#161619] border border-[#2a2a2c] rounded p-0.5">
                      <button
                        onClick={() => setExportFormat("json")}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all flex items-center gap-1 ${
                          exportFormat === "json"
                            ? "bg-amber-950/70 text-amber-300 border border-amber-800/70 shadow-sm font-bold"
                            : "text-gray-400 hover:text-gray-200 border border-transparent"
                        }`}
                        title="Select Compressed JSON export format"
                        id="toggle-export-json"
                      >
                        <FileJson className={`h-3 w-3 ${exportFormat === "json" ? "text-amber-400" : "text-gray-500"}`} />
                        Compressed JSON
                        {exportFormat === "json" && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
                      </button>
                      
                      <button
                        onClick={() => setExportFormat("csv")}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all flex items-center gap-1 ${
                          exportFormat === "csv"
                            ? "bg-emerald-950/70 text-emerald-300 border border-emerald-800/70 shadow-sm font-bold"
                            : "text-gray-400 hover:text-gray-200 border border-transparent"
                        }`}
                        title="Select Standard CSV export format"
                        id="toggle-export-csv"
                      >
                        <FileSpreadsheet className={`h-3 w-3 ${exportFormat === "csv" ? "text-emerald-400" : "text-gray-500"}`} />
                        Standard CSV
                        {exportFormat === "csv" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />}
                      </button>
                    </div>

                    {/* Column Selector Dropdown Toggle */}
                    <div className="relative">
                      <button
                        onClick={() => setShowColumnDropdown(!showColumnDropdown)}
                        className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                          showColumnDropdown
                            ? "bg-blue-950/80 border-blue-700 text-blue-300"
                            : "bg-[#161619] hover:bg-blue-950/50 hover:text-blue-300 border-[#2a2a2c] text-gray-300"
                        }`}
                        title="Toggle specific log columns/fields to include in export"
                        id="btn-toggle-column-dropdown"
                      >
                        <SlidersHorizontal className="h-3 w-3 text-cyan-400" />
                        Columns ({Object.values(exportColumns).filter(Boolean).length}/9)
                      </button>

                      {showColumnDropdown && (
                        <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#111115] border border-[#2e2e34] rounded-lg shadow-2xl p-3 z-30 space-y-2">
                          <div className="flex items-center justify-between pb-1.5 border-b border-[#222228] text-[11px] font-bold text-gray-200">
                            <span>Toggle Export Columns</span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                onClick={handleSelectAllColumns}
                                className="text-blue-400 hover:underline"
                              >
                                All
                              </button>
                              <span className="text-gray-600">|</span>
                              <button
                                onClick={handleSelectMinimalColumns}
                                className="text-gray-400 hover:text-blue-300 hover:underline"
                              >
                                Minimal
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                            {(Object.keys(EXPORT_COLUMN_LABELS) as Array<keyof ExportColumnOptions>).map((colKey) => {
                              const isChecked = exportColumns[colKey];
                              return (
                                <button
                                  key={colKey}
                                  onClick={() => handleToggleExportColumn(colKey)}
                                  className={`w-full px-2 py-1 rounded text-left text-[11px] flex items-center justify-between transition-colors ${
                                    isChecked
                                      ? "bg-blue-950/50 text-blue-200 font-semibold"
                                      : "hover:bg-[#18181e] text-gray-400"
                                  }`}
                                >
                                  <span className="truncate">{EXPORT_COLUMN_LABELS[colKey]}</span>
                                  {isChecked ? (
                                    <CheckSquare className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                  ) : (
                                    <Square className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Preview Sample Button */}
                    <button
                      onClick={() => setIsPreviewModalOpen(true)}
                      disabled={filteredLogs.length === 0}
                      className="px-2 py-1 rounded text-[11px] font-semibold bg-[#161619] hover:bg-blue-950/60 hover:text-blue-300 border border-[#2a2a2c] hover:border-blue-800/40 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1"
                      title="Preview sample of first 10 rows in selected format"
                      id="btn-preview-export"
                    >
                      <Eye className="h-3 w-3 text-blue-400" />
                      Preview
                    </button>

                    {/* Export Action Button */}
                    <button
                      onClick={() => setIsConfirmModalOpen(true)}
                      disabled={filteredLogs.length === 0 || isExporting}
                      className="relative overflow-hidden px-2.5 py-1 rounded text-[11px] font-semibold bg-blue-950/40 hover:bg-blue-900/60 text-blue-300 border border-blue-800/50 hover:border-blue-700/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 ml-0.5"
                      title={`Export filtered logs as ${exportFormat === "json" ? "Compressed JSON" : "Standard CSV"}`}
                      id="btn-export-file"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="h-3 w-3 text-cyan-400 animate-spin shrink-0" />
                          <span>Generating ({exportProgress}%)</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-3 w-3 text-blue-400" />
                          <span>Export ({exportFormat.toUpperCase()})</span>
                        </>
                      )}

                      {/* Visual Progress Bar Indicator */}
                      {isExporting && (
                        <div
                          className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-150"
                          style={{ width: `${exportProgress}%` }}
                        />
                      )}
                    </button>

                    {/* Scheduled Recurring Exports Manager Toggle */}
                    <button
                      onClick={() => setIsScheduleModalOpen(true)}
                      className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#161619] hover:bg-cyan-950/60 hover:text-cyan-300 border border-[#2a2a2c] hover:border-cyan-800/50 text-gray-300 transition-all flex items-center gap-1.5"
                      title="Manage recurring scheduled log exports and view automated dump archives"
                      id="btn-open-schedules"
                    >
                      <Calendar className="h-3 w-3 text-cyan-400" />
                      Schedules ({scheduledJobs.filter((j) => j.status === "active").length})
                    </button>

                    {/* Copy to Clipboard */}
                    <button
                      onClick={handleCopyLogs}
                      disabled={filteredLogs.length === 0}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-all flex items-center gap-1 ${
                        isCopied
                          ? "bg-emerald-950/60 border-emerald-800/60 text-emerald-400 font-bold"
                          : "bg-[#161619] hover:bg-blue-950/60 hover:text-blue-400 border-[#2a2a2c] hover:border-blue-800/40 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                      title="Copy currently filtered logs as plain text to clipboard"
                      id="btn-copy-logs"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-blue-400" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Screen */}
              <div className="bg-[#0d0d0f] border border-[#2a2a2c] rounded p-4 font-mono text-[11px] space-y-3 leading-relaxed shadow-inner">
                
                {/* Node configuration dump */}
                <div>
                  <span className="text-blue-400 block mb-1"># CAT CONFIGURATION:</span>
                  <pre className="text-gray-400 bg-[#161618] p-2 rounded border border-[#2a2a2c]/60 max-h-24 overflow-y-auto">
                    <code>{activeNode.configSnippet}</code>
                  </pre>
                </div>

                {/* Node logs trace stream */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-orange-400 block"># TAIL ACTIVE LOGS:</span>
                    {(logSearchQuery || logSeverityFilter === "critical") && (
                      <span className="text-[10px] text-gray-500 font-sans font-medium">
                        Active filter: {logSeverityFilter === "critical" && "CRITICAL ONLY"}{logSearchQuery && `${logSeverityFilter === "critical" ? " + " : ""}"${logSearchQuery}"`}
                      </span>
                    )}
                  </div>
                  <div ref={logsContainerRef} className="space-y-1.5 max-h-36 overflow-y-auto">
                    {filteredLogs.length === 0 ? (
                      <p className="text-red-400 italic bg-red-950/20 px-2 py-1.5 border border-red-900/30 rounded">
                        No logs match active filters
                      </p>
                    ) : (
                      filteredLogs.map((log, index) => {
                        let color = "text-gray-400";
                        if (log.includes("[CRITICAL]") || log.includes("[ALERT]") || log.includes("ATTACK DETECTED")) {
                          color = "text-red-400 font-bold bg-red-950/20 px-1.5 py-0.5 rounded";
                        } else if (log.includes("[WARN]")) {
                          color = "text-orange-400 bg-orange-950/20 px-1.5 py-0.5 rounded";
                        }
                        const lineNum = String(index + 1).padStart(2, "0");
                        return (
                          <div key={index} className={`flex items-start gap-2.5 ${color}`}>
                            <span className="text-gray-600 font-mono text-[10px] select-none shrink-0 w-6 text-right pt-0.5 font-medium border-r border-[#2a2a2c] pr-1.5">
                              {lineNum}
                            </span>
                            <span className="break-all flex-1">{log}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {activeNode.activePayload && (
                  <div className="pt-2 border-t border-[#2a2a2c] animate-pulse">
                    <span className="text-red-400 block mb-1"># LAST TRIGGER PAYLOAD RECORDED:</span>
                    <pre className="bg-red-950/10 text-red-300 p-2 rounded border border-red-950/30 overflow-x-auto text-[10px]">
                      <code>{activeNode.activePayload}</code>
                    </pre>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-gray-500 font-mono">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                <span>Raw traces are piped downstream to the telemetry hub for real-time AI security audits.</span>
              </div>
            </div>
          </div>

          {/* Column Right (Span 5) - AI Audit Intelligence & Interactive Chat Assistant */}
          <div className="lg:col-span-5 space-y-6">
            <AiInspector
              analysis={analysisResult}
              isLoading={isAnalysisLoading}
              activeNodeName={activeNode.name}
            />

            <SecurityChat
              chatHistory={chatHistory}
              onSendMessage={handleSendMessage}
              isLoading={isChatLoading}
              onClearChat={handleClearChat}
              activeContextNode={activeNode}
            />
          </div>

        </div>

        {/* Machine Learning Model Sandbox */}
        <div className="pt-4">
          <MlThreatClassifier />
        </div>

        {/* Gmail Alert Integration Center */}
        <div className="pt-4">
          <GmailAlerts
            activeNode={activeNode}
            aiRemediation={analysisResult?.remediation}
          />
        </div>
      </main>

      {/* Footer Info credit */}
      <footer className="border-t border-[#2a2a2c] bg-[#0d0d0f] py-6 mt-12 text-center text-xs text-gray-500 font-mono" id="app-footer-credit">
        <p>
          Cloud Threat Detector Platform • Fueled by Gemini 3.5 Server-Side Threat Audits.
        </p>
        <p className="mt-1 text-gray-600 text-[10px]">
          Container Ingress 127.0.0.1:3000 • Production Sandboxed Environment
        </p>
      </footer>

      {/* Export Toast Notification Overlay */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none" id="export-toast-overlay">
        <AnimatePresence>
          {exportToasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto shadow-2xl rounded-lg border bg-[#121216]/95 backdrop-blur-md p-3.5 text-xs text-gray-200 flex items-start gap-3 relative overflow-hidden ${
                toast.format === "JSON" 
                  ? "border-amber-800/60 border-l-4 border-l-amber-500 shadow-amber-950/20" 
                  : "border-emerald-800/60 border-l-4 border-l-emerald-500 shadow-emerald-950/20"
              }`}
            >
              <div className="p-1.5 rounded-md bg-[#1a1a20] shrink-0 mt-0.5">
                {toast.format === "JSON" ? (
                  <FileJson className="h-4 w-4 text-amber-400" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-100 flex items-center gap-1 text-[13px]">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    Export Successful
                  </span>
                  <span className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded uppercase ${
                    toast.format === "JSON" 
                      ? "bg-amber-950/80 text-amber-300 border border-amber-800/50" 
                      : "bg-emerald-950/80 text-emerald-300 border border-emerald-800/50"
                  }`}>
                    {toast.format}
                  </span>
                </div>

                <p className="text-gray-300 text-[11px] font-mono truncate mb-1" title={toast.filename}>
                  File: <span className="text-white font-semibold">{toast.filename}</span>
                </p>

                <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                  <span>{toast.logCount} log entries</span>
                  <span>{toast.timestamp}</span>
                </div>
              </div>

              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-500 hover:text-gray-300 p-1 rounded hover:bg-[#1a1a20] transition-colors absolute top-2 right-2"
                title="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Recurring Scheduled Exports Modal */}
      <ScheduledExportsModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        nodes={nodes}
        activeNodeId={activeNode.id}
        jobs={scheduledJobs}
        history={exportHistory}
        onCreateJob={handleCreateScheduledJob}
        onToggleJobStatus={handleToggleJobStatus}
        onDeleteJob={handleDeleteJob}
        onRunJobNow={handleRunJobNow}
        onDownloadCompletedExport={handleDownloadCompletedExport}
        onClearHistory={() => setExportHistory([])}
      />
      {/* Export Sample Preview Modal */}
      <ExportPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        format={exportFormat}
        node={activeNode}
        filteredLogs={filteredLogs}
        searchQuery={logSearchQuery}
        severityFilter={logSeverityFilter}
        startTime={exportStartTime}
        endTime={exportEndTime}
        exportColumns={exportColumns}
        analysis={analysisResult}
        onToggleColumn={handleToggleExportColumn}
        onSelectAllColumns={handleSelectAllColumns}
        onSelectMinimalColumns={handleSelectMinimalColumns}
        onConfirmExport={() => setIsConfirmModalOpen(true)}
      />
      {/* Export Confirmation Summary Modal */}
      <ExportConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={() => handleExportLogs()}
        format={exportFormat}
        node={activeNode}
        filteredLogs={filteredLogs}
        filteredLogsCount={filteredLogs.length}
        searchQuery={logSearchQuery}
        severityFilter={logSeverityFilter}
        startTime={exportStartTime}
        endTime={exportEndTime}
        exportColumns={exportColumns}
        analysis={analysisResult}
      />
    </div>
  );
}
