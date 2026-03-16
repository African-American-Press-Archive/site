-- Papers table
CREATE TABLE IF NOT EXISTS papers (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT,
  issue_count INTEGER DEFAULT 0,
  first_date TEXT,
  last_date TEXT,
  thumbnail_url TEXT
);

-- Issues table
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  paper_slug TEXT NOT NULL REFERENCES papers(slug),
  date TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  thumbnail_url TEXT,
  ocr_excerpt TEXT
);

-- Pages table
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id),
  page_num INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  ocr_text TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_issues_year ON issues(year);
CREATE INDEX IF NOT EXISTS idx_issues_paper ON issues(paper_slug);
CREATE INDEX IF NOT EXISTS idx_issues_date ON issues(date);
CREATE INDEX IF NOT EXISTS idx_issues_paper_date ON issues(paper_slug, date);
CREATE INDEX IF NOT EXISTS idx_issues_paper_seq ON issues(paper_slug, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_issue_page ON pages(issue_id, page_num);

-- FTS5 virtual table (external content backed by pages)
CREATE VIRTUAL TABLE IF NOT EXISTS ocr_search USING fts5(
  ocr_text,
  issue_id UNINDEXED,
  content=pages,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with pages
CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO ocr_search(ocr_search, rowid, ocr_text, issue_id) VALUES ('delete', old.id, old.ocr_text, old.issue_id);
  INSERT INTO ocr_search(rowid, ocr_text, issue_id) VALUES (new.id, new.ocr_text, new.issue_id);
END;
