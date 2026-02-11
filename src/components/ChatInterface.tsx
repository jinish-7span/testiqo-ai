"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  role: "admin" | "editor" | "candidate";
  onBack: () => void;
}

export default function ChatInterface({ role, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const onSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMessage], role }),
      });

      if (!response.body) throw new Error("No body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      const assistantId = "assistant-" + Date.now();

      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";
              assistantContent += content;
              setMessages((prev) => 
                prev.map((m) => m.id === assistantId ? { ...m, content: assistantContent } : m)
              );
            } catch (e) {}
          }
        }
      }
    } catch (error) {
      console.error("Chat Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-screen max-w-4xl mx-auto border-x border-slate-800 bg-slate-900/50 backdrop-blur-xl">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-bold text-white">TestiQo Assistant</h2>
            <p className="text-xs text-slate-400 capitalize">Role: {role}</p>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      </header>

      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
      >
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20 text-slate-500"
            >
              <Bot className="mx-auto mb-4 opacity-20" size={48} />
              <p>Ask me anything about the TestiQo flow!</p>
            </motion.div>
          )}
          {messages.map((msg: any) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                "flex gap-4 max-w-[90%]",
                msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                msg.role === "user" ? "bg-blue-600" : "bg-slate-700"
              )}>
                {msg.role === "user" ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
              </div>
              <div className={cn(
                "p-4 rounded-2xl text-[13px] leading-relaxed shadow-lg",
                msg.role === "user" 
                  ? "bg-blue-600/20 border border-blue-500/30 text-blue-50" 
                  : "bg-slate-800 border border-slate-700 text-slate-200"
              )}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    img: ({ node, ...props }) => (
                      <img 
                        {...props} 
                        className="rounded-lg border border-slate-700 my-4 shadow-2xl max-w-full hover:scale-[1.02] transition-transform cursor-pointer" 
                        loading="lazy"
                      />
                    ),
                    p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                    ul: ({ node, ...props }) => <ul {...props} className="list-disc ml-4 space-y-1 my-2" />,
                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal ml-4 space-y-1 my-2" />,
                    h3: ({ node, ...props }) => <h3 {...props} className="text-base font-bold text-white mb-2 mt-4 first:mt-0" />,
                    code: ({ node, ...props }) => <code {...props} className="bg-slate-900 px-1 py-0.5 rounded text-blue-300" />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex gap-4 max-w-[85%] mr-auto animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <Loader2 className="animate-spin text-slate-500" size={16} />
            </div>
            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-500 italic text-sm">
              Typing...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <footer className="p-4 border-t border-slate-800 bg-slate-900/80">
        <form onSubmit={onSend} className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Message as ${role}...`}
            className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-xl px-4 py-3 pr-12 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-lg transition-all text-white"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="text-[10px] text-center text-slate-500 mt-2 uppercase tracking-widest">
          Powered by Pinecone & GPT-4o mini
        </p>
      </footer>
    </div>
  );
}
