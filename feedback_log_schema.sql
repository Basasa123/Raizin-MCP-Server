-- Schema for Basic Field Intelligence Feedback Logging

CREATE TABLE IF NOT EXISTS interaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    session_id TEXT,
    input_text TEXT,
    mcp_status TEXT, -- e.g., "routed", "dissonance_detected", "no_route_found", "error"
    mcp_reason TEXT, -- Optional: reason for dissonance or no route
    routed_agent_id TEXT, -- Optional: e.g., "clarity_pulse_v1_001"

    -- Fields for agent's actual response (can be filled by MCP if it calls agent sync, or by agent async)
    agent_response_text TEXT,
    agent_confidence_score REAL, -- Using REAL for float

    -- User feedback (for future use, not implemented in UI yet)
    user_feedback_score SMALLINT, -- e.g., -1 (down), 0 (neutral), 1 (up), or 1-5 scale

    -- Raw JSON responses for detailed analysis
    raw_mcp_response JSONB,
    raw_agent_response JSONB, -- To be filled if agent interaction is logged

    -- Additional context
    source TEXT -- e.g., 'prototype_ui', 'api_call'
);

-- Optional: Add indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_interaction_log_created_at ON interaction_log(created_at);
CREATE INDEX IF NOT EXISTS idx_interaction_log_mcp_status ON interaction_log(mcp_status);
CREATE INDEX IF NOT EXISTS idx_interaction_log_routed_agent_id ON interaction_log(routed_agent_id);

-- Comment explaining the table's purpose
COMMENT ON TABLE interaction_log IS 'Logs interactions processed by the MCP Node and responses from Agents, forming a basic layer of field intelligence.';
```
