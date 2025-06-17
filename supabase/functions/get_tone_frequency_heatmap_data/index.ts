// supabase/functions/get_tone_frequency_heatmap_data/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`get_tone_frequency_heatmap_data function booting up...`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('get_tone_frequency_heatmap_data: Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
}

// Define the tone dimensions we are interested in tracking for the heatmap
const TRACKED_TONES = ["clarity", "innovation", "trust", "sovereignty", "empathy", "urgency"];
const TONE_THRESHOLD = 0.5; // Minimum score for a tone to be considered "desired" in the input

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
        startDate.setUTCHours(0, 0, 0, 0); // Start of today UTC
        startDate.setDate(startDate.getDate() - (days - 1)); // Go back (days-1) to include today fully

        console.log(`Fetching tone frequency heatmap data for the last ${days} days (since ${startDate.toISOString()}).`);

        // Fetch logs that have the input_desired_frequency_profile
        const { data: logs, error } = await supabase
            .from('interaction_log')
            .select('created_at, input_desired_frequency_profile')
            .gte('created_at', startDate.toISOString())
            .not('input_desired_frequency_profile', 'is', null);

        if (error) {
            console.error('Error fetching tone frequency data:', error);
            return new Response(JSON.stringify({ error: "Failed to fetch data.", details: error.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
        }

        const heatmapData: { [date: string]: { [tone: string]: number } } = {};

        if (logs) {
            for (const log of logs) {
                if (!log.input_desired_frequency_profile || typeof log.input_desired_frequency_profile !== 'object') {
                    continue;
                }

                const dateStr = new Date(log.created_at).toISOString().split('T')[0]; // YYYY-MM-DD

                if (!heatmapData[dateStr]) {
                    heatmapData[dateStr] = {};
                    TRACKED_TONES.forEach(tone => heatmapData[dateStr][tone] = 0);
                }

                const desiredProfile = log.input_desired_frequency_profile as { [key: string]: any };
                for (const tone of TRACKED_TONES) {
                    if (typeof desiredProfile[tone] === 'number' && desiredProfile[tone] >= TONE_THRESHOLD) {
                        heatmapData[dateStr][tone]++;
                    }
                }
            }
        }

        // Ensure all days in the range are present, even if with zero counts
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const dateKey = d.toISOString().split('T')[0];
            if (!heatmapData[dateKey]) {
                heatmapData[dateKey] = {};
                TRACKED_TONES.forEach(tone => heatmapData[dateKey][tone] = 0);
            }
        }


        return new Response(JSON.stringify(heatmapData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('General error in get_tone_frequency_heatmap_data:', error);
        return new Response(JSON.stringify({ error: "An unexpected error occurred.", details: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }
});
