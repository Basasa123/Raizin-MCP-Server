// supabase/functions/get_dissonance_spike_alerts/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`get_dissonance_spike_alerts function booting up...`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('get_dissonance_spike_alerts: Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
}

const DEFAULT_ALIGNMENT_THRESHOLD = 0.4; // Default for low filter_alignment_score
const DEFAULT_NEGATIVE_FEEDBACK_SCORE = -1; // User feedback score that indicates dissonance

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
        const daysParam = url.searchParams.get('days');
        const alignmentThresholdParam = url.searchParams.get('alignment_threshold');

        let days = 7; // Default to last 7 days
        if (daysParam) {
            const parsedDays = parseInt(daysParam, 10);
            if (!isNaN(parsedDays) && parsedDays > 0) { days = parsedDays; }
            else { /* Invalid 'days', use default or error */ }
        }

        let alignmentThreshold = DEFAULT_ALIGNMENT_THRESHOLD;
        if (alignmentThresholdParam) {
            const parsedThreshold = parseFloat(alignmentThresholdParam);
            if (!isNaN(parsedThreshold) && parsedThreshold >= 0 && parsedThreshold <= 1) {
                alignmentThreshold = parsedThreshold;
            } else { /* Invalid threshold, use default or error */ }
        }

        const startDate = new Date();
        startDate.setUTCHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - (days - 1));

        console.log(`Fetching dissonance alerts for last ${days} days (alignment < ${alignmentThreshold} or negative feedback).`);

        // Build the query using OR conditions for different types of dissonance
        // Supabase OR syntax: .or('filter_alignment_score.lt.0.4,user_feedback_score.eq.-1')
        const orFilterConditions = [
            `filter_alignment_score.lt.${alignmentThreshold}`,
            `user_feedback_score.eq.${DEFAULT_NEGATIVE_FEEDBACK_SCORE}`
        ].join(',');


        const { data, error } = await supabase
            .from('interaction_log')
            .select('id, created_at, routed_agent_id, input_text, filter_alignment_score, user_feedback_score, filter_warnings, mcp_status')
            .gte('created_at', startDate.toISOString())
            .or(orFilterConditions)
            .order('created_at', { ascending: false })
            .limit(100); // Limit results for performance

        if (error) {
            console.error('Error fetching dissonance alerts:', error);
            return new Response(JSON.stringify({ error: "Failed to fetch dissonance data.", details: error.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        return new Response(JSON.stringify(data || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('General error in get_dissonance_spike_alerts:', error);
        return new Response(JSON.stringify({ error: "An unexpected error occurred.", details: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});
