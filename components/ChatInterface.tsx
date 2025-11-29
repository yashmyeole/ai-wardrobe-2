"use client";

import { useState, useRef, useEffect } from "react";

interface OutfitItem {
  id: string;
  imageUrl: string;
  description: string;
  category: string;
  style: string;
  season: string;
  colors: string[];
  tags: string[];
  matchScore: string;
}

interface Outfit {
  message: string;
  isComplete: boolean;
  items: OutfitItem[];
  averageScore: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  outfit?: Outfit;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hi! I'm your AI wardrobe stylist. Tell me about your upcoming event or occasion, and I'll curate the perfect outfit from your wardrobe!",
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
        body: JSON.stringify({ query: input, limit: 10 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get recommendations");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.outfit.message,
        outfit: data.outfit,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      const errorMessage: Message = {
        role: "assistant",
        content: `❌ Sorry, I encountered an error: ${error.message}. Please try again.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        ✨ AI Outfit Stylist
      </h2>
      <p className="text-gray-600 mb-6">
        Describe your occasion and I'll curate the perfect outfit for you
      </p>

      <div
        className="bg-white rounded-lg shadow-lg flex flex-col border border-gray-200"
        style={{ height: "700px" }}
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
                className={`max-w-2xl rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-purple-600 text-white"
                    : "bg-gray-50 text-gray-900 border border-gray-200"
                }`}
              >
                <p className="whitespace-pre-wrap mb-4">{message.content}</p>

                {message.outfit && message.outfit.items.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                      <span>
                        ⭐ Match Score: {message.outfit.averageScore}%
                      </span>
                      {message.outfit.isComplete && (
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                          Complete Outfit
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {message.outfit.items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="bg-white rounded-lg p-4 border border-gray-200 hover:border-purple-300 transition-colors"
                        >
                          <div className="flex gap-4">
                            {/* Image */}
                            <div className="w-28 h-28 bg-gray-100 rounded-lg overflow-hidden shrink-0 shadow-sm">
                              <img
                                src={item.imageUrl}
                                alt={item.category}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://via.placeholder.com/112x112?text=No+Image";
                                }}
                              />
                            </div>

                            {/* Details */}
                            <div className="flex-1">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h4 className="font-bold text-gray-900 capitalize text-lg">
                                    {item.category}
                                  </h4>
                                  <p className="text-sm text-gray-600 capitalize">
                                    {item.style} • {item.season}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                    {item.matchScore}% match
                                  </span>
                                </div>
                              </div>

                              {/* Description */}
                              <p className="text-sm text-gray-700 mb-3 line-clamp-2">
                                {item.description}
                              </p>

                              {/* Colors and Tags */}
                              <div className="flex flex-wrap gap-2">
                                {item.colors.length > 0 && (
                                  <div className="flex gap-1">
                                    {item.colors.map((color, colorIdx) => (
                                      <span
                                        key={colorIdx}
                                        className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded capitalize"
                                      >
                                        {color}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {item.tags.length > 0 && (
                                  <div className="flex gap-1">
                                    {item.tags
                                      .slice(0, 2)
                                      .map((tag, tagIdx) => (
                                        <span
                                          key={tagIdx}
                                          className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {message.outfit && message.outfit.items.length === 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      💡 {message.content}
                    </p>
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

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 p-4 bg-gray-50 rounded-b-lg"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g., I'm going to a summer evening rooftop party..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-400"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? "..." : "Send"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Try describing the occasion, time of day, and dress code!
          </p>
        </form>
      </div>
    </div>
  );
}
