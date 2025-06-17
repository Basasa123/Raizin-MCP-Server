// supabase/functions/clarity_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Clarity Agent v1 function booting up... v4 (detailed logging fields)`);

const AGENT_ID = "clarity_pulse_v1_001";

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const resonatorFilterUrl = Deno.env.get('RESONATOR_FILTER_URL');

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Clarity Agent: Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.');
}
if (!resonatorFilterUrl) {
    console.warn('Clarity Agent: Missing RESONATOR_FILTER_URL environment variable. Cannot call Resonator Filter.');
}

interface AgentInput {
  originalText: string;
  desiredFrequency?: any;
  sessionId?: string;
  source?: string;
}

interface ResonatorFilterResponse {
  filtered_text: string;
  alignment_score: number;
  sentiment_score: number;
  value_alignment: { trust: number; innovation: number; sovereignty: number; [key: string]: number; };
  applied_modifications: string[];
  warnings: string[];
}

// Updated to return article_slug
async function queryKnowledgeBase(supabase: SupabaseClient | null, inputText: string): Promise<{answer: string | null; match_type: 'direct' | 'keyword' | null; slug: string | null}> {
    if (!supabase) {
        console.warn("Clarity Agent: Supabase client not available for knowledge base query.");
        return { answer: null, match_type: null, slug: null };
    }
    const inputTextLower = inputText.toLowerCase().trim();
    try {
        // Select slug along with answer
        const { data: directMatchData, error: directMatchError } = await supabase
            .from('knowledge_base').select('answer, article_slug').ilike('question', inputTextLower)
            .or(`agent_applicability.cs.{"${AGENT_ID}"},agent_applicability.is.null`).limit(1);
        if (directMatchError) console.error("Clarity Agent: Error querying KB (direct match):", directMatchError);
        else if (directMatchData && directMatchData.length > 0) {
            console.log("Clarity Agent: Found direct match in KB.");
            return { answer: directMatchData[0].answer, match_type: 'direct', slug: directMatchData[0].article_slug };
        }
    } catch (e) { console.error("Clarity Agent: Exception during KB direct match query:", e); }

    try {
        const { data: applicableArticles, error: applicableArticlesError } = await supabase
            .from('knowledge_base').select('answer, keywords, article_slug') // Select slug
            .or(`agent_applicability.cs.{"${AGENT_ID}"},agent_applicability.is.null`);
        if (applicableArticlesError) {
            console.error("Clarity Agent: Error fetching applicable KB articles for keyword search:", applicableArticlesError);
            return { answer: null, match_type: null, slug: null };
        }
        if (applicableArticles && applicableArticles.length > 0) {
            const inputKeywords = inputTextLower.split(/\s+/).filter(kw => kw.length > 2);
            for (const article of applicableArticles) {
                if (article.keywords && article.keywords.some((kw: string) => inputKeywords.includes(kw.toLowerCase()))) {
                    console.log("Clarity Agent: Found keyword match in KB.");
                    return { answer: article.answer, match_type: 'keyword', slug: article.article_slug };
                }
            }
        }
    } catch (e) { console.error("Clarity Agent: Exception during KB keyword match query:", e); }
    console.log("Clarity Agent: No match found in KB for:", inputText);
    return { answer: null, match_type: null, slug: null };
}

serve(async (req: Request) => {
  const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fields for detailed logging output
  let kb_article_slug_matched: string | null = null;
  let pre_filter_response_text: string = "";
  let pre_filter_confidence_score: number = 0.5;
  let final_response_text: string = "";
  let final_confidence_score: number = 0.0;
  let actual_filter_alignment_score: number | null = null;
  let actual_filter_warnings: string[] = [];


  try {
    const { originalText, desiredFrequency, sessionId, source }: AgentInput = await req.json();
    console.log('Clarity Agent v1 (detailed log) received input:', { originalText });

    const {answer: kbAnswer, match_type: kbMatchType, slug: kbSlug} = await queryKnowledgeBase(supabase, originalText);
    kb_article_slug_matched = kbSlug;

    if (kbAnswer) {
        pre_filter_response_text = kbAnswer;
        pre_filter_confidence_score = kbMatchType === 'direct' ? 0.9 : 0.75;
    } else {
        pre_filter_response_text = `This is the Clarity Agent (ID: ${AGENT_ID}). I have received your query: "${originalText}". My primary function is to provide clear and direct information, but I could not find a specific answer in my knowledge base for this.`;
        pre_filter_confidence_score = 0.4;
    }

    // Call Resonator Filter
    let filter_data_for_logging: Partial<ResonatorFilterResponse> = {};

    if (resonatorFilterUrl) {
        try {
            console.log(`Clarity Agent: Calling Resonator Filter for text: "${pre_filter_response_text}"`);
            const filterResponse = await fetch(resonatorFilterUrl, {
                method: 'POST',
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
                body: JSON.stringify({
                    text_content: pre_filter_response_text,
                    target_frequency_profile: { core_values_emphasis: ["trust", "clarity"], desired_sentiment: "neutral" },
                    source_agent_id: AGENT_ID
                })
            });

            if (!filterResponse.ok) {
                const errorBody = await filterResponse.text();
                console.error(`Clarity Agent: Resonator Filter call failed: ${errorBody}`);
                final_response_text = pre_filter_response_text; // Use original text
                actual_filter_warnings.push("Resonator Filter call failed.");
            } else {
                const filterData: ResonatorFilterResponse = await filterResponse.json();
                filter_data_for_logging = filterData; // Store for logging
                console.log("Clarity Agent: Resonator Filter response:", filterData);
                final_response_text = filterData.filtered_text;
                actual_filter_alignment_score = filterData.alignment_score;
                actual_filter_warnings = filterData.warnings || [];
            }
        } catch (filterError) {
            console.error('Clarity Agent: Error calling Resonator Filter:', filterError);
            final_response_text = pre_filter_response_text;
            actual_filter_warnings.push("Resonator Filter call exception.");
        }
    } else {
        console.warn("Clarity Agent: RESONATOR_FILTER_URL not configured. Skipping filter.");
        final_response_text = pre_filter_response_text;
    }

    // Adjust confidence based on filter alignment, if available
    final_confidence_score = actual_filter_alignment_score !== null ?
                             pre_filter_confidence_score * actual_filter_alignment_score :
                             pre_filter_confidence_score;
    final_confidence_score = parseFloat(final_confidence_score.toFixed(3));


    console.log(`Clarity Agent v1 (detailed log) responding with: "${final_response_text}" (Confidence: ${final_confidence_score})`);

    return new Response(
      JSON.stringify({
        status: "success",
        agent_id: AGENT_ID,
        response_text: final_response_text,
        confidence_score: final_confidence_score,
        // Adding detailed fields for MCP to log
        kb_article_slug: kb_article_slug_matched,
        pre_filter_response: pre_filter_response_text,
        pre_filter_confidence: pre_filter_confidence_score,
        filter_alignment_score: actual_filter_alignment_score,
        filter_warnings: actual_filter_warnings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Clarity Agent v1 (detailed log):', error);
    return new Response(
      JSON.stringify({ status: "error", agent_id: AGENT_ID, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
