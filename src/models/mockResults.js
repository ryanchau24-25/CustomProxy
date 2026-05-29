const searchData = [
  {
    keywords: ['instagram', 'insta', 'photo', 'social'],
    title: 'Instagram',
    description: 'Connect with friends, share photos, and explore new content on Instagram.',
    url: 'https://www.instagram.com',
    source: 'instagram.com',
  },
  {
    keywords: ['google', 'search', 'engine', 'browser'],
    title: 'Google',
    description: 'Search the world with Google. Discover websites, images, news, and more.',
    url: 'https://www.google.com',
    source: 'google.com',
  },
  {
    keywords: ['youtube', 'video', 'streaming', 'music'],
    title: 'YouTube',
    description: 'Watch, share, and upload videos on YouTube. Join the world’s largest video community.',
    url: 'https://www.youtube.com',
    source: 'youtube.com',
  },
  {
    keywords: ['twitter', 'x', 'social', 'tweet'],
    title: 'X (Twitter)',
    description: 'See what’s happening in the world and join the conversation on X.',
    url: 'https://www.x.com',
    source: 'x.com',
  },
  {
    keywords: ['facebook', 'meta', 'social', 'community'],
    title: 'Facebook',
    description: 'Connect with friends and family on Facebook. Share updates, photos, and events.',
    url: 'https://www.facebook.com',
    source: 'facebook.com',
  },
  {
    keywords: ['news', 'headlines', 'media', 'journalism'],
    title: 'Global News',
    description: 'Stay updated with the latest world news, business reports, and local headlines.',
    url: 'https://www.bbc.com/news',
    source: 'bbc.com',
  },
  {
    keywords: ['shopping', 'amazon', 'store', 'ecommerce'],
    title: 'Amazon',
    description: 'Shop millions of products with fast delivery and great deals on Amazon.',
    url: 'https://www.amazon.com',
    source: 'amazon.com',
  },
  {
    keywords: ['weather', 'forecast', 'temperature', 'rain'],
    title: 'Weather Forecast',
    description: 'Check the latest weather forecast, temperature, and rain outlook in your area.',
    url: 'https://www.weather.com',
    source: 'weather.com',
  },
  {
    keywords: ['maps', 'navigation', 'directions', 'travel'],
    title: 'Google Maps',
    description: 'Find directions, explore nearby places, and get traffic updates with Google Maps.',
    url: 'https://maps.google.com',
    source: 'maps.google.com',
  },
  {
    keywords: ['images', 'photo search', 'pictures', 'gallery'],
    title: 'Image Search',
    description: 'Browse high-quality images from around the web with advanced filtering tools.',
    url: 'https://images.google.com',
    source: 'images.google.com',
  },
];

function normalize(text) {
  return text.trim().toLowerCase();
}

function buildSuggestions(query) {
  const normalized = normalize(query);
  if (!normalized) return [];

  const suggestions = new Set();
  searchData.forEach((entry) => {
    entry.keywords.forEach((keyword) => {
      if (keyword.startsWith(normalized) || normalized.includes(keyword)) {
        suggestions.add(keyword);
      }
    });
    if (entry.title.toLowerCase().includes(normalized)) {
      suggestions.add(entry.title);
    }
  });

  if (suggestions.size === 0) {
    const words = normalized.split(' ').slice(0, 3);
    words.forEach((word) => suggestions.add(word));
  }

  return Array.from(suggestions).slice(0, 6);
}

function search(query, page = 1, pageSize = 7) {
  const normalized = normalize(query);
  const matches = searchData
    .map((entry) => {
      const score = entry.keywords.reduce((acc, keyword) => {
        if (keyword === normalized) return acc + 20;
        if (keyword.includes(normalized) || normalized.includes(keyword)) return acc + 10;
        return acc;
      }, 0) + (entry.title.toLowerCase().includes(normalized) ? 5 : 0);
      return { ...entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    const fallback = searchData.slice(0, pageSize).map((entry) => ({ ...entry, score: 1 }));
    return {
      results: fallback,
      total: fallback.length,
      page,
      totalPages: 1,
      query,
    };
  }

  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  const results = matches.slice(offset, offset + pageSize);

  return { results, total, page, totalPages, query };
}

function luckyResult(query) {
  const normalized = normalize(query);
  const direct = searchData.find((entry) =>
    entry.keywords.some((keyword) => keyword === normalized) || entry.title.toLowerCase() === normalized
  );
  if (direct) return direct;
  const results = search(query, 1, 1).results;
  return results[0] || searchData[0];
}

module.exports = {
  search,
  buildSuggestions,
  luckyResult,
};
