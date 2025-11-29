"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthContext } from "@/lib/auth-context";
import { WardrobeUpload } from "./WardrobeUpload";
import { WardrobeGallery } from "./WardrobeGallery";
import { ChatInterface } from "./ChatInterface";

interface User {
  id: number;
  email: string;
  name: string | null;
  gender: "M" | "F";
}

export function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"upload" | "gallery" | "chat">(
    "gallery"
  );
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // Call logout endpoint to clear session
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        // Clear localStorage auth context
        clearAuthContext();
        // Redirect to login page
        router.push("/login");
        router.refresh();
      } else {
        console.error("Logout failed");
        setIsSigningOut(false);
      }
    } catch (error) {
      console.error("Logout error:", error);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-purple-600">
                AI Wardrobe
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-700">{user.email}</span>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 disabled:opacity-50 cursor-pointer"
              >
                {isSigningOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-4 py-2 font-medium ${
              activeTab === "upload"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => setActiveTab("gallery")}
            className={`px-4 py-2 font-medium ${
              activeTab === "gallery"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            My Wardrobe
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 font-medium ${
              activeTab === "chat"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Get Recommendations
          </button>
        </div>

        {activeTab === "upload" && <WardrobeUpload />}
        {activeTab === "gallery" && <WardrobeGallery />}
        {activeTab === "chat" && <ChatInterface />}
      </div>
    </div>
  );
}
