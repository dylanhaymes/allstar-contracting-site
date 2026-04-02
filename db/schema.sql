-- All Star Contracting & Seamless Gutters LLC
-- Database schema for lead capture

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  address TEXT,
  message TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  ip_address VARCHAR(50),
  source VARCHAR(100) DEFAULT 'website'
);

-- Index for querying by submission date
CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads (submitted_at DESC);

-- Index for searching by email
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
