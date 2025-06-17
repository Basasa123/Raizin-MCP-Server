// supabase/functions/get_agent_resonance_trends/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`get_agent_resonance_trends function booting up...`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
// Use ANON_KEY as this is for read-only data for a dashboard, RLS can protect if needed.
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('get_agent_resonance_trends: Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
}

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
        const agentId = url.searchParams.get('agent_id');
        const daysParam = url.searchParams.get('days');

        if (!agentId) {
            return new Response(JSON.stringify({ error: "Missing 'agent_id' query parameter." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
        }

        let days = 7; // Default to last 7 days
        if (daysParam) {
            const parsedDays = parseInt(daysParam, 10);
            if (!isNaN(parsedDays) && parsedDays > 0) {
                days = parsedDays;
            } else {
                return new Response(JSON.stringify({ error: "Invalid 'days' parameter. Must be a positive integer." }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
            }
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        console.log(`Fetching resonance trends for agent ${agentId} for the last ${days} days (since ${startDate.toISOString()}).`);

        const { data, error } = await supabase
            .from('interaction_log')
            .select('created_at, filter_alignment_score')
            .eq('routed_agent_id', agentId)
            .gte('created_at', startDate.toISOString())
            .not('filter_alignment_score', 'is', null) // Only include logs where this score exists
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching agent resonance trends:', error);
            return new Response(JSON.stringify({ error: "Failed to fetch data.", details: error.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        return new Response(JSON.stringify(data || []), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('General error in get_agent_resonance_trends:', error);
        return new Response(JSON.stringify({ error: "An unexpected error occurred.", details: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});
