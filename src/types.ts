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

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp: string;
}
