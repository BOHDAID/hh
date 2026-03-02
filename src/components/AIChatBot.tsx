import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Bot, User, Loader2, Sparkles, ShoppingCart, Package, HelpCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useAppData } from "./AppInitializer";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

const QuickButton = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-xs font-medium text-foreground hover:bg-muted hover:border-primary/30 transition-all duration-200 whitespace-nowrap"
  >
    {icon}
    {label}
  </button>
);

const TypingIndicator = () => (
  <div className="flex gap-2">
    <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center shrink-0">
      <Bot className="h-4 w-4 text-primary-foreground" />
    </div>
    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
      <div className="flex gap-1">
        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0 }} className="h-2 w-2 rounded-full bg-muted-foreground" />
        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }} className="h-2 w-2 rounded-full bg-muted-foreground" />
        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} className="h-2 w-2 rounded-full bg-muted-foreground" />
      </div>
    </div>
  </div>
);

const AIChatBot = () => {
  const { i18n } = useTranslation();
  const isRTL = i18n.language === "ar";
  const { user, storeName } = useAppData();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
      setShowPulse(false);
    }
  }, [open]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isLoading) return;

    const userMsg: Msg = { role: "user", content: msg };
    if (!text) setInput("");
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      };

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: allMessages, storeUrl: window.location.origin }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "فشل الاتصال");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `❌ ${e.message || "حدث خطأ، حاول مرة أخرى"}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const quickActions = isRTL
    ? [
        { icon: <Package className="h-3.5 w-3.5" />, label: "وش المنتجات المتوفرة؟", msg: "وش المنتجات المتوفرة حالياً؟" },
        { icon: <ShoppingCart className="h-3.5 w-3.5" />, label: "تتبع طلبي", msg: "أبغى أتتبع طلبي الأخير" },
        { icon: <Sparkles className="h-3.5 w-3.5" />, label: "رشّح لي منتج", msg: "رشح لي أفضل منتج" },
        { icon: <HelpCircle className="h-3.5 w-3.5" />, label: "عندي مشكلة", msg: "عندي مشكلة وأحتاج مساعدة" },
      ]
    : [
        { icon: <Package className="h-3.5 w-3.5" />, label: "What's available?", msg: "What products are available?" },
        { icon: <ShoppingCart className="h-3.5 w-3.5" />, label: "Track order", msg: "I want to track my latest order" },
        { icon: <Sparkles className="h-3.5 w-3.5" />, label: "Recommend", msg: "Recommend me a product" },
        { icon: <HelpCircle className="h-3.5 w-3.5" />, label: "Need help", msg: "I have an issue and need help" },
      ];

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className="relative">
              {showPulse && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
              <Button
                onClick={() => setOpen(true)}
                className="h-14 w-14 rounded-full bg-gradient-primary shadow-glow-primary p-0 relative"
              >
                <MessageCircle className="h-6 w-6 text-primary-foreground" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-4rem)] rounded-2xl border border-border overflow-hidden flex flex-col bg-background shadow-2xl"
            dir={isRTL ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-primary">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-400 border border-primary" />
                </div>
                <div>
                  <span className="font-bold text-primary-foreground text-sm block leading-tight">
                    {isRTL ? "المساعد الذكي" : "AI Assistant"}
                  </span>
                  <span className="text-primary-foreground/70 text-[10px]">
                    {isRTL ? "متصل الآن" : "Online now"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMessages([])}
                    className="text-primary-foreground hover:bg-white/20 h-8 w-8"
                    title={isRTL ? "محادثة جديدة" : "New chat"}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-primary-foreground hover:bg-white/20 h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="text-center mt-4 mb-2">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-3 shadow-glow-primary">
                      <Sparkles className="h-7 w-7 text-primary-foreground" />
                    </div>
                    <h3 className="font-bold text-foreground text-sm">
                      {isRTL ? `مرحباً${user ? "" : ""}! 👋` : `Hello! 👋`}
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1">
                      {isRTL
                        ? `أنا مساعد ${storeName || "المتجر"} الذكي، كيف أقدر أساعدك؟`
                        : `I'm ${storeName || "the store"}'s AI assistant, how can I help?`}
                    </p>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-2 justify-center px-2">
                    {quickActions.map((qa, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                      >
                        <QuickButton icon={qa.icon} label={qa.label} onClick={() => sendMessage(qa.msg)} />
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-full bg-gradient-primary flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity font-medium">
                              {children}
                            </a>
                          ),
                          strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
                          ul: ({ children }) => <ul className="my-1.5 mr-3 list-disc list-inside space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="my-1.5 mr-3 list-decimal list-inside space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-foreground">{children}</li>,
                          p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                          code: ({ children }) => <code className="bg-background/50 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                          h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                          blockquote: ({ children }) => <blockquote className="border-r-2 border-primary pr-2 my-1 text-muted-foreground italic">{children}</blockquote>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === "user" && <TypingIndicator />}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border bg-background">
              <form
                onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isRTL ? "اكتب رسالتك..." : "Type a message..."}
                  className="flex-1 bg-muted rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={isLoading || !input.trim()}
                  className="rounded-xl bg-gradient-primary h-10 w-10 shrink-0 disabled:opacity-40"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary-foreground" /> : <Send className="h-4 w-4 text-primary-foreground" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIChatBot;
