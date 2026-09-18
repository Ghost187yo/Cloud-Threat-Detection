import { ThreatAnalysisResult, CloudNode } from "../types";

/**
 * Checks if a specific log line exhibits threat markers, active exploit signatures, or security alerts.
 */
export function isThreatLog(logStr: string): boolean {
  if (!logStr) return false;
  const upper = logStr.toUpperCase();
  return (
    upper.includes("[CRITICAL]") ||
    upper.includes("[ALERT]") ||
    upper.includes("ATTACK DETECTED") ||
    upper.includes("SIMULATED ATTACK") ||
    upper.includes("UNAUTHORIZED WRITE") ||
    upper.includes("COPY TO PROGRAM") ||
    upper.includes("169.254.169.254") ||
    upper.includes("EXPLOIT") ||
    upper.includes("CHROOT SYSCALL") ||
    upper.includes("SYS_ADMIN") ||
    upper.includes("SQL INJECTION") ||
    upper.includes("RAW MOUNT")
  );
}

/**
 * Determines whether any threat is detected within the provided logs or analysis results.
 */
export function detectThreatsInLogs(
  logs: string[],
  analysis?: ThreatAnalysisResult | null,
  node?: CloudNode | { status?: string }
): boolean {
  const hasLogThreat = logs.some((log) => isThreatLog(log));
  const hasAnalysisThreat = Boolean(analysis && analysis.threatIdentified);
  const isNodeCompromised = node?.status === "compromised" || node?.status === "suspicious";

  return hasLogThreat || hasAnalysisThreat || isNodeCompromised;
}

/**
 * Calculates the 'Threat Probability Score' for a given log row based on:
 * 1. The AI Threat Analysis results (urgency, falsePositiveLikelihood, threatProbabilityScore)
 * 2. The presence of detected threat signatures in the log line
 * 3. The node's security state
 */
export function getThreatProbabilityScore(
  logStr: string,
  analysis?: ThreatAnalysisResult | null,
  node?: CloudNode | { status?: string }
): string {
  const threatInLine = isThreatLog(logStr);
  const isWarnLine = logStr.toUpperCase().includes("[WARN]");

  if (threatInLine) {
    if (analysis && analysis.threatIdentified) {
      // 1. If analysis explicitly returned a threatProbabilityScore (e.g. from Gemini or simulation)
      if (analysis.threatProbabilityScore !== undefined && analysis.threatProbabilityScore !== null) {
        const rawScore = analysis.threatProbabilityScore;
        if (typeof rawScore === "number") {
          return `${(rawScore <= 1 ? rawScore * 100 : rawScore).toFixed(1)}%`;
        }
        if (typeof rawScore === "string") {
          const trimmed = rawScore.trim();
          if (trimmed.endsWith("%")) return trimmed;
          const parsed = parseFloat(trimmed);
          if (!isNaN(parsed)) {
            return `${(parsed <= 1 ? parsed * 100 : parsed).toFixed(1)}%`;
          }
          return trimmed;
        }
      }

      // 2. Derive score inversely from falsePositiveLikelihood if available (e.g. "2.4% - High fidelity")
      if (analysis.falsePositiveLikelihood) {
        const fpMatch = analysis.falsePositiveLikelihood.match(/(\d+(?:\.\d+)?)\s*%/);
        if (fpMatch) {
          const fp = parseFloat(fpMatch[1]);
          if (!isNaN(fp) && fp >= 0 && fp <= 100) {
            return `${(100 - fp).toFixed(1)}%`;
          }
        }
      }

      // 3. Calibrated probability mapping based on verified AI urgency level
      switch (analysis.urgency) {
        case "CRITICAL":
          return "98.5%";
        case "HIGH":
          return "89.0%";
        case "MEDIUM":
          return "68.5%";
        case "LOW":
          return "42.0%";
        default:
          return "95.0%";
      }
    }

    // If analysis result is not yet available, evaluate directly from log threat severity
    if (logStr.includes("[CRITICAL]") || logStr.includes("ATTACK DETECTED")) {
      return "96.5%";
    }
    if (logStr.includes("[ALERT]") || logStr.includes("UNAUTHORIZED")) {
      return "88.0%";
    }
    return "92.0%";
  }

  if (isWarnLine) {
    if (analysis && analysis.threatIdentified) {
      return analysis.urgency === "CRITICAL" ? "54.0%" : "38.5%";
    }
    return node?.status === "compromised" ? "48.0%" : "32.0%";
  }

  // Normal informational / baseline log entries
  return "1.5%";
}
