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
    updated_at TIMESTAMPTZ DEFAULT now(),
    current_affinity_scores JSONB NULL -- Added in Phase 5
);

-- Optional: Index on is_active for quickly fetching active profiles
CREATE INDEX IF NOT EXISTS idx_agent_profiles_is_active ON agent_profiles(is_active);

-- Comment explaining the table's purpose
COMMENT ON TABLE agent_profiles IS 'Stores configuration and frequency profiles for all Harmonic Agents in the Raizin Vault system.';
COMMENT ON COLUMN agent_profiles.current_affinity_scores IS 'Dynamically adjusted scores representing the agent''s current affinity/effectiveness with different tones/frequencies.';


-- Seed data for the Clarity Agent
INSERT INTO agent_profiles (
    agent_id,
    name,
    description,
    frequency_profile,
    keywords,
    invocation_url,
    is_active,
    current_affinity_scores -- Added column
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
    'clarity_agent_v1',
    TRUE,
    '{ -- Added value, mirroring frequency_profile
        "trust": 0.8,
        "innovation": 0.3,
        "sovereignty": 0.6,
        "clarity": 0.95,
        "empathy": 0.2,
        "urgency": 0.7
    }'
) ON CONFLICT (agent_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    frequency_profile = EXCLUDED.frequency_profile,
    keywords = EXCLUDED.keywords,
    invocation_url = EXCLUDED.invocation_url,
    is_active = EXCLUDED.is_active,
    updated_at = now(), -- Update timestamp on conflict
    current_affinity_scores = EXCLUDED.current_affinity_scores;

-- Seed data for the Innovation Pulse Agent
INSERT INTO agent_profiles (
    agent_id,
    name,
    description,
    frequency_profile,
    keywords,
    invocation_url,
    is_active,
    current_affinity_scores -- Added column
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
    'innovation_agent_v1',
    TRUE,
    '{ -- Added value, mirroring frequency_profile
        "innovation": 0.95,
        "clarity": 0.55,
        "trust": 0.5,
        "sovereignty": 0.6,
        "empathy": 0.2,
        "urgency": 0.1
    }'
) ON CONFLICT (agent_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    frequency_profile = EXCLUDED.frequency_profile,
    keywords = EXCLUDED.keywords,
    invocation_url = EXCLUDED.invocation_url,
    is_active = EXCLUDED.is_active,
    updated_at = now(), -- Update timestamp on conflict
    current_affinity_scores = EXCLUDED.current_affinity_scores;

-- Seed data for the SA Service Delivery Agent
INSERT INTO agent_profiles (
    agent_id,
    name,
    description,
    frequency_profile,
    keywords,
    invocation_url,
    is_active,
    current_affinity_scores,
    updated_at -- Explicitly listing updated_at for clarity, though DEFAULT now() handles it on insert
) VALUES (
    'sa_service_agent_v1',
    'SA Service Delivery Agent',
    'Presents and facilitates payment for BOQ Assistance and Website Design services for the South African market.',
    '{
        "clarity": 0.9,
        "trust": 0.8,
        "innovation": 0.2,
        "sovereignty": 0.6,
        "empathy": 0.5,
        "urgency": 0.5
    }',
    ARRAY['sa services', 'south africa services', 'boq', 'bill of quantities', 'tender assist', 'website design', 'web design', 'get website', 'offer', 'pricing', 'cost', 'pay', 'ozow'],
    'sa_service_agent_v1',
    TRUE,
    '{
        "clarity": 0.9,
        "trust": 0.8,
        "innovation": 0.2,
        "sovereignty": 0.6,
        "empathy": 0.5,
        "urgency": 0.5
    }',
    now()
) ON CONFLICT (agent_id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    frequency_profile = EXCLUDED.frequency_profile,
    keywords = EXCLUDED.keywords,
    invocation_url = EXCLUDED.invocation_url,
    is_active = EXCLUDED.is_active,
    current_affinity_scores = EXCLUDED.current_affinity_scores,
    updated_at = now();
```
