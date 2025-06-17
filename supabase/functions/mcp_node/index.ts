// supabase/functions/mcp_node/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`MCP Node function booting up... v4 (detailed agent logging)`);

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const clarityAgentUrl = Deno.env.get('CLARITY_AGENT_URL');

if (!supabaseUrl || !supabaseAnonKey) console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
if (!clarityAgentUrl) console.warn('Missing CLARITY_AGENT_URL. MCP cannot call Clarity Agent.');

let cachedAgentProfiles: Record<string, any> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAgentProfiles(supabase: SupabaseClient | null): Promise<Record<string, any>> {
    const now = Date.now();
    if (cachedAgentProfiles && (now - cacheTimestamp < CACHE_TTL)) return cachedAgentProfiles;
    if (!supabase) return {};
    console.log("Fetching agent profiles from database...");
    try {
        const { data, error } = await supabase.from('agent_profiles').select('*').eq('is_active', true);
        if (error) { console.error("Error fetching agent profiles:", error); return cachedAgentProfiles || {}; }
        const profilesMap: Record<string, any> = {};
        if (data) data.forEach(profile => profilesMap[profile.agent_id] = profile);
        cachedAgentProfiles = profilesMap;
        cacheTimestamp = now;
        console.log("Agent profiles fetched and cached.");
        return cachedAgentProfiles;
    } catch (e) { console.error("Exception during getAgentProfiles:", e); return cachedAgentProfiles || {}; }
}

interface InputSignal {
  inputText: string;
  desiredFrequency?: { clarity?: number; [key: string]: number | undefined; };
  sessionId?: string;
  source?: string;
}

// Updated AgentResponse to include new detailed fields
interface AgentResponse {
    status: string;
    agent_id: string;
    response_text: string;
    confidence_score: number;
    kb_article_slug?: string | null;
    pre_filter_response?: string | null;
    pre_filter_confidence?: number | null;
    filter_alignment_score?: number | null;
    filter_warnings?: string[] | null;
}

interface McpResponse {
    status: string;
    interaction_id?: string; // For client to use for feedback
    reason?: string;
    resolution?: string;
    agent_id?: string;
    agent_response?: AgentResponse | null;
}

async function logInteraction(supabase: SupabaseClient | null, logData: any): Promise<string | null> {
    if (!supabase) {
        console.warn("Supabase client not initialized, skipping logInteraction.");
        return null;
    }
    try {
        // Ensure numeric fields are numbers
        if (logData.agent_confidence_score) logData.agent_confidence_score = parseFloat(logData.agent_confidence_score);
        if (logData.pre_filter_confidence) logData.pre_filter_confidence = parseFloat(logData.pre_filter_confidence);
        if (logData.filter_alignment_score) logData.filter_alignment_score = parseFloat(logData.filter_alignment_score);

        // Add 'returning: 'minimal'' if you don't need the data back,
        // or 'returning: 'representation'' to get the inserted row (including the generated id).
        const { data, error } = await supabase.from('interaction_log').insert([logData]).select('id').single();

        if (error) {
            console.error('Error logging interaction to Supabase:', error);
            return null;
        } else {
            console.log('Interaction logged successfully.');
            return data ? data.id : null; // Return the ID of the logged interaction
        }
    } catch (e) {
        console.error('Exception during logInteraction:', e);
        return null;
    }
}

serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const AGENT_PROFILES = await getAgentProfiles(supabase);

  let mcpFinalResponse: McpResponse;
  let inputText = "";
  let sessionId: string | undefined;
  let source: string | undefined;
  let routedAgentId: string | null = null;
  let actualAgentResponse: AgentResponse | null = null;

  // Log entry fields
  let log_interaction_id: string | null = null; // To store the ID of the log entry
  let log_mcp_status: string = "";
  let log_mcp_reason: string | undefined;
  let log_routed_agent_id: string | undefined;
  // Detailed agent log fields
  let log_kb_article_slug: string | null | undefined = null;
  let log_pre_filter_response: string | null | undefined = null;
  let log_pre_filter_confidence: number | null | undefined = null;
  let log_filter_alignment_score: number | null | undefined = null;
  let log_filter_warnings: string[] | null | undefined = null;
  let log_agent_response_text: string | undefined; // Final agent response
  let log_agent_confidence_score: number | undefined; // Final agent confidence


  try {
    const requestBody: InputSignal = await req.json();
    inputText = requestBody.inputText;
    sessionId = requestBody.sessionId;
    source = requestBody.source || (req.headers.get('user-agent')?.includes('Mozilla') ? 'prototype_ui' : 'api_call');
    const { desiredFrequency } = requestBody;

    console.log('MCP Node (detailed log) received input:', { inputText });

    const clarityAgentProfile = AGENT_PROFILES["clarity_pulse_v1_001"];

    if (!inputText || inputText.trim().split(/\s+/).length < 3) {
      log_mcp_status = "dissonance_detected"; log_mcp_reason = "Input too short";
      mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Please provide more details." };
    } else {
      const negativeKeywords = ["useless", "broken", "stupid", "fail"];
      if (negativeKeywords.some(keyword => inputText.toLowerCase().includes(keyword))) {
        log_mcp_status = "dissonance_detected"; log_mcp_reason = "Potential negative sentiment";
        mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Could you please rephrase or provide more context?" };
      } else {
        const clarityKeywords = clarityAgentProfile?.keywords || [];
        const wantsClarity = (desiredFrequency?.clarity && desiredFrequency.clarity > 0.7) ||
                             clarityKeywords.some(keyword => inputText.toLowerCase().includes(keyword));

        if (wantsClarity && clarityAgentProfile) {
          routedAgentId = clarityAgentProfile.agent_id;
          log_routed_agent_id = routedAgentId;
          const transformedInputForAgent = { originalText: inputText, desiredFrequency, sessionId, source };

          if (clarityAgentUrl && routedAgentId === "clarity_pulse_v1_001") {
            console.log(`MCP: Calling Clarity Agent at: ${clarityAgentUrl}`);
            try {
              const agentCallResponse = await fetch(clarityAgentUrl, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify(transformedInputForAgent)
              });

              if (!agentCallResponse.ok) throw new Error(`Agent call failed: ${agentCallResponse.status}`);
              actualAgentResponse = await agentCallResponse.json() as AgentResponse;

              // Capture all details from agent response for logging
              log_agent_response_text = actualAgentResponse?.response_text;
              log_agent_confidence_score = actualAgentResponse?.confidence_score;
              log_kb_article_slug = actualAgentResponse?.kb_article_slug;
              log_pre_filter_response = actualAgentResponse?.pre_filter_response;
              log_pre_filter_confidence = actualAgentResponse?.pre_filter_confidence;
              log_filter_alignment_score = actualAgentResponse?.filter_alignment_score;
              log_filter_warnings = actualAgentResponse?.filter_warnings;

              log_mcp_status = "routed_and_executed";
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, agent_response: actualAgentResponse };
              console.log(`MCP: Clarity Agent responded.`);
            } catch (agentError) {
              console.error('MCP: Error calling Clarity Agent:', agentError);
              log_mcp_status = "routing_error"; log_mcp_reason = `Agent ${routedAgentId} call failed: ${agentError.message}`;
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
            }
          } else {
            log_mcp_status = "routed_not_callable";
            log_mcp_reason = clarityAgentUrl ? `Agent ${routedAgentId} not configured for direct call` : "Clarity Agent URL missing";
            mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
          }
        } else {
          log_mcp_status = "no_route_found"; log_mcp_reason = "No suitable agent for input.";
          mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason };
        }
      }
    }

    const logEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: log_mcp_status, mcp_reason: log_mcp_reason,
        routed_agent_id: log_routed_agent_id,
        agent_response_text: log_agent_response_text, agent_confidence_score: log_agent_confidence_score,
        kb_article_slug: log_kb_article_slug,
        pre_filter_response: log_pre_filter_response,
        pre_filter_confidence: log_pre_filter_confidence,
        filter_alignment_score: log_filter_alignment_score,
        filter_warnings: log_filter_warnings,
        raw_mcp_response: { ...mcpFinalResponse, agent_response: undefined }, // Log MCP's view, minus full agent payload to avoid duplication if agent_response is also logged raw later
        raw_agent_response: actualAgentResponse, // Log the full raw agent response
        source: source
    };
    log_interaction_id = await logInteraction(supabase, logEntry);

    // Add interaction_id to the response for client-side feedback logging
    if (log_interaction_id) mcpFinalResponse.interaction_id = log_interaction_id;


    return new Response( JSON.stringify(mcpFinalResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('MCP: Critical Error:', error);
    const errorResponse = { status: "error", message: error.message };
    const errorLogEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: "error", mcp_reason: error.message,
        raw_mcp_response: errorResponse, source: source
    };
    logInteraction(supabase, errorLogEntry).catch(logError => console.error("MCP: Failed to log critical error:", logError));
    return new Response( JSON.stringify(errorResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
