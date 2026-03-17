export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  ASSETS: Fetcher;
}

export interface Paper {
  slug: string;
  title: string;
  location: string | null;
  issue_count: number;
  first_date: string | null;
  last_date: string | null;
  thumbnail_url: string | null;
  description: string | null;
  description_source: string | null;
  image_source: string | null;
}

export interface Issue {
  id: string;
  paper_slug: string;
  date: string;
  year: number;
  month: number;
  seq: number;
  page_count: number;
  thumbnail_url: string | null;
  ocr_excerpt: string | null;
}

export interface Page {
  id: number;
  issue_id: string;
  page_num: number;
  image_url: string;
  thumbnail_url: string | null;
  ocr_text: string | null;
}

export interface SearchResult {
  excerpt: string;
  issue_id: string;
  date: string;
  thumbnail_url: string | null;
  ocr_excerpt: string | null;
  paper_slug: string;
  page_num: number;
  paper_title: string;
  location: string | null;
}

export interface SearchFilters {
  fromYear?: number;
  toYear?: number;
  papers?: string[];
  sort?: 'relevance' | 'date-asc' | 'date-desc';
  page?: number;
}

export interface YearStat {
  year: number;
  count: number;
}
