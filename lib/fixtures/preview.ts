/**
 * Made-up Brand search and News search responses for the Add panel preview, typed against the context.dev SDK.
 * Never use them for the README, the demo GIF or any public image.
 */
import type { BrandSearchResponse, NewsSearchResponse } from "context.dev/resources";

export const fixtureBrandSearch: BrandSearchResponse = {
  request_id: "req_fx_brand",
  results: [
    {
      name: "Acme Notes",
      domain: "acme-notes.example",
      logo: "https://logos.example/acme-notes.png",
      country: "US",
      description: "Acme Notes records meetings and writes the notes for your team.",
    },
    { name: "Acme Notebooks", domain: "acme-notebooks.example", logo: "https://logos.example/acme-notebooks.png" },
  ],
};

const source = { name: "Sample Daily", domain: "sample-daily.example", direct: true };

export const fixtureNewsSearch: NewsSearchResponse = {
  request_id: "req_fx_news",
  has_more: false,
  next_cursor: null,
  meta: { count: 3 },
  data: [
    {
      id: "art_fx_1",
      story_id: "story_fx_seed",
      title: "Acme Notes announces a seed round",
      description: "Acme Notes has raised a seed round. It plans to double its sales team next year.",
      url: "https://sample-daily.example/acme-notes-seed",
      published_at: "2026-11-03T06:00:00Z",
      authors: ["Sam Writer"],
      image_url: null,
      language: "en",
      type: "editorial",
      match: { level: "primary", confidence: 0.92 },
      source,
    },
    {
      // Same story from another outlet. The preview collapses equal story_id.
      id: "art_fx_2",
      story_id: "story_fx_seed",
      title: "Meeting notes startup Acme Notes raises seed funding",
      description: "The company will grow its sales team.",
      url: "https://other-news.example/acme-notes-funding",
      published_at: "2026-11-03T08:00:00Z",
      authors: [],
      image_url: null,
      language: "en",
      type: "editorial",
      match: { level: "primary", confidence: 0.88 },
      source: { name: "Other News", domain: "other-news.example", direct: false },
    },
    {
      // Only a mention. The preview keeps match.level = primary.
      id: "art_fx_3",
      story_id: "story_fx_roundup",
      title: "Ten note-taking apps to try this year",
      description: "A roundup that mentions Acme Notes.",
      url: "https://sample-daily.example/note-apps-roundup",
      published_at: "2026-10-20T10:00:00Z",
      authors: [],
      image_url: null,
      language: "en",
      type: "editorial",
      match: { level: "secondary", confidence: 0.4 },
      source,
    },
  ],
};
