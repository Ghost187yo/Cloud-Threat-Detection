import React from "react";
import { Shield, AlertOctagon, RefreshCw, Zap } from "lucide-react";
import { motion } from "motion/react";

interface MetricCardsProps {
  threatsIntercepted: number;
  activeCriticals: number;
  falsePositiveRate: string;
  scannerAccuracy: string;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  threatsIntercepted,
  activeCriticals,
  falsePositiveRate,
  scannerAccuracy
}) => {
  const metrics = [
    {
      id: "metric-intercepted",
      title: "Threats Blocked / Intercepted",
      value: threatsIntercepted,
      sub: "+4 in the last hour",
      icon: Shield,
      color: "text-blue-400 border-[#2a2a2c] bg-[#111113]",
      iconColor: "text-blue-500"
    },
    {
      id: "metric-critical",
      title: "Active Compromised Nodes",
      value: activeCriticals,
      sub: "Requires immediate attention",
      icon: AlertOctagon,
      color: activeCriticals > 0 
        ? "text-red-400 border-red-900/40 bg-red-950/20 animate-pulse" 
        : "text-[#e1e1e3] border-[#2a2a2c] bg-[#111113]",
      iconColor: activeCriticals > 0 ? "text-red-500" : "text-gray-500"
    },
    {
      id: "metric-false-positive",
      title: "False Positive Ratio",
      value: falsePositiveRate,
      sub: "Dynamic policy threshold",
      icon: RefreshCw,
      color: "text-gray-400 border-[#2a2a2c] bg-[#111113]",
      iconColor: "text-blue-400"
    },
    {
      id: "metric-accuracy",
      title: "AI Zero-Day Identification",
      value: scannerAccuracy,
      sub: "Cognitive validation",
      icon: Zap,
      color: "text-blue-400 border-[#2a2a2c] bg-[#111113]",
      iconColor: "text-blue-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="kpi-metrics-grid">
      {metrics.map((m, idx) => (
        <motion.div
          key={m.id}
          id={m.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className={`border rounded-lg p-4 flex items-center justify-between shadow-sm backdrop-blur-sm ${m.color}`}
        >
          <div>
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{m.title}</p>
            <h3 className="text-2xl font-bold tracking-tight text-[#e1e1e3] mt-1 font-sans">
              {m.value}
            </h3>
            <span className="text-[10px] text-gray-500 font-mono block mt-1">{m.sub}</span>
          </div>
          <div className="p-3 bg-[#0d0d0f] border border-[#2a2a2c] rounded">
            <m.icon className={`h-5 w-5 ${m.iconColor}`} />
          </div>
        </motion.div>
      ))}
    </div>
  );
};
