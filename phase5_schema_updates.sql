-- Phase 5 Schema Updates for Tone Memory Graph & Affinity Scores

-- Add column to interaction_log to store the input desired frequency profile
ALTER TABLE interaction_log
ADD COLUMN IF NOT EXISTS input_desired_frequency_profile JSONB NULL;

COMMENT ON COLUMN interaction_log.input_desired_frequency_profile IS 'The desired frequency profile from the input signal to the MCP, representing the "input_tone".';

-- Add column to agent_profiles to store current affinity scores
-- This is part of Step 2 of Phase 5, but good to have schema changes grouped if possible.
-- If this step is strictly about TMG logging, this can be moved.
-- For now, including it as it's a schema update for Phase 5.
ALTER TABLE agent_profiles
ADD COLUMN IF NOT EXISTS current_affinity_scores JSONB NULL;

COMMENT ON COLUMN agent_profiles.current_affinity_scores IS 'Dynamically adjusted scores representing the agent''s current affinity/effectiveness with different tones/frequencies.';

-- Also, ensure the resonator_filter's detailed value_alignment is captured for recalibration.
-- This will be logged by MCP based on filter's output.
ALTER TABLE interaction_log
ADD COLUMN IF NOT EXISTS filter_value_alignment_details JSONB NULL;

COMMENT ON COLUMN interaction_log.filter_value_alignment_details IS 'Detailed value alignment scores {trust, innovation, sovereignty} from the Resonator Filter.';

```
