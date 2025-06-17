// supabase/functions/clarity_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Clarity Agent v1 function booting up... v2 (knowledge base)`);

const AGENT_ID = "clarity_pulse_v1_001";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Clarity Agent: Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
}

interface AgentInput {
  originalText: string;
  desiredFrequency?: any;
  sessionId?: string;
  source?: string;
}

async function queryKnowledgeBase(supabase: SupabaseClient | null, inputText: string): Promise<string | null> {
    if (!supabase) {
        console.warn("Clarity Agent: Supabase client not available for knowledge base query.");
        return null;
    }

    const inputTextLower = inputText.toLowerCase().trim();

    // 1. Try direct question match (case-insensitive)
    try {
        const { data: directMatchData, error: directMatchError } = await supabase
            .from('knowledge_base')
            .select('answer')
            .ilike('question', inputTextLower) // Case-insensitive match for question
            .or(`agent_applicability.cs.{"${AGENT_ID}"},agent_applicability.is.null`) // Contains AGENT_ID or is NULL
            .limit(1);

        if (directMatchError) {
            console.error("Clarity Agent: Error querying knowledge_base (direct match):", directMatchError);
        } else if (directMatchData && directMatchData.length > 0) {
            console.log("Clarity Agent: Found direct match in KB:", directMatchData[0].answer);
            return directMatchData[0].answer;
        }
    } catch (e) {
        console.error("Clarity Agent: Exception during KB direct match query:", e);
    }

    // 2. Try keyword match (simple version: check if any word from input is in keywords array)
    // This is a naive search. A more robust solution would use full-text search or embeddings.
    try {
        // Fetch potential articles based on agent applicability first
        const { data: applicableArticles, error: applicableArticlesError } = await supabase
            .from('knowledge_base')
            .select('answer, keywords')
            .or(`agent_applicability.cs.{"${AGENT_ID}"},agent_applicability.is.null`);

        if (applicableArticlesError) {
            console.error("Clarity Agent: Error fetching applicable KB articles for keyword search:", applicableArticlesError);
            return null;
        }

        if (applicableArticles && applicableArticles.length > 0) {
            const inputKeywords = inputTextLower.split(/\s+/).filter(kw => kw.length > 2); // Simple tokenizer
            for (const article of applicableArticles) {
                if (article.keywords && article.keywords.some((kw: string) => inputKeywords.includes(kw.toLowerCase()))) {
                    console.log("Clarity Agent: Found keyword match in KB:", article.answer);
                    return article.answer; // Return first match
                }
            }
        }
    } catch (e) {
        console.error("Clarity Agent: Exception during KB keyword match query:", e);
    }

    console.log("Clarity Agent: No match found in KB for:", inputText);
    return null;
}


serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { originalText, desiredFrequency, sessionId, source }: AgentInput = await req.json();
    console.log('Clarity Agent v1 (KB) received input:', { originalText, desiredFrequency, sessionId, source });

    let responseText = "";
    let confidenceScore = 0.5; // Default confidence if no specific answer

    const kbAnswer = await queryKnowledgeBase(supabase, originalText);

    if (kbAnswer) {
        responseText = kbAnswer;
        // Slightly higher confidence for KB answers, could be more nuanced based on match type
        confidenceScore = (originalText.toLowerCase().trim() === kbAnswer.toLowerCase().includes(originalText.toLowerCase().trim())) ? 0.9 : 0.75;
         // A bit of a heuristic: if the question is very similar to the answer's phrasing.
    } else {
        responseText = `This is the Clarity Agent (ID: ${AGENT_ID}). I have received your query: "${originalText}". My primary function is to provide clear and direct information, but I could not find a specific answer in my knowledge base for this.`;
        confidenceScore = 0.4;
    }

    console.log(`Clarity Agent v1 (KB) responding with: "${responseText}" (Confidence: ${confidenceScore})`);

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
    console.error('Error in Clarity Agent v1 (KB):', error);
    return new Response(
      JSON.stringify({ status: "error", agent_id: AGENT_ID, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
