// supabase/functions/recalibrate_tone_affinity/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`recalibrate_tone_affinity function booting up...`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
// Use the SERVICE_ROLE_KEY for admin-level operations like updating agent_profiles
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('recalibrate_tone_affinity: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const LOG_LIMIT = 100; // Process last 100 logs per agent
const LEARNING_RATE = 0.01; // Small learning rate for adjustments
const TONE_DIMENSIONS = ["clarity", "innovation", "trust", "sovereignty", "empathy", "urgency"]; // Relevant dimensions

interface AgentProfile {
    agent_id: string;
    frequency_profile: { [key: string]: number }; // Designed/base frequencies
    current_affinity_scores: { [key: string]: number }; // Learned affinities
    // other fields...
}

interface InteractionLog {
    id: string;
    routed_agent_id: string;
    input_desired_frequency_profile?: { [key: string]: number };
    filter_value_alignment_details?: { [key: string]: number }; // from ResonatorFilter
    // other fields...
}

serve(async (req: Request) => {
  // This function should ideally be protected (e.g., by checking for a secret header or specific role)
  // For now, it's open, but in production, add auth.
  // Example: const authHeader = req.headers.get('Authorization'); if (authHeader !== `Bearer ${SOME_SECRET}`) return new Response ...

  const supabaseAdminClient = supabaseUrl && supabaseServiceRoleKey ?
                              createClient(supabaseUrl, supabaseServiceRoleKey) :
                              null;

  if (!supabaseAdminClient) {
    return new Response(JSON.stringify({ error: "Server configuration error: Supabase admin client not available." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }

  const processingSummary: string[] = [];

  try {
    processingSummary.push("Starting recalibration process...");

    // 1. Fetch all active agent profiles
    const { data: agents, error: agentError } = await supabaseAdminClient
        .from('agent_profiles')
        .select('agent_id, frequency_profile, current_affinity_scores')
        .eq('is_active', true);

    if (agentError) throw new Error(`Failed to fetch agent profiles: ${agentError.message}`);
    if (!agents || agents.length === 0) {
        processingSummary.push("No active agents found to recalibrate.");
        return new Response(JSON.stringify({ message: "No active agents.", summary: processingSummary }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    processingSummary.push(`Found ${agents.length} active agents.`);

    for (const agent of agents as AgentProfile[]) {
        processingSummary.push(`Processing agent: ${agent.agent_id}`);

        // Initialize current_affinity_scores if null, based on frequency_profile
        if (!agent.current_affinity_scores) {
            agent.current_affinity_scores = { ...agent.frequency_profile }; // Start with designed profile
            processingSummary.push(`Agent ${agent.agent_id}: Initialized current_affinity_scores from frequency_profile.`);
        }
        // Ensure all TONE_DIMENSIONS are present in current_affinity_scores, defaulting to 0.5 if missing
        TONE_DIMENSIONS.forEach(dim => {
            if (typeof agent.current_affinity_scores[dim] !== 'number') {
                 agent.current_affinity_scores[dim] = agent.frequency_profile[dim] || 0.5; // Default to profile or 0.5
            }
        });


        // 2. Fetch last LOG_LIMIT interaction logs for this agent
        const { data: logs, error: logError } = await supabaseAdminClient
            .from('interaction_log')
            .select('input_desired_frequency_profile, filter_value_alignment_details')
            .eq('routed_agent_id', agent.agent_id)
            .not('input_desired_frequency_profile', 'is', null) // Ensure these fields exist for calculation
            .not('filter_value_alignment_details', 'is', null)
            .order('created_at', { ascending: false })
            .limit(LOG_LIMIT);

        if (logError) {
            processingSummary.push(`Agent ${agent.agent_id}: Error fetching logs: ${logError.message}. Skipping.`);
            continue;
        }
        if (!logs || logs.length === 0) {
            processingSummary.push(`Agent ${agent.agent_id}: No relevant logs found for recalibration. Skipping.`);
            continue;
        }

        processingSummary.push(`Agent ${agent.agent_id}: Fetched ${logs.length} logs.`);

        const averageDeltas: { [key: string]: number } = {};
        const counts: { [key: string]: number } = {};

        // 3. Calculate average deltas for each tone dimension
        for (const log of logs as InteractionLog[]) {
            if (log.input_desired_frequency_profile && log.filter_value_alignment_details) {
                for (const dim of TONE_DIMENSIONS) {
                    const desired = log.input_desired_frequency_profile[dim];
                    const actual = log.filter_value_alignment_details[dim];

                    if (typeof desired === 'number' && typeof actual === 'number') {
                        const delta = actual - desired; // Positive if actual > desired, negative if actual < desired
                        averageDeltas[dim] = (averageDeltas[dim] || 0) + delta;
                        counts[dim] = (counts[dim] || 0) + 1;
                    }
                }
            }
        }

        const newAffinityScores = { ...agent.current_affinity_scores };
        let scoresChanged = false;

        for (const dim of TONE_DIMENSIONS) {
            if (counts[dim] && counts[dim] > 0) {
                const avgDelta = averageDeltas[dim] / counts[dim];
                const currentAffinity = newAffinityScores[dim] || 0.5; // Default if not set

                // If avgDelta is positive (agent overperforms), we might decrease affinity towards that if desired was lower.
                // If avgDelta is negative (agent underperforms), we might increase affinity if desired was higher.
                // This logic is simplistic: adjust towards reducing the magnitude of the delta.
                // If agent consistently provides higher 'clarity' than desired, its affinity for 'clarity' might be too high.
                // If avgDelta > 0 (actual > desired), adjustment is negative (reduce affinity).
                // If avgDelta < 0 (actual < desired), adjustment is positive (increase affinity).
                let adjustment = -avgDelta * LEARNING_RATE; // Adjust to counter the delta

                // More direct: If desired was high and actual was low, increase affinity.
                // If desired was low and actual was high, decrease affinity.
                // For now, let's use a simpler model: if performance (actual) is consistently different from desired, adjust.
                // Example: if actual clarity is 0.9 and desired was 0.5 (delta = 0.4), we reduce clarity affinity.
                // if actual clarity is 0.5 and desired was 0.9 (delta = -0.4), we increase clarity affinity.
                // This means `new_affinity = old_affinity - (learning_rate * average_delta)` -> adjustment = -avgDelta * LEARNING_RATE

                let newScore = currentAffinity + adjustment; // This was the intended logic based on the comment above.
                newScore = Math.max(0.05, Math.min(0.95, newScore)); // Keep scores within a reasonable bound (0.05-0.95)

                if (newAffinityScores[dim] !== newScore) { // Check if score actually changed meaningfully
                     newAffinityScores[dim] = parseFloat(newScore.toFixed(3));
                     scoresChanged = true;
                     processingSummary.push(`Agent ${agent.agent_id}: Dim '${dim}' affinity changed from ${currentAffinity.toFixed(3)} to ${newScore.toFixed(3)} (avg_delta: ${avgDelta.toFixed(3)})`);
                }
            }
        }

        // 4. Update agent_profiles if scores changed
        if (scoresChanged) {
            const { error: updateError } = await supabaseAdminClient
                .from('agent_profiles')
                .update({
                    current_affinity_scores: newAffinityScores,
                    updated_at: new Date().toISOString()
                })
                .eq('agent_id', agent.agent_id);

            if (updateError) {
                processingSummary.push(`Agent ${agent.agent_id}: ERROR updating affinity scores: ${updateError.message}`);
            } else {
                processingSummary.push(`Agent ${agent.agent_id}: Successfully updated affinity scores.`);
            }
        } else {
            processingSummary.push(`Agent ${agent.agent_id}: No significant changes to affinity scores.`);
        }
    }

    processingSummary.push("Recalibration process completed.");
    return new Response(JSON.stringify({ success: true, summary: processingSummary }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('Error in recalibrate_tone_affinity function:', error);
    processingSummary.push(`Critical error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message, summary: processingSummary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
