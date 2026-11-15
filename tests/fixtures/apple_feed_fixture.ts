export function createMockAppleFeed(options: {
  country?: string;
  updated?: string;
  count?: number;
  duplicateId?: boolean;
} = {}) {
  const country = options.country || "us";
  const updated = options.updated || new Date().toUTCString();
  const count = options.count !== undefined ? options.count : 100;

  const results: Array<{
    id: string;
    name: string;
    artistName: string;
    artworkUrl100: string;
    url: string;
    genres: unknown[];
  }> = [];

  for (let i = 1; i <= count; i++) {
    let id = String(1000000000 + i);
    let name = `App ${i}`;
    let artist = `Developer ${i}`;

    if (i === 4) {
      id = "6448311069";
      name = "ChatGPT";
      artist = "OpenAI OpCo, LLC";
    } else if (i === 11) {
      id = "6473753684";
      name = "Claude by Anthropic";
      artist = "Anthropic PBC";
    } else if (i === 25) {
      id = "6477489729";
      name = "Google Gemini";
      artist = "Google LLC";
    }

    if (options.duplicateId && i === 2) {
      id = String(1000000000 + 1); // duplicate id of App 1
    }

    results.push({
      id,
      name,
      artistName: artist,
      artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/mock/${id}/100x100bb.png`,
      url: `https://apps.apple.com/${country}/app/${id}`,
      genres: [],
    });
  }

  return {
    feed: {
      title: "Top Free Apps",
      id: `https://rss.marketingtools.apple.com/api/v2/${country}/apps/top-free/${count}/apps.json`,
      author: { name: "Apple", url: "https://www.apple.com/" },
      country,
      icon: "https://www.apple.com/favicon.ico",
      updated,
      results,
    },
  };
}
