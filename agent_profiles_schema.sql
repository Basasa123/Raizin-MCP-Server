-- Schema for Storing Agent Profiles

CREATE TABLE IF NOT EXISTS agent_profiles (
    agent_id TEXT PRIMARY KEY, -- e.g., "clarity_pulse_v1_001"
    name TEXT NOT NULL,
    description TEXT,

    -- Core frequency profile (JSONB for flexibility)
    -- Example: {"trust": 0.8, "clarity": 0.95, "innovation": 0.3, ...}
    frequency_profile JSONB NOT NULL,

    keywords TEXT[], -- Array of keywords for simple routing

    -- URL or identifier for invoking the agent (e.g., Supabase function URL)
    invocation_url TEXT,

    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Optional: Index on is_active for quickly fetching active profiles
CREATE INDEX IF NOT EXISTS idx_agent_profiles_is_active ON agent_profiles(is_active);

-- Comment explaining the table's purpose
COMMENT ON TABLE agent_profiles IS 'Stores configuration and frequency profiles for all Harmonic Agents in the Raizin Vault system.';

-- Seed data for the Clarity Agent
INSERT INTO agent_profiles (
    agent_id,
    name,
    description,
    frequency_profile,
    keywords,
    invocation_url,
    is_active
) VALUES (
    'clarity_pulse_v1_001',
    'Instant Clarity Agent',
    'Responds to direct questions with concise and clear information, prioritizing factual accuracy.',
    '{
        "trust": 0.8,
        "innovation": 0.3,
        "sovereignty": 0.6,
        "clarity": 0.95,
        "empathy": 0.2,
        "urgency": 0.7
    }',
    ARRAY['what is', 'explain', 'define', 'how to', 'faq'],
    'clarity_agent_v1', -- This should match the function name for Supabase, or be the full URL.
                        -- MCP will need to know how to construct the full URL if only function name is given.
                        -- For now, MCP's CLARITY_AGENT_URL env var is separate.
                        -- This field provides a more generic way if we have many agents.
    TRUE
) ON CONFLICT (agent_id) DO NOTHING; -- Avoid error if script is run multiple times

-- Seed data for the Innovation Pulse Agent
INSERT INTO agent_profiles (
    agent_id,
    name,
    description,
    frequency_profile,
    keywords,
    invocation_url,
    is_active
) VALUES (
    'innovation_pulse_v1_001',
    'Innovation Pulse Agent',
    'Generates creative ideas, brainstorms solutions, and offers novel perspectives using an LLM.',
    '{
        "innovation": 0.95,
        "clarity": 0.55,
        "trust": 0.5,
        "sovereignty": 0.6,
        "empathy": 0.2,
        "urgency": 0.1
    }',
    ARRAY['suggest', 'idea', 'ideas', 'brainstorm', 'what if', 'creative', 'novel', 'alternative'],
    'innovation_agent_v1', -- This will be its Supabase function name
    TRUE
) ON CONFLICT (agent_id) DO NOTHING;
```
