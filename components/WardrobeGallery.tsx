"use client";

import { useState, useEffect } from "react";

interface WardrobeItem {
  id: string;
  image_url: string;
  category: string;
  style: string;
  season: string;
  colors: string[];
  tags: string[];
  createdAt: string;
}

export function WardrobeGallery() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: "",
    style: "",
    season: "",
  });

  useEffect(() => {
    fetchItems();
  }, [filters]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append("category", filters.category);
      if (filters.style) params.append("style", filters.style);
      if (filters.season) params.append("season", filters.season);

      const response = await fetch(`/api/wardrobe/items?${params.toString()}`);
      const data = await response?.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">My Wardrobe</h2>
        <div className="flex gap-4">
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Categories</option>
            <option value="shirt">Shirt</option>
            <option value="pants">Pants</option>
            <option value="dress">Dress</option>
            <option value="shoes">Shoes</option>
            <option value="jacket">Jacket</option>
            <option value="accessory">Accessory</option>
            <option value="other">Other</option>
          </select>
          <select
            value={filters.style}
            onChange={(e) => setFilters({ ...filters, style: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Styles</option>
            <option value="formal">Formal</option>
            <option value="semi-formal">Semi-Formal</option>
            <option value="casual">Casual</option>
            <option value="sporty">Sporty</option>
          </select>
          <select
            value={filters.season}
            onChange={(e) => setFilters({ ...filters, season: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="">All Seasons</option>
            <option value="summer">Summer</option>
            <option value="winter">Winter</option>
            <option value="spring">Spring</option>
            <option value="fall">Fall</option>
            <option value="any">Any</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No items found. Upload your first wardrobe item!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="aspect-square bg-gray-100 relative">
                <img
                  src={item.image_url}
                  alt={item.category}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "/placeholder-image.png";
                  }}
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-900 capitalize">
                    {item.category}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">
                    {item.style}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.colors.slice(0, 3).map((color, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                    >
                      {color}
                    </span>
                  ))}
                </div>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
