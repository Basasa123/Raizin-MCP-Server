// supabase/functions/get_top_routed_agents_by_tone/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`get_top_routed_agents_by_tone function booting up...`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('get_top_routed_agents_by_tone: Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
}

const TONE_THRESHOLD = 0.5; // Min score for a tone to be considered "desired"

serve(async (req: Request) => {
    const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (!supabase) {
        return new Response(JSON.stringify({ error: "Server configuration error." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    try {
        const url = new URL(req.url);
        const toneDimension = url.searchParams.get('tone_dimension');
        const daysParam = url.searchParams.get('days');

        if (!toneDimension) {
            return new Response(JSON.stringify({ error: "Missing 'tone_dimension' query parameter." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        let days = 7; // Default to last 7 days
        if (daysParam) {
            const parsedDays = parseInt(daysParam, 10);
            if (!isNaN(parsedDays) && parsedDays > 0) {
                days = parsedDays;
            } else {
                return new Response(JSON.stringify({ error: "Invalid 'days' parameter." }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
            }
        }

        const startDate = new Date();
        startDate.setUTCHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));

        console.log(`Fetching top agents for tone '${toneDimension}' for the last ${days} days.`);

        // Fetch logs that have the specified tone_dimension in input_desired_frequency_profile
        // and where an agent was routed.
        // This query is a bit tricky with JSONB. We fetch more data and process in code.
        const { data: logs, error } = await supabase
            .from('interaction_log')
            .select('routed_agent_id, input_desired_frequency_profile, filter_alignment_score')
            .gte('created_at', startDate.toISOString())
            .not('input_desired_frequency_profile', 'is', null)
            .not('routed_agent_id', 'is', null) // Ensure an agent was routed
            .not('filter_alignment_score', 'is', null); // Ensure resonance score exists

        if (error) {
            console.error('Error fetching data for top agents by tone:', error);
            return new Response(JSON.stringify({ error: "Failed to fetch data.", details: error.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        const agentStats: {
            [agentId: string]: { count: number; totalResonanceScore: number; avgResonanceScore?: number }
        } = {};

        if (logs) {
            for (const log of logs) {
                if (!log.input_desired_frequency_profile || typeof log.input_desired_frequency_profile !== 'object' || !log.routed_agent_id) {
                    continue;
                }

                const desiredProfile = log.input_desired_frequency_profile as { [key: string]: any };

                // Check if the specified toneDimension was significantly desired
                if (typeof desiredProfile[toneDimension] === 'number' && desiredProfile[toneDimension] >= TONE_THRESHOLD) {
                    if (!agentStats[log.routed_agent_id]) {
                        agentStats[log.routed_agent_id] = { count: 0, totalResonanceScore: 0 };
                    }
                    agentStats[log.routed_agent_id].count++;
                    agentStats[log.routed_agent_id].totalResonanceScore += log.filter_alignment_score || 0;
                }
            }
        }

        // Calculate average resonance score and prepare output array
        const result = Object.entries(agentStats).map(([agent_id, stats]) => ({
            agent_id,
            routing_count: stats.count,
            average_resonance_score: stats.count > 0 ? parseFloat((stats.totalResonanceScore / stats.count).toFixed(3)) : 0
        })).sort((a, b) => b.routing_count - a.routing_count); // Sort by count descending


        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('General error in get_top_routed_agents_by_tone:', error);
        return new Response(JSON.stringify({ error: "An unexpected error occurred.", details: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});
