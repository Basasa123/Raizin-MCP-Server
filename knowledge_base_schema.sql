-- Schema for Storing Knowledge Base Articles for Agents

CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_slug TEXT UNIQUE NOT NULL, -- A unique slug for the article, e.g., "what-is-raizin-vault"
    question TEXT, -- Optional: A specific question this article answers
    answer TEXT NOT NULL, -- The content/answer
    keywords TEXT[], -- Keywords for searching/matching
    agent_applicability TEXT[] DEFAULT ARRAY['clarity_pulse_v1_001'], -- Which agents can use this (can be NULL for all)
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Indexes for searching
CREATE INDEX IF NOT EXISTS idx_knowledge_base_slug ON knowledge_base(article_slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_keywords ON knowledge_base USING GIN(keywords); -- GIN index for array searching
CREATE INDEX IF NOT EXISTS idx_knowledge_base_agent_applicability ON knowledge_base USING GIN(agent_applicability);

-- Comment explaining the table's purpose
COMMENT ON TABLE knowledge_base IS 'Stores question/answer pairs and informational articles for agents to use.';

-- Seed data
INSERT INTO knowledge_base (
    article_slug,
    question,
    answer,
    keywords,
    agent_applicability
) VALUES (
    'what-is-raizin-vault',
    'what is raizin vault?',
    'Raizin Vault, as envisioned, is ''A carrier of encoded evolution, built from frequency, not code.'' It operates on the core values of: Transmit trust, Transmit innovation, Transmit sovereignty. My purpose is to provide clear and trustworthy information.',
    ARRAY['raizin vault', 'definition', 'vision', 'core values'],
    ARRAY['clarity_pulse_v1_001']
), (
    'core-values-detail',
    'tell me more about the core values',
    'The core values of Raizin Vault are: 1. Transmit trust - fostering transparency and reliability. 2. Transmit innovation - encouraging forward-thinking and creativity. 3. Transmit sovereignty - empowering individual autonomy and respect.',
    ARRAY['core values', 'trust', 'innovation', 'sovereignty', 'details'],
    ARRAY['clarity_pulse_v1_001']
), (
    'mcp-purpose',
    'what is the mcp?',
    'The Master Control Protocol (MCP) is a tunable frequency router. It directs signals, processes, and energy flows within Raizin Vault, sensing dissonance and aligning agents.',
    ARRAY['mcp', 'master control protocol', 'purpose', 'function'],
    ARRAY['clarity_pulse_v1_001']
) ON CONFLICT (article_slug) DO NOTHING;

```
