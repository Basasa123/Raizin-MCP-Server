// supabase/functions/log_user_feedback/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`log_user_feedback function booting up...`);

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY'); // Use anon key, RLS should allow logged-in users or specific conditions

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('log_user_feedback: Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
}

interface FeedbackInput {
  interaction_id: string; // UUID
  feedback_score: -1 | 1;
}

serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!supabase) {
    console.error("log_user_feedback: Supabase client not initialized.");
    return new Response(JSON.stringify({ error: "Server configuration error." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
    });
  }

  try {
    const { interaction_id, feedback_score }: FeedbackInput = await req.json();

    // Validate input
    if (!interaction_id || typeof interaction_id !== 'string' ) { // Basic UUID check could be more robust
        return new Response(JSON.stringify({ error: "Invalid interaction_id provided." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
    if (feedback_score !== 1 && feedback_score !== -1) {
        return new Response(JSON.stringify({ error: "Invalid feedback_score. Must be 1 or -1." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }

    console.log(`log_user_feedback: Received feedback for interaction ${interaction_id}, score: ${feedback_score}`);

    const { data, error } = await supabase
      .from('interaction_log')
      .update({ user_feedback_score: feedback_score, updated_at: new Date().toISOString() }) // Also update updated_at
      .eq('id', interaction_id)
      .select('id') // Optionally return some data to confirm
      .single(); // Expect only one row to be updated

    if (error) {
      console.error('log_user_feedback: Error updating interaction_log:', error);
      // Check for specific errors, e.g., P0001 for RLS violation if you have specific policies
      return new Response(JSON.stringify({ error: "Failed to record feedback.", details: error.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    if (!data) {
        // This means the interaction_id was not found
        console.warn(`log_user_feedback: Interaction ID ${interaction_id} not found.`);
        return new Response(JSON.stringify({ error: "Interaction not found." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404 // Not Found
        });
    }

    console.log(`log_user_feedback: Feedback recorded for interaction ${data.id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Feedback recorded.", interaction_id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('log_user_feedback: General error:', error);
    // Check if it's a JSON parsing error from await req.json()
    if (error instanceof SyntaxError && error.message.includes("JSON")) {
        return new Response(JSON.stringify({ error: "Invalid JSON payload." }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred.", details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
