// supabase/functions/mcp_node/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`MCP Node function booting up... v6 (innovation routing & filter orchestration)`);

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const resonatorFilterUrl = Deno.env.get('RESONATOR_FILTER_URL'); // For calling the filter

if (!supabaseUrl || !supabaseAnonKey) console.error('MCP: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
if (!resonatorFilterUrl) console.warn('MCP: Missing RESONATOR_FILTER_URL. Responses will not be filtered.');


let cachedAgentProfiles: Record<string, any> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getAgentProfiles(supabase: SupabaseClient | null): Promise<Record<string, any>> { /* ... same as before ... */
    const now = Date.now();
    if (cachedAgentProfiles && (now - cacheTimestamp < CACHE_TTL)) return cachedAgentProfiles;
    if (!supabase) return {};
    console.log("MCP: Fetching agent profiles...");
    try {
        const { data, error } = await supabase.from('agent_profiles').select('*').eq('is_active', true);
        if (error) { console.error("MCP: Error fetching agent profiles:", error); return cachedAgentProfiles || {}; }
        const profilesMap: Record<string, any> = {};
        if (data) data.forEach(profile => profilesMap[profile.agent_id] = profile);
        cachedAgentProfiles = profilesMap;
        cacheTimestamp = now;
        console.log("MCP: Agent profiles fetched and cached.");
        return cachedAgentProfiles;
    } catch (e) { console.error("MCP: Exception during getAgentProfiles:", e); return cachedAgentProfiles || {}; }
}

interface InputSignal { /* ... same as before ... */
  inputText: string;
  desiredFrequency?: { clarity?: number; innovation?: number; [key: string]: number | undefined; };
  sessionId?: string;
  source?: string;
}
// Interface for the raw response from an agent (before filter)
interface RawAgentResponse {
    status: string;
    agent_id: string;
    response_text: string;
    confidence_score: number;
    kb_article_slug?: string | null;
    pre_filter_response?: string | null; // Agent might provide this if it has internal pre-processing
    pre_filter_confidence?: number | null;
    llm_metadata?: any;
     // filter_alignment_score and filter_warnings are NOT expected from raw agent response
}
// Includes fields agent might return, and fields MCP adds after filtering
interface FinalAgentResponseDetails {
    status: string; // from agent
    agent_id: string;
    response_text: string; // This will be *after* resonator filter
    confidence_score: number; // Agent's initial confidence, potentially adjusted by filter score
    kb_article_slug?: string | null;
    pre_filter_response?: string | null; // Agent's response *before* filter
    pre_filter_confidence?: number | null; // Agent's confidence *before* filter
    filter_alignment_score?: number | null; // From filter
    filter_warnings?: string[] | null; // From filter
    llm_metadata?: any;
}
interface McpResponse { /* ... same as before ... */
    status: string;
    interaction_id?: string;
    reason?: string;
    resolution?: string;
    agent_id?: string; // ID of the agent chosen
    agent_response?: FinalAgentResponseDetails | null; // The final, possibly filtered, response
}
interface ResonatorFilterResponse { // Expected from resonator_filter function
  filtered_text: string;
  alignment_score: number;
  warnings: string[];
  // other fields from filter if needed
}


async function logInteraction(supabase: SupabaseClient | null, logData: any): Promise<string | null> { /* ... same as before ... */
    if (!supabase) { console.warn("MCP: Supabase client not initialized, skipping log."); return null; }
    try {
        // Ensure numeric fields are numbers
        if (logData.agent_confidence_score) logData.agent_confidence_score = parseFloat(logData.agent_confidence_score);
        if (logData.pre_filter_confidence) logData.pre_filter_confidence = parseFloat(logData.pre_filter_confidence);
        if (logData.filter_alignment_score) logData.filter_alignment_score = parseFloat(logData.filter_alignment_score);

        const { data, error } = await supabase.from('interaction_log').insert([logData]).select('id').single();
        if (error) { console.error('MCP: Error logging interaction:', error); return null; }
        console.log('MCP: Interaction logged successfully.');
        return data ? data.id : null;
    } catch (e) { console.error('MCP: Exception during logInteraction:', e); return null; }
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
  let finalAgentResponseDetails: FinalAgentResponseDetails | null = null;

  let log_interaction_id: string | null = null;
  let log_mcp_status: string = "";
  let log_mcp_reason: string | undefined;
  // Log fields will now be populated from finalAgentResponseDetails where applicable

  try {
    const requestBody: InputSignal = await req.json();
    inputText = requestBody.inputText;
    sessionId = requestBody.sessionId;
    source = requestBody.source || (req.headers.get('user-agent')?.includes('Mozilla') ? 'prototype_ui' : 'api_call');
    const { desiredFrequency } = requestBody;

    console.log('MCP Node (innovation routing) received input:', { inputText });

    // Dissonance Detection
    if (!inputText || inputText.trim().split(/\s+/).length < 3) {
      log_mcp_status = "dissonance_detected"; log_mcp_reason = "Input too short";
      mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Please provide more details." };
    } else {
      const negativeKeywords = ["useless", "broken", "stupid", "fail"];
      if (negativeKeywords.some(keyword => inputText.toLowerCase().includes(keyword))) {
        log_mcp_status = "dissonance_detected"; log_mcp_reason = "Potential negative sentiment";
        mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason, resolution: "Could you please rephrase or provide more context?" };
      } else {
        // Agent Routing Logic
        let targetAgentProfile: any = null;
        const innovationAgentProfile = AGENT_PROFILES["innovation_pulse_v1_001"];
        const clarityAgentProfile = AGENT_PROFILES["clarity_pulse_v1_001"];

        // Priority to Innovation Agent if keywords/frequency match
        if (innovationAgentProfile) {
            const innovationKeywords = innovationAgentProfile.keywords || [];
            const wantsInnovation = (desiredFrequency?.innovation && desiredFrequency.innovation > 0.7) ||
                                   innovationKeywords.some((kw:string) => inputText.toLowerCase().includes(kw));
            if (wantsInnovation) {
                targetAgentProfile = innovationAgentProfile;
                console.log("MCP: Routing to Innovation Agent");
            }
        }

        // If not routed to Innovation, check Clarity Agent
        if (!targetAgentProfile && clarityAgentProfile) {
            const clarityKeywords = clarityAgentProfile.keywords || [];
            const wantsClarity = (desiredFrequency?.clarity && desiredFrequency.clarity > 0.7) ||
                                 clarityKeywords.some((kw:string) => inputText.toLowerCase().includes(kw));
            if (wantsClarity) {
                targetAgentProfile = clarityAgentProfile;
                console.log("MCP: Routing to Clarity Agent");
            }
        }

        if (targetAgentProfile) {
          routedAgentId = targetAgentProfile.agent_id;
          const transformedInputForAgent = { originalText: inputText, desiredFrequency, sessionId, source };
          const invocationUrlFromProfile = targetAgentProfile.invocation_url;

          if (!invocationUrlFromProfile || !supabaseUrl) {
            log_mcp_status = "routing_error";
            log_mcp_reason = !invocationUrlFromProfile ? `Agent ${routedAgentId} profile missing invocation_url.` : `MCP misconfig: SUPABASE_URL not set.`;
            mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
          } else {
            const fullAgentUrl = `${supabaseUrl}/functions/v1/${invocationUrlFromProfile}`;
            console.log(`MCP: Calling Agent ${routedAgentId} at: ${fullAgentUrl}`);
            let agentRawResponse: RawAgentResponse | null = null;
            try {
              const agentCall = await fetch(fullAgentUrl, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify(transformedInputForAgent)
              });
              if (!agentCall.ok) throw new Error(`Agent ${routedAgentId} call failed: ${agentCall.status} ${await agentCall.text()}`);
              agentRawResponse = await agentCall.json() as RawAgentResponse;
              console.log(`MCP: Agent ${routedAgentId} responded.`);

              // Initialize finalAgentResponseDetails with agent's raw response structure
              // The agent provides pre_filter_response and pre_filter_confidence directly
              finalAgentResponseDetails = {
                status: agentRawResponse.status,
                agent_id: agentRawResponse.agent_id,
                response_text: agentRawResponse.response_text, // This is pre-filter text initially
                confidence_score: agentRawResponse.confidence_score,
                kb_article_slug: agentRawResponse.kb_article_slug,
                pre_filter_response: agentRawResponse.pre_filter_response || agentRawResponse.response_text,
                pre_filter_confidence: agentRawResponse.pre_filter_confidence || agentRawResponse.confidence_score,
                llm_metadata: agentRawResponse.llm_metadata,
                filter_alignment_score: null, // Will be set by filter
                filter_warnings: [] // Will be set by filter
              };

              // Call Resonator Filter
              if (resonatorFilterUrl && finalAgentResponseDetails) {
                console.log(`MCP: Calling Resonator Filter for agent ${routedAgentId} response.`);
                try {
                  const filterCall = await fetch(resonatorFilterUrl, {
                    method: 'POST',
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}`},
                    body: JSON.stringify({
                      text_content: finalAgentResponseDetails.pre_filter_response, // Send agent's raw/pre-filter text
                      source_agent_id: routedAgentId,
                      target_frequency_profile: targetAgentProfile.frequency_profile
                    })
                  });
                  if (!filterCall.ok) throw new Error(`Resonator Filter call failed: ${filterCall.status} ${await filterCall.text()}`);
                  const filterData: ResonatorFilterResponse = await filterCall.json();
                  console.log("MCP: Resonator Filter responded:", filterData);

                  finalAgentResponseDetails.response_text = filterData.filtered_text;
                  finalAgentResponseDetails.filter_alignment_score = filterData.alignment_score;
                  finalAgentResponseDetails.filter_warnings = filterData.warnings;
                  finalAgentResponseDetails.confidence_score = parseFloat(( (finalAgentResponseDetails.pre_filter_confidence || 0.5) * filterData.alignment_score).toFixed(3) );
                } catch (filterError) {
                  console.error(`MCP: Error calling Resonator Filter for agent ${routedAgentId}:`, filterError);
                  if (finalAgentResponseDetails) {
                     finalAgentResponseDetails.filter_warnings = [...(finalAgentResponseDetails.filter_warnings || []), "Resonator Filter call failed."];
                  }
                }
              } else {
                 console.warn(`MCP: Resonator Filter URL not configured or no agent response. Skipping filter for agent ${routedAgentId}.`);
                 if (finalAgentResponseDetails) {
                    finalAgentResponseDetails.filter_warnings = [...(finalAgentResponseDetails.filter_warnings || []), "Resonator Filter skipped."];
                 }
              }

              log_mcp_status = "routed_and_executed";
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, agent_response: finalAgentResponseDetails };

            } catch (agentError) {
              console.error(`MCP: Error processing agent ${routedAgentId}:`, agentError);
              log_mcp_status = "routing_error"; log_mcp_reason = `Agent ${routedAgentId} processing failed: ${agentError.message}`;
              mcpFinalResponse = { status: log_mcp_status, agent_id: routedAgentId, reason: log_mcp_reason };
            }
          }
        } else {
          log_mcp_status = "no_route_found"; log_mcp_reason = "No suitable agent for input.";
          mcpFinalResponse = { status: log_mcp_status, reason: log_mcp_reason };
        }
      }
    }

    const logEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: log_mcp_status, mcp_reason: log_mcp_reason,
        routed_agent_id: routedAgentId, // Use the one from routing decision
        agent_response_text: finalAgentResponseDetails?.response_text,
        agent_confidence_score: finalAgentResponseDetails?.confidence_score,
        kb_article_slug: finalAgentResponseDetails?.kb_article_slug,
        pre_filter_response: finalAgentResponseDetails?.pre_filter_response,
        pre_filter_confidence: finalAgentResponseDetails?.pre_filter_confidence,
        filter_alignment_score: finalAgentResponseDetails?.filter_alignment_score,
        filter_warnings: finalAgentResponseDetails?.filter_warnings,
        raw_mcp_response: { ...mcpFinalResponse, agent_response: undefined },
        raw_agent_response: finalAgentResponseDetails,
        llm_metadata: finalAgentResponseDetails?.llm_metadata,
        source: source
    };
    log_interaction_id = await logInteraction(supabase, logEntry);
    if (log_interaction_id) mcpFinalResponse.interaction_id = log_interaction_id;

    return new Response( JSON.stringify(mcpFinalResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('MCP: Critical Error:', error);
    const errorResponse = { status: "error", message: error.message };
    const errorLogEntry = {
        session_id: sessionId, input_text: inputText, mcp_status: "error", mcp_reason: error.message,
        raw_mcp_response: errorResponse, source: source // Ensure all potential fields for logEntry are defined or null
     };
    logInteraction(supabase, errorLogEntry).catch(logError => console.error("MCP: Failed to log critical error:", logError));
    return new Response( JSON.stringify(errorResponse), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
