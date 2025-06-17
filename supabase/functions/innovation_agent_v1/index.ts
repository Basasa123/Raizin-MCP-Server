// supabase/functions/innovation_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Innovation Pulse Agent v1 function booting up...`);

const AGENT_ID = "innovation_pulse_v1_001";

// Environment variables for LLM API
const LLM_API_KEY = Deno.env.get('OPENAI_API_KEY'); // Or a generic LLM_API_KEY
const LLM_ENDPOINT_URL = Deno.env.get('LLM_API_ENDPOINT') || 'https://api.openai.com/v1/chat/completions';
const LLM_MODEL = Deno.env.get('LLM_MODEL') || 'gpt-3.5-turbo'; // Configurable model

if (!LLM_API_KEY) {
    console.error(`${AGENT_ID}: Missing LLM_API_KEY environment variable.`);
}

interface AgentInput {
  originalText: string; // User's query or prompt for innovation
  desiredFrequency?: any;
  sessionId?: string;
  source?: string;
}

// Structure of the response from OpenAI's chat completions endpoint (simplified)
interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: 'assistant' | 'user' | 'system';
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}


serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let llmResponseText = "";
  let llmConfidenceScore = 0.65; // Default confidence for creative LLM output
  let llmMetadata: any = null;

  try {
    const { originalText, desiredFrequency, sessionId, source }: AgentInput = await req.json();
    console.log(`${AGENT_ID} received input:`, { originalText });

    if (!LLM_API_KEY) {
        throw new Error("LLM API key is not configured for this agent.");
    }

    // 1. Construct LLM Prompt
    const basePrompt = `You are an Innovation Catalyst. Your goal is to provide novel, creative, and insightful ideas or alternative perspectives based on the user's query. Be imaginative and explore possibilities. User query: "${originalText}"

Generate 2-3 distinct and actionable ideas or insights:`;

    // 2. Call External LLM API
    const llmRequestBody = {
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: 'You are an Innovation Catalyst focused on generating novel ideas.' },
        { role: 'user', content: `Based on the query "${originalText}", provide 2-3 distinct, creative, and actionable ideas or insights.` }
      ],
      temperature: 0.8, // Higher temperature for more creativity
      max_tokens: 250,  // Max length of the generated response
      n: 1, // Number of choices to generate
    };

    console.log(`${AGENT_ID}: Calling LLM API at ${LLM_ENDPOINT_URL} with model ${LLM_MODEL}`);
    const llmApiResponse = await fetch(LLM_ENDPOINT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LLM_API_KEY}`
        },
        body: JSON.stringify(llmRequestBody)
    });

    if (!llmApiResponse.ok) {
        const errorBody = await llmApiResponse.text();
        console.error(`${AGENT_ID}: LLM API call failed with status ${llmApiResponse.status}: ${errorBody}`);
        throw new Error(`LLM API request failed: ${llmApiResponse.status} - ${errorBody}`);
    }

    const llmCompletion: OpenAIChatCompletionResponse = await llmApiResponse.json();

    // 3. Process LLM Response
    if (llmCompletion.choices && llmCompletion.choices.length > 0 && llmCompletion.choices[0].message) {
        llmResponseText = llmCompletion.choices[0].message.content.trim();
    } else {
        llmResponseText = "The Innovation Agent received your query but could not generate a creative response at this time.";
        llmConfidenceScore = 0.3; // Lower confidence if no valid choice
    }

    llmMetadata = {
        model_used: llmCompletion.model || LLM_MODEL,
        prompt_tokens: llmCompletion.usage?.prompt_tokens,
        completion_tokens: llmCompletion.usage?.completion_tokens,
        total_tokens: llmCompletion.usage?.total_tokens,
        finish_reason: llmCompletion.choices?.[0]?.finish_reason
    };

    console.log(`${AGENT_ID}: LLM generated response: "${llmResponseText.substring(0,100)}..."`);

    // Prepare the standard agent output
    // The MCP will handle passing this to the Resonator Filter.
    // So, 'response_text' here is the raw LLM output.
    return new Response(
      JSON.stringify({
        status: "success",
        agent_id: AGENT_ID,
        response_text: llmResponseText,
        confidence_score: llmConfidenceScore,
        llm_metadata: llmMetadata,
        // Fields for MCP's detailed logging after filter
        kb_article_slug: null,
        pre_filter_response: llmResponseText,
        pre_filter_confidence: llmConfidenceScore,
        filter_alignment_score: null, // To be filled by MCP after resonator_filter
        filter_warnings: []         // To be filled by MCP after resonator_filter
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error in ${AGENT_ID}:`, error);
    return new Response(
      JSON.stringify({
        status: "error",
        agent_id: AGENT_ID,
        message: error.message,
        response_text: "The Innovation Agent encountered an error and could not process your request.",
        confidence_score: 0.1
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
