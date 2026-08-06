import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, CloudNode } from "../types";
import { Send, Terminal, Bot, User, Trash2, ArrowDown } from "lucide-react";
import { motion } from "motion/react";

interface SecurityChatProps {
  chatHistory: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  onClearChat: () => void;
  activeContextNode: CloudNode | null;
}

export const SecurityChat: React.FC<SecurityChatProps> = ({
  chatHistory,
  onSendMessage,
  isLoading,
  onClearChat,
  activeContextNode
}) => {
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const samplePrompts = [
    "How do I enforce IMDSv2 strictly?",
    "Explain the timing side-channel exploit",
    "Remediate Kubernetes node escape path",
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText("");
  };

  return (
    <div className="bg-[#111113] border border-[#2a2a2c] rounded-lg flex flex-col h-[520px] shadow-xl overflow-hidden" id="security-chat-panel">
      {/* Header */}
      <div className="bg-[#0d0d0f] p-4 border-b border-[#2a2a2c] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <Bot className="h-5 w-5 text-blue-400" />
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">VIRTUAL THREAT SPECIALIST</h3>
            <span className="text-[10px] text-gray-400 font-mono">
              Active Context: {activeContextNode ? activeContextNode.name : "Distributed Agent"}
            </span>
          </div>
        </div>
        <button
          onClick={onClearChat}
          title="Clear Chat History"
          className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-950/10 transition-all border border-transparent hover:border-red-950/20"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Suggested quick-prompts */}
      <div className="bg-[#0d0d0f]/60 px-4 py-2 border-b border-[#2a2a2c]/60 flex items-center gap-2 overflow-x-auto text-[11px] font-mono scrollbar-none">
        <span className="text-gray-500 shrink-0">Suggestions:</span>
        {samplePrompts.map((p, idx) => (
          <button
            key={idx}
            onClick={() => {
              if (!isLoading) onSendMessage(p);
            }}
            className="text-gray-300 hover:text-blue-400 bg-[#161618] border border-[#2a2a2c] rounded-full px-2.5 py-1 shrink-0 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0d0d0f]/20">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2">
            <Terminal className="h-8 w-8 text-blue-500/30" />
            <p className="text-xs font-semibold text-gray-400 font-mono">THREAT INTELLIGENCE CONSOLE</p>
            <p className="text-xs text-gray-500 max-w-xs leading-relaxed font-sans">
              Ask questions about securing S3 metrics, timing oracles, and compiling memory boundaries on unpatched kernels.
            </p>
          </div>
        ) : (
          chatHistory.map((m) => {
            const isUser = m.sender === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-[85%] ${
                  isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <div className={`p-2 rounded shrink-0 h-8 w-8 flex items-center justify-center ${
                  isUser ? "bg-blue-950/40 border border-blue-900/30 text-blue-400" : "bg-[#161618] border border-[#2a2a2c] text-blue-400"
                }`}>
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div className={`rounded p-3 text-xs leading-relaxed font-sans ${
                  isUser 
                    ? "bg-blue-950/20 border border-blue-900/30 text-blue-100" 
                    : "bg-[#111113] border border-[#2a2a2c] text-gray-200"
                }`}>
                  {m.content.split("\n").map((line, i) => (
                    <p key={i} className={line.trim() === "" ? "h-2" : ""}>
                      {line}
                    </p>
                  ))}
                  <span className="text-[9px] text-gray-500 font-mono block mt-1.5 text-right">
                    {m.timestamp}
                  </span>
                </div>
              </div>
            );
          })
        )}
        {isLoading && (
          <div className="flex gap-3 max-w-[85%] mr-auto items-center">
            <div className="p-2 rounded shrink-0 h-8 w-8 flex items-center justify-center bg-[#161618] border border-[#2a2a2c] text-blue-400 animate-pulse">
              <Bot className="h-4 w-4" />
            </div>
            <div className="bg-[#111113] border border-[#2a2a2c] rounded p-3 text-xs text-blue-400 font-mono flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Formulating response...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 bg-[#0d0d0f] border-t border-[#2a2a2c] flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={activeContextNode ? `Ask how to secure ${activeContextNode.name}...` : "Type a security engineering question..."}
          className="flex-1 bg-[#161618] border border-[#2a2a2c] rounded px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-2 rounded transition-colors disabled:opacity-40 shrink-0"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};
