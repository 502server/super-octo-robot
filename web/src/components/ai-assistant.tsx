import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const quickPrompts = ["Summarize this module", "Prioritize open alerts", "Suggest safe remediation"];

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I can help explain records, triage alerts, and prioritize remediation. Workspace data is only shared when you enable context for a request.",
    },
  ]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handlePageChange = (event: Event) => {
      const page = (event as CustomEvent<string>).detail;
      if (typeof page === "string") setCurrentPage(page);
    };
    const handleOpenAssistant = () => setIsOpen(true);
    window.addEventListener("fivezero2:page-change", handlePageChange);
    window.addEventListener("fivezero2:assistant:open", handleOpenAssistant);
    return () => {
      window.removeEventListener("fivezero2:page-change", handlePageChange);
      window.removeEventListener("fivezero2:assistant:open", handleOpenAssistant);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || isStreaming) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const conversation = [...messages, userMessage].slice(-8);
    setMessages([...conversation, assistantMessage]);
    setDraft("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/assistant/deepseek", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          page: currentPage,
          includeContext,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "The assistant could not complete this request.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming is unavailable in this browser.");

      const decoder = new TextDecoder();
      let receivedText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        receivedText += chunk;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessage.id ? { ...message, content: receivedText } : message,
          ),
        );
      }

      const finalChunk = decoder.decode();
      if (finalChunk) receivedText += finalChunk;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: receivedText || "The assistant returned no text. Please try again.",
              }
            : message,
        ),
      );
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Response stopped. You can ask another question."
          : error instanceof Error
            ? error.message
            : "The assistant could not complete this request.";
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: item.content ? `${item.content}\n\n${message}` : message }
            : item,
        ),
      );
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function stopResponse() {
    abortRef.current?.abort();
  }

  return (
    <div className="assistant-dock">
      <section
        id="deepseek-assistant"
        className="assistant-panel"
        role="dialog"
        aria-modal="false"
        aria-label="DeepSeek analyst assistant"
        hidden={!isOpen}
      >
          <header className="assistant-header">
            <div>
              <span className="assistant-eyebrow">WORKSPACE COPILOT</span>
              <h2>DeepSeek assistant</h2>
              <p>DeepSeek V4.1 Flash · Vercel AI Gateway</p>
            </div>
            <button
              type="button"
              className="assistant-close"
              aria-label="Close assistant"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </header>

          <div className="assistant-context-note" role="note">
            Defensive guidance only. The assistant cannot run commands or change records.
          </div>

          <div className="assistant-messages" aria-live="polite" aria-label="Conversation">
            {messages.map((message) => (
              <article className={`assistant-message ${message.role}`} key={message.id}>
                <span>{message.role === "assistant" ? "DEEPSEEK" : "YOU"}</span>
                <p>{message.content || (isStreaming ? <i className="assistant-typing" aria-label="Thinking" /> : "")}</p>
              </article>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {messages.length === 1 && (
            <div className="assistant-prompts" aria-label="Suggested prompts">
              {quickPrompts.map((prompt) => (
                <button type="button" key={prompt} onClick={() => setDraft(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <label className="assistant-context-toggle">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(event) => setIncludeContext(event.target.checked)}
            />
            <span>
              Share a limited workspace summary with DeepSeek for this request
              <small>Only the current menu&apos;s records and workspace counts are included.</small>
            </span>
          </label>

          <form className="assistant-composer" onSubmit={sendMessage}>
            <label className="sr-only" htmlFor="assistant-prompt">
              Ask the DeepSeek assistant
            </label>
            <textarea
              ref={inputRef}
              id="assistant-prompt"
              value={draft}
              maxLength={2000}
              rows={2}
              placeholder="Ask about the current module…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {isStreaming ? (
              <button type="button" className="assistant-send stop" onClick={stopResponse}>
                Stop
              </button>
            ) : (
              <button type="submit" className="assistant-send" disabled={!draft.trim()}>
                Send
              </button>
            )}
          </form>
          <p className="assistant-footnote">Do not share passwords, tokens, or secrets. Responses are advisory.</p>
      </section>

      <button
        type="button"
        className="assistant-launcher"
        aria-label={isOpen ? "Close DeepSeek assistant" : "Open DeepSeek assistant"}
        aria-expanded={isOpen}
        aria-controls="deepseek-assistant"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true">AI</span>
        <span className="assistant-launcher-label">Ask DeepSeek</span>
      </button>
    </div>
  );
}
