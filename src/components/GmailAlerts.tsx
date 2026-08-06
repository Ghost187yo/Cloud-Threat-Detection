import React, { useState, useEffect } from "react";
import { Mail, Shield, AlertTriangle, Send, Sparkles, LogOut, CheckCircle, HelpCircle, FileText, Trash2, ListFilter } from "lucide-react";
import { initAuth, googleSignIn, logout } from "../lib/firebaseAuth";
import { User } from "firebase/auth";

interface GmailAlertsProps {
  activeNode: {
    name: string;
    ipAddress: string;
    activePayload?: string;
    logs: string[];
  } | null;
  aiRemediation?: {
    summary: string;
    patchCode: string;
    patchLanguage: string;
  } | null;
}

interface SentAlert {
  id: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
}

export function GmailAlerts({ activeNode, aiRemediation }: GmailAlertsProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Form states
  const [recipient, setRecipient] = useState("security-ops@internal.net");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [sentAlerts, setSentAlerts] = useState<SentAlert[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);

  // Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"send" | "draft">("send");

  // Load auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Update form template whenever selected node or remediation patches update
  useEffect(() => {
    if (!activeNode) return;

    const nodeName = activeNode.name;
    const ip = activeNode.ipAddress;
    const severity = activeNode.logs.some(log => log.includes("[CRITICAL]") || log.includes("[ALERT]")) ? "CRITICAL" : "HIGH";

    setSubject(`[Vulnerability Alert] ${severity} Threat Vector Flagged on Node: ${nodeName}`);

    const baseBody = `--- CLOUD SYSTEM SECURITY EXPLOIT ALERT ---
Timestamp: ${new Date().toUTCString()}
Target Host: ${nodeName} (${ip})
Severity Indicator: ${severity}

SUMMARY OF THREAT:
Heuristic analysis indicates a potential zero-day attack vector. 

TELEMETRY / TRIGGER VECTOR EXPOSED:
${activeNode.activePayload || "No direct request payload caught in connection handshake."}

CRITICAL TELEMETRY TRACES:
${activeNode.logs.slice(-4).join("\n")}

${aiRemediation ? `AI SUGGESTED REMEDIATION PATH & MITIGATION CODES:
${aiRemediation.summary}

PATCH POLICY CODE (${aiRemediation.patchLanguage.toUpperCase()}):
\`\`\`${aiRemediation.patchLanguage}
${aiRemediation.patchCode}
\`\`\`` : "Security audit ongoing. Inspect telemetry details in the Security Operations Panel."}

Dispatch downstream to the SOC (Security Operations Center) pipeline.
`;

    setEmailBody(baseBody);
  }, [activeNode, aiRemediation]);

  // Fetch recent sent emails in real-time from user's Gmail to populate dispatch log
  const fetchSentMessages = async (accessToken: string) => {
    setIsLoadingFeed(true);
    try {
      const response = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:\"Vulnerability Alert\"&maxResults=5",
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = await response.json();
      if (data.messages && data.messages.length > 0) {
        const fullAlerts: SentAlert[] = [];
        for (const msg of data.messages) {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          const detail = await detailRes.json();
          const headers = detail.payload?.headers || [];
          const toHeader = headers.find((h: any) => h.name.toLowerCase() === "to")?.value || "Unknown Recipient";
          const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "No Subject";
          const dateHeader = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";

          fullAlerts.push({
            id: msg.id,
            to: toHeader,
            subject: subjectHeader,
            date: dateHeader ? new Date(dateHeader).toLocaleTimeString() : "Recent",
            snippet: detail.snippet || "",
          });
        }
        setSentAlerts(fullAlerts);
      } else {
        setSentAlerts([]);
      }
    } catch (err) {
      console.error("Error loading Gmail messages feed:", err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSentMessages(token);
    }
  }, [token]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        fetchSentMessages(result.accessToken);
      }
    } catch (err) {
      console.error("Authentication integration failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setSentAlerts([]);
  };

  // Helper to build MIME structure
  const buildMimeEmail = (to: string, subjectLine: string, bodyText: string): string => {
    const email = [
      `To: ${to}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${subjectLine}`,
      "",
      bodyText
    ].join("\r\n");

    return btoa(unescape(encodeURIComponent(email)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  // Execute actual Gmail dispatch after confirmation
  const handleConfirmedAction = async () => {
    setShowConfirmModal(false);
    if (!token) return;

    if (confirmAction === "send") {
      setIsSending(true);
      try {
        const rawMime = buildMimeEmail(recipient, subject, emailBody);
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw: rawMime }),
        });

        if (res.ok) {
          alert("Security Alert dispatched successfully to Gmail output!");
          fetchSentMessages(token);
        } else {
          const errData = await res.json();
          alert(`Gmail Dispatch Error: ${errData.error?.message || "Failed to deliver email"}`);
        }
      } catch (err: any) {
        console.error("Gmail alert sending failed:", err);
        alert(`Failed to send alert via Gmail: ${err.message}`);
      } finally {
        setIsSending(false);
      }
    } else {
      setIsDrafting(true);
      try {
        const rawMime = buildMimeEmail(recipient, subject, emailBody);
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: { raw: rawMime }
          }),
        });

        if (res.ok) {
          alert("Security Alert draft generated and saved to your Gmail drafts inbox!");
          fetchSentMessages(token);
        } else {
          const errData = await res.json();
          alert(`Gmail Draft Error: ${errData.error?.message || "Failed to create draft"}`);
        }
      } catch (err: any) {
        console.error("Gmail draft creation failed:", err);
        alert(`Failed to save draft: ${err.message}`);
      } finally {
        setIsDrafting(false);
      }
    }
  };

  const triggerActionWithConfirmation = (actionType: "send" | "draft") => {
    setConfirmAction(actionType);
    setShowConfirmModal(true);
  };

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg p-5 shadow-xl relative" id="gmail-integration-panel">
      
      {/* Header section */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2a2a2c]">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-400" />
            GMAIL SECURITY ALERT SYSTEM
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Connect your Gmail account to dispatch technical vulnerability incident drafts and policy hotpatches instantly to SecOps teams
          </p>
        </div>
        
        {!needsAuth && user && (
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-mono font-semibold text-gray-300">{user.email}</p>
              <p className="text-[9px] font-mono text-green-400">Google Workspace Linked</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 bg-[#0d0d0f] border border-[#2a2a2c] text-gray-400 hover:text-red-400 hover:border-red-900/50 rounded transition-all"
              title="Sign Out Google Workspace"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Auth Gate Screen */}
      {needsAuth ? (
        <div className="bg-[#0d0d0f] border border-[#2a2a2c] rounded p-8 text-center flex flex-col items-center justify-center">
          <Mail className="h-8 w-8 text-blue-500/80 mb-3 animate-pulse" />
          <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider mb-1">Authorization Prerequisite</h4>
          <p className="text-[11px] text-gray-500 max-w-md mb-4 leading-relaxed">
            The security alert engine requires access token permissions to draft or send alerts securely under your account. With your permission, this app will interact with Gmail.
          </p>

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="gsi-material-button hover:opacity-90 active:scale-[0.98] transition-all"
            id="google-signin-btn"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: "block" }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents font-semibold">{isLoggingIn ? "Connecting account..." : "Sign in with Google"}</span>
            </div>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Dispatch Composition Form */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider block">
                  SecOps / Recipient Email Address
                </label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-[#0d0d0f] border border-[#2a2a2c] rounded px-3 py-1.5 text-xs text-[#e1e1e3] focus:outline-none focus:border-blue-500 font-mono"
                  placeholder="security-operations@company.com"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider block">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-[#0d0d0f] border border-[#2a2a2c] rounded px-3 py-1.5 text-xs text-[#e1e1e3] focus:outline-none focus:border-blue-500 font-sans font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider block">
                  Technical Vulnerability Payload & Telemetry Payload
                </label>
                {!activeNode && (
                  <span className="text-[9px] text-orange-400 italic">Select a node from map above to prefill metrics</span>
                )}
              </div>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="w-full h-44 bg-[#0d0d0f] border border-[#2a2a2c] rounded p-3 text-xs text-[#e1e1e3] font-mono placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                placeholder="Incident telemetry detail body dump..."
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => triggerActionWithConfirmation("send")}
                disabled={isSending || isDrafting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold font-mono text-[11px] rounded transition-all shadow-md"
              >
                <Send className="h-3.5 w-3.5" />
                {isSending ? "DISPATCHING ALERT..." : "SEND SECURITY ALERT"}
              </button>

              <button
                onClick={() => triggerActionWithConfirmation("draft")}
                disabled={isSending || isDrafting}
                className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1c] border border-[#2a2a2c] hover:border-gray-500 disabled:opacity-50 text-gray-300 font-semibold font-mono text-[11px] rounded transition-all"
              >
                <FileText className="h-3.5 w-3.5" />
                {isDrafting ? "GENERATING DRAFT..." : "SAVE AS GMAIL DRAFT"}
              </button>
            </div>
          </div>

          {/* Real-time Gmail Alert Feed Log */}
          <div className="lg:col-span-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-semibold text-gray-400 uppercase tracking-wider block">
                Secure Alerts Dispatch Log
              </label>
              <button
                onClick={() => fetchSentMessages(token!)}
                className="text-[9px] font-mono text-blue-400 hover:underline"
              >
                Sync Logs
              </button>
            </div>

            <div className="bg-[#0d0d0f] border border-[#2a2a2c] rounded p-3 h-[256px] overflow-y-auto space-y-3">
              {isLoadingFeed ? (
                <div className="text-center font-mono text-xs text-gray-500 pt-16">
                  <span className="animate-pulse">Retrieving dispatched logs...</span>
                </div>
              ) : sentAlerts.length === 0 ? (
                <div className="text-center font-mono text-[11px] text-gray-500 pt-16 px-4">
                  No recently dispatched security emails matching "Vulnerability Alert" filter.
                </div>
              ) : (
                sentAlerts.map((alertItem) => (
                  <div
                    key={alertItem.id}
                    className="p-2 bg-[#141416]/60 border border-[#2a2a2c]/60 rounded space-y-1.5 text-[10px] font-mono hover:border-blue-900/50 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-blue-400 font-semibold truncate max-w-[120px]" title={alertItem.to}>
                        TO: {alertItem.to.replace(/[<>]/g, "")}
                      </span>
                      <span className="text-gray-500 shrink-0 text-[9px]">{alertItem.date}</span>
                    </div>
                    <p className="text-gray-200 font-bold truncate">{alertItem.subject}</p>
                    <p className="text-gray-500 line-clamp-2 leading-relaxed text-[9px]">
                      {alertItem.snippet}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Note */}
            <div className="p-2.5 bg-[#141416]/40 border border-[#2a2a2c]/50 rounded text-[10px] text-gray-400 flex gap-2">
              <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
              <span>
                All alerts are delivered immediately. Outgoing alerts populate the SEC Secure Operations audit trails.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* COMPLIANCE CONFIRMATION DIALOG MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111113] border border-[#3a3a3c] rounded-lg max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-950 text-blue-400 rounded-lg">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  {confirmAction === "send" ? "Confirm Security Email Dispatch?" : "Confirm Saving Gmail Draft?"}
                </h4>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  You are about to initiate an outgoing Google Workspace transaction with permission. Please confirm the details before launching the request down the pipeline:
                </p>
              </div>
            </div>

            <div className="bg-[#0d0d0f] border border-[#2a2a2c] p-3 rounded font-mono text-[10.5px] space-y-1.5 text-gray-300">
              <p><span className="text-gray-500">Destination To:</span> <span className="text-blue-400 font-bold">{recipient}</span></p>
              <p className="truncate"><span className="text-gray-500">Subject:</span> {subject}</p>
              <p><span className="text-gray-500">Action:</span> {confirmAction === "send" ? "SEND EMAIL (MUTATIVE)" : "CREATE NEW DRAFT"}</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 bg-[#0d0d0f] border border-[#2a2a2c] hover:border-gray-500 text-gray-300 text-xs font-semibold rounded font-mono transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmedAction}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded font-mono transition-all shadow-md shadow-blue-950"
              >
                CONFIRM OPERATION
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
