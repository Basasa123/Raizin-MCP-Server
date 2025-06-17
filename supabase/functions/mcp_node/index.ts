// supabase/functions/mcp_node/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`MCP Node function booting up...`);

// Initialize Supabase client
// IMPORTANT: These environment variables must be set in your Supabase project's Edge Function settings
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY'); // Or service_role key if needed for write access and RLS is restrictive

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
    // Depending on policy, you might want to prevent the function from serving if Supabase isn't configured
}

// Placeholder for Agent Profile data
const AGENT_PROFILES = {
  "clarity_pulse_v1_001": {
    agent_id: "clarity_pulse_v1_001",
    name: "Instant Clarity Agent",
    frequency_profile: { clarity: 0.95, trust: 0.8 },
    keywords: ["what is", "explain", "define", "how to", "faq"]
  }
};

interface InputSignal {
  inputText: string;
  desiredFrequency?: {
    clarity?: number;
    [key: string]: number | undefined;
  };
  sessionId?: string;
  source?: string; // Added source for logging
}

interface McpResponse {
    status: string;
    reason?: string;
    resolution?: string;
    agent_id?: string;
    transformed_input?: any;
}

async function logInteraction(supabase: SupabaseClient | null, logData: any) {
    if (!supabase) {
        console.warn("Supabase client not initialized, skipping logInteraction.");
        return;
    }
    try {
        const { error } = await supabase.from('interaction_log').insert([logData]);
        if (error) {
            console.error('Error logging interaction to Supabase:', error);
        } else {
            console.log('Interaction logged successfully.');
        }
    } catch (e) {
        console.error('Exception during logInteraction:', e);
    }
}

serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let mcpResponse: McpResponse;
  let inputText = "";
  let sessionId: string | undefined;
  let source: string | undefined;

  try {
    const requestBody: InputSignal = await req.json();
    inputText = requestBody.inputText;
    sessionId = requestBody.sessionId;
    source = requestBody.source || (req.headers.get('user-agent')?.includes('Mozilla') ? 'prototype_ui' : 'api_call'); // Basic source detection
    const { desiredFrequency } = requestBody;

    console.log('MCP Node received input:', { inputText, desiredFrequency, sessionId, source });

    let routedAgentId: string | null = null;

    // --- 1. Dissonance Detection ---
    if (!inputText || inputText.trim().split(/\s+/).length < 3) {
      mcpResponse = {
        status: "dissonance_detected",
        reason: "Input too short",
        resolution: "Please provide more details."
      };
    } else {
      const negativeKeywords = ["useless", "broken", "stupid", "fail"];
      if (negativeKeywords.some(keyword => inputText.toLowerCase().includes(keyword))) {
        mcpResponse = {
          status: "dissonance_detected",
          reason: "Potential negative sentiment",
          resolution: "Could you please rephrase or provide more context?"
        };
      } else {
        // --- 2. Frequency Routing Rule ---
        const clarityKeywords = AGENT_PROFILES["clarity_pulse_v1_001"].keywords;
        const wantsClarity = (desiredFrequency?.clarity && desiredFrequency.clarity > 0.7) ||
                             clarityKeywords.some(keyword => inputText.toLowerCase().includes(keyword));

        if (wantsClarity && AGENT_PROFILES["clarity_pulse_v1_001"]) {
          routedAgentId = "clarity_pulse_v1_001";
          mcpResponse = {
            status: "routed",
            agent_id: routedAgentId,
            transformed_input: { originalText: inputText, desiredFrequency }
          };
          console.log(`Routing to Clarity Agent: ${routedAgentId}`);
        } else {
          mcpResponse = {
            status: "no_route_found",
            reason: "No suitable agent profile matched the input frequency."
          };
          console.log('No suitable agent route found.');
        }
      }
    }

    // --- Log Interaction (excluding transformed_input from raw_mcp_response for brevity if large) ---
    const logEntry = {
        session_id: sessionId,
        input_text: inputText,
        mcp_status: mcpResponse.status,
        mcp_reason: mcpResponse.reason,
        routed_agent_id: mcpResponse.agent_id,
        raw_mcp_response: { ...mcpResponse, transformed_input: undefined }, // Avoid logging potentially large/redundant input
        source: source
    };
    await logInteraction(supabase, logEntry);

    return new Response(
      JSON.stringify(mcpResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in MCP Node:', error);
    const errorResponse = { status: "error", message: error.message };
    // Log error interaction
    const errorLogEntry = {
        session_id: sessionId,
        input_text: inputText, // inputText might not be available if JSON parsing failed
        mcp_status: "error",
        mcp_reason: error.message,
        raw_mcp_response: errorResponse,
        source: source
    };
    await logInteraction(supabase, errorLogEntry);

    return new Response(
      JSON.stringify(errorResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
