// supabase/functions/clarity_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts' // Assuming a shared CORS setup

console.log(`Clarity Agent v1 function booting up...`);

// Hardcoded values from values.json for prototype
// In a real scenario, these might come from env vars or a config service
const PROJECT_NAME = "Raizin Vault";
const PROJECT_VISION = "A carrier of encoded evolution, built from frequency, not code.";
const CORE_VALUES = [
  "Transmit trust",
  "Transmit innovation",
  "Transmit sovereignty"
];
const AGENT_ID = "clarity_pulse_v1_001";

interface AgentInput {
  originalText: string;
  desiredFrequency?: any; // Keep it flexible for now
  // other fields from MCP transformed_input if necessary
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { originalText, desiredFrequency }: AgentInput = await req.json();
    console.log('Clarity Agent v1 received input:', { originalText, desiredFrequency });

    let responseText = "";
    let confidenceScore = 0.6; // Default confidence

    // Core Logic & Response Shaping (Prototype)
    // Reference: clarity_agent_design.md

    if (originalText && originalText.toLowerCase().includes("what is raizin vault")) {
      responseText = `${PROJECT_NAME}, as envisioned, is '${PROJECT_VISION}'. It operates on the core values of: ${CORE_VALUES.join(', ')}. My purpose is to provide clear and trustworthy information.`;
      confidenceScore = 0.95;
    } else {
      responseText = `This is the Clarity Agent (ID: ${AGENT_ID}). I have received your query: "${originalText}". My primary function is to provide clear and direct information.`;
      confidenceScore = 0.7;
    }

    console.log(`Clarity Agent v1 responding with: "${responseText}"`);

    return new Response(
      JSON.stringify({
        status: "success",
        agent_id: AGENT_ID,
        response_text: responseText,
        confidence_score: confidenceScore
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Clarity Agent v1:', error);
    return new Response(
      JSON.stringify({ status: "error", agent_id: AGENT_ID, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
