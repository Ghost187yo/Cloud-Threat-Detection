export interface CloudNode {
  id: string;
  name: string;
  provider: "AWS" | "GCP" | "Azure" | "Hybrid";
  type: "Kubernetes Cluster" | "Serverless Function" | "Database Server" | "API Gateway" | "Virtual Machine";
  status: "healthy" | "suspicious" | "compromised";
  ipAddress: string;
  region: string;
  activePayload?: string;
  logs: string[];
  configSnippet: string;
}

export interface SecurityScenario {
  id: string;
  name: string;
  service: string;
  environment: string;
  category: string;
  urgency: string;
  timestamp: string;
  payload: string;
  logSnippet: string;
  description: string;
}

export interface ThreatAnalysisResult {
  threatIdentified: boolean;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  threatProbabilityScore?: string | number;
  vulnerabilityType: string;
  mechanismExplainer: string;
  falsePositiveLikelihood: string;
  remediation: {
    summary: string;
    patchCode: string;
    patchLanguage: string;
  };
  zeroDayAnalysis: string;
}

export interface ExportColumnOptions {
  logIndex: boolean;
  nodeId: boolean;
  nodeName: boolean;
  nodeType: boolean;
  region: boolean;
  ipAddress: boolean;
  severity: boolean;
  threatProbability?: boolean;
  logContent: boolean;
  exportedAt: boolean;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ScheduledExportJob {
  id: string;
  nodeId: string;
  nodeName: string;
  format: "json" | "csv";
  intervalMinutes: number; // e.g., 15, 30, 60 (hourly), 360 (6 hours), 1440 (daily)
  intervalLabel: string;
  severityFilter: "all" | "critical";
  status: "active" | "paused";
  createdAt: string;
  nextRunAt: number; // Unix timestamp in ms
  lastRunAt?: string;
  runCount: number;
}

export interface ExportHistoryRecord {
  id: string;
  jobId?: string;
  nodeId: string;
  nodeName: string;
  filename: string;
  format: "JSON" | "CSV";
  logCount: number;
  type: "Scheduled" | "Manual";
  status: "Completed" | "Pending" | "Failed";
  timestamp: string;
  downloadData?: {
    content: string;
    mimeType: string;
  };
}

