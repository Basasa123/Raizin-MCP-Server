// supabase/functions/mcp_node/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`MCP Node function booting up... v3 (dynamic agent profiles)`);

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const clarityAgentUrl = Deno.env.get('CLARITY_AGENT_URL');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
}
if (!clarityAgentUrl) {
    console.warn('Missing CLARITY_AGENT_URL environment variable. MCP will not be able to call Clarity Agent.');
}

// In-memory cache for agent profiles
let cachedAgentProfiles: Record<string, any> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAgentProfiles(supabase: SupabaseClient | null): Promise<Record<string, any>> {
    const now = Date.now();
    if (cachedAgentProfiles && (now - cacheTimestamp < CACHE_TTL)) {
        console.log("Returning agent profiles from cache.");
        return cachedAgentProfiles;
    }

    if (!supabase) {
        console.warn("Supabase client not available for getAgentProfiles. Returning empty profiles.");
        return {};
    }

    console.log("Fetching agent profiles from database...");
    try {
        const { data, error } = await supabase
            .from('agent_profiles')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error("Error fetching agent profiles:", error);
            // Return stale cache if available, otherwise empty
            return cachedAgentProfiles || {};
        }

        const profilesMap: Record<string, any> = {};
        if (data) {
            for (const profile of data) {
                profilesMap[profile.agent_id] = profile;
            }
        }

        cachedAgentProfiles = profilesMap;
        cacheTimestamp = now;
        console.log("Agent profiles fetched and cached:", cachedAgentProfiles);
        return cachedAgentProfiles;

    } catch (e) {
        console.error("Exception during getAgentProfiles:", e);
        return cachedAgentProfiles || {}; // Return stale cache on exception
    }
}


interface InputSignal {
  inputText: string;
  desiredFrequency?: {
    clarity?: number;
    [key: string]: number | undefined;
  };
  sessionId?: string;
  source?: string;
}

interface AgentResponse {
    status: string;
    agent_id: string;
    response_text: string;
    confidence_score: number;
}

interface McpResponse {
    status: string;
    reason?: string;
    resolution?: string;
    agent_id?: string;
    agent_response?: AgentResponse | null;
}

async function logInteraction(supabase: SupabaseClient | null, logData: any) {
    if (!supabase) {
        console.warn("Supabase client not initialized, skipping logInteraction.");
        return;
    }
    try {
        if (logData.agent_confidence_score) logData.agent_confidence_score = parseFloat(logData.agent_confidence_score);
        const { error } = await supabase.from('interaction_log').insert([logData]);
        if (error) console.error('Error logging interaction to Supabase:', error);
        else console.log('Interaction logged successfully.');
    } catch (e) {
        console.error('Exception during logInteraction:', e);
    }
}

serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fetch current agent profiles
  const AGENT_PROFILES = await getAgentProfiles(supabase);

  let mcpFinalResponse: McpResponse;
  let inputText = "";
  let sessionId: string | undefined;
  let source: string | undefined;
  let routedAgentId: string | null = null;
  let actualAgentResponse: AgentResponse | null = null;
  let transformedInputForAgent: any = null;

  let log_mcp_status: string = "";
  let log_mcp_reason: string | undefined;
  let log_routed_agent_id: string | undefined;
  let log_agent_response_text: string | undefined;
  let log_agent_confidence_score: number | undefined;
  let log_raw_mcp_response: any = {};
  let log_raw_agent_response: any = null;

  try {
    const requestBody: InputSignal = await req.json();
    inputText = requestBody.inputText;
    sessionId = requestBody.sessionId;
    source = requestBody.source || (req.headers.get('user-agent')?.includes('Mozilla') ? 'prototype_ui' : 'api_call');
    const { desiredFrequency } = requestBody;

    console.log('MCP Node received input:', { inputText, desiredFrequency, sessionId, source });
    console.log('Using AGENT_PROFILES:', AGENT_PROFILES);


    const clarityAgentProfile = AGENT_PROFILES["clarity_pulse_v1_001"];

    // --- 1. Dissonance Detection ---
    if (!inputText || inputText.trim().split(/\s+/).length < 3) {
      log_mcp_status = "dissonance_detected";
      log_mcp_reason = "Input too short";
      mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Please provide more details." };
    } else {
      const negativeKeywords = ["useless", "broken", "stupid", "fail"]; // Could also come from a config/DB
      if (negativeKeywords.some(keyword => inputText.toLowerCase().includes(keyword))) {
        log_mcp_status = "dissonance_detected";
        log_mcp_reason = "Potential negative sentiment";
        mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Could you please rephrase or provide more context?" };
      } else {
        // --- 2. Frequency Routing Rule (using dynamic profiles for selection) ---
        const clarityKeywords = clarityAgentProfile?.keywords || [];
        const wantsClarity = (desiredFrequency?.clarity && desiredFrequency.clarity > 0.7) ||
                             clarityKeywords.some(keyword => inputText.toLowerCase().includes(keyword));

        if (wantsClarity && clarityAgentProfile) {
          routedAgentId = clarityAgentProfile.agent_id;
          log_routed_agent_id = routedAgentId;
          transformedInputForAgent = { originalText: inputText, desiredFrequency, sessionId, source };

          // Invocation still uses specific env var for clarity agent for now
          if (clarityAgentUrl && routedAgentId === "clarity_pulse_v1_001") {
            console.log(`Attempting to call Clarity Agent at: ${clarityAgentUrl}`);
            try {
              const agentCallResponse = await fetch(clarityAgentUrl, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify(transformedInputForAgent)
              });

              if (!agentCallResponse.ok) {
                const errorBody = await agentCallResponse.text();
                throw new Error(`Clarity Agent call failed with status ${agentCallResponse.status}: ${errorBody}`);
              }
              actualAgentResponse = await agentCallResponse.json() as AgentResponse;
              log_agent_response_text = actualAgentResponse?.response_text;
              log_agent_confidence_score = actualAgentResponse?.confidence_score;
              log_raw_agent_response = actualAgentResponse;
              log_mcp_status = "routed_and_executed";
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, agent_response: actualAgentResponse };
              console.log(`Clarity Agent responded:`, actualAgentResponse);

            } catch (agentError) {
              console.error('Error calling Clarity Agent:', agentError);
              log_mcp_status = "routing_error";
              log_mcp_reason = `Failed to execute agent ${routedAgentId}: ${agentError.message}`;
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
            }
          } else {
            log_mcp_status = "routed_not_callable";
            log_mcp_reason = clarityAgentUrl ? `Agent ${routedAgentId} is not the configured Clarity Agent or profile mismatch` : "Clarity Agent URL not configured";
            mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
            console.log(log_mcp_reason);
          }
        } else {
          log_mcp_status = "no_route_found";
          log_mcp_reason = "No suitable agent profile matched the input frequency.";
          mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason };
          console.log('No suitable agent route found.');
        }
      }
    }

    log_raw_mcp_response = { ...mcpFinalResponse };

    const logEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: log_mcp_status, mcp_reason: log_mcp_reason,
        routed_agent_id: log_routed_agent_id, agent_response_text: log_agent_response_text,
        agent_confidence_score: log_agent_confidence_score, raw_mcp_response: log_raw_mcp_response,
        raw_agent_response: log_raw_agent_response, source: source
    };
    await logInteraction(supabase, logEntry);

    return new Response( JSON.stringify(mcpFinalResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Critical Error in MCP Node:', error);
    const errorResponse = { status: "error", message: error.message };
    const errorLogEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: "error", mcp_reason: error.message,
        raw_mcp_response: errorResponse, source: source
    };
    logInteraction(supabase, errorLogEntry).catch(logError => console.error("Failed to log critical error:", logError));
    return new Response( JSON.stringify(errorResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
