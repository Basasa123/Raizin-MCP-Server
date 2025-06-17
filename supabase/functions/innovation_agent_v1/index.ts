// supabase/functions/innovation_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Innovation Pulse Agent v1 function booting up (Gemini Direct API)...`);

const AGENT_ID = "innovation_pulse_v1_001";

// Environment variable for Gemini API Key
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// Model can be made configurable via env var if needed, default to 1.5 Pro
const GEMINI_MODEL_ID = Deno.env.get('GEMINI_MODEL_ID') || 'gemini-1.5-pro-latest';

if (!GEMINI_API_KEY) {
    console.error(`${AGENT_ID}: Missing GEMINI_API_KEY environment variable.`);
}

interface AgentInput {
  originalText: string; // User's query or prompt for innovation
  desiredFrequency?: any;
  sessionId?: string;
  source?: string;
}

// Simplified structure based on Gemini API's generateContent response
interface GeminiResponseCandidate {
  content: {
    parts: { text: string }[];
    role: string;
  };
  finishReason?: string;
  index?: number;
  // safetyRatings, citationMetadata etc. could be here
}

interface GeminiApiResponse {
  candidates: GeminiResponseCandidate[];
  // promptFeedback could be here
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let llmResponseText = "";
  let llmConfidenceScore = 0.65; // Default confidence for creative LLM output
  let llmMetadata: any = { model_used: GEMINI_MODEL_ID }; // Initialize with model

  try {
    const { originalText, desiredFrequency, sessionId, source }: AgentInput = await req.json();
    console.log(`${AGENT_ID} received input:`, { originalText });

    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured for this agent.");
    }

    // 1. Construct LLM Prompt for Gemini
    // The base prompt can be refined further.
    const userPrompt = `You are an Innovation Catalyst. Your goal is to provide novel, creative, and insightful ideas or alternative perspectives. Be imaginative and explore possibilities. Based on the following user query, generate 2-3 distinct and actionable ideas or insights. User query: "${originalText}"`;

    // 2. Call Gemini API
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRequestBody = {
      contents: [
        {
          parts: [
            { "text": userPrompt }
          ]
        }
      ],
      // Optional: Add generationConfig like temperature, maxOutputTokens etc.
      // generationConfig: {
      //   temperature: 0.8,
      //   maxOutputTokens: 300,
      // }
    };

    console.log(`${AGENT_ID}: Calling Gemini API at ${geminiApiUrl.split('?key=')[0]}...`); // Log URL without key
    const geminiApiResponse = await fetch(geminiApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequestBody)
    });

    if (!geminiApiResponse.ok) {
        const errorBody = await geminiApiResponse.text();
        console.error(`${AGENT_ID}: Gemini API call failed with status ${geminiApiResponse.status}: ${errorBody}`);
        throw new Error(`Gemini API request failed: ${geminiApiResponse.status} - ${errorBody}`);
    }

    const geminiResult: GeminiApiResponse = await geminiApiResponse.json();

    // 3. Process Gemini Response
    if (geminiResult.candidates && geminiResult.candidates.length > 0 &&
        geminiResult.candidates[0].content && geminiResult.candidates[0].content.parts &&
        geminiResult.candidates[0].content.parts.length > 0) {
        llmResponseText = geminiResult.candidates[0].content.parts[0].text.trim();
        // Note: Gemini can return multiple parts, or parts that aren't text.
        // This simplistic approach just takes the text from the first part of the first candidate.
        // More robust parsing might be needed for complex responses.
    } else {
        llmResponseText = "The Innovation Agent (Gemini) received your query but could not generate a response at this time.";
        llmConfidenceScore = 0.3; // Lower confidence
        console.warn(`${AGENT_ID}: Gemini response was missing expected content structure.`, geminiResult);
    }

    // Add finish reason to metadata if available
    if (geminiResult.candidates?.[0]?.finishReason) {
        llmMetadata.finish_reason = geminiResult.candidates[0].finishReason;
    }
    // Token count is not directly available in this Gemini REST API response format easily, unlike OpenAI.
    // It might be in promptFeedback or usageMetadata if those fields are returned and enabled.
    // For now, we'll omit token counts from llm_metadata unless further details on response structure are available.

    console.log(`${AGENT_ID}: Gemini generated response: "${llmResponseText.substring(0,100)}..."`);

    return new Response(
      JSON.stringify({
        status: "success",
        agent_id: AGENT_ID,
        response_text: llmResponseText,
        confidence_score: llmConfidenceScore,
        llm_metadata: llmMetadata,
        kb_article_slug: null,
        pre_filter_response: llmResponseText,
        pre_filter_confidence: llmConfidenceScore,
        filter_alignment_score: null,
        filter_warnings: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error in ${AGENT_ID} (Gemini):`, error);
    return new Response(
      JSON.stringify({
        status: "error",
        agent_id: AGENT_ID,
        message: error.message,
        response_text: "The Innovation Agent (Gemini) encountered an error and could not process your request.",
        confidence_score: 0.1
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
