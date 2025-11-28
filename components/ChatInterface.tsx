"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: Recommendation[];
}

interface Recommendation {
  item: {
    id: string;
    imageUrl: string;
    category: string;
    style: string;
    season: string;
    colors: string[];
    tags: string[];
  };
  explanation: string;
  score: number;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm your AI wardrobe assistant. Tell me about an upcoming event and I'll recommend outfits from your wardrobe!",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/wardrobe/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input, limit: 3 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get recommendations");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content:
          data.recommendations?.length > 0
            ? `I found ${data.recommendations.length} recommendations for you!`
            : "I couldn't find any matching items in your wardrobe. Try uploading more items or adjusting your query.",
        recommendations: data.recommendations || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please try again.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Get Outfit Recommendations
      </h2>

      <div
        className="bg-white rounded-lg shadow-lg flex flex-col"
        style={{ height: "600px" }}
      >
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-100 text-gray-900"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.recommendations &&
                  message.recommendations.length > 0 && (
                    <div className="mt-4 space-y-4">
                      {message.recommendations.map((rec, recIdx) => (
                        <div
                          key={recIdx}
                          className="bg-white rounded-lg p-4 border border-gray-200"
                        >
                          <div className="flex gap-4">
                            <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0">
                              <img
                                src={rec.item.imageUrl}
                                alt={rec.item.category}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "/placeholder-image.png";
                                }}
                              />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-semibold text-gray-900 capitalize">
                                    {rec.item.category}
                                  </h4>
                                  <p className="text-sm text-gray-600 capitalize">
                                    {rec.item.style} • {rec.item.season}
                                  </p>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {(rec.score * 100).toFixed(0)}% match
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mb-2">
                                {rec.explanation}
                              </p>
                              {rec.item.colors.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {rec.item.colors.map((color, colorIdx) => (
                                    <span
                                      key={colorIdx}
                                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                                    >
                                      {color}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSubmit} className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="E.g., I'm going to a summer evening rooftop party..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
