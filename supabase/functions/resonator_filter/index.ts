// supabase/functions/resonator_filter/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`Resonator Filter function booting up...`);

// Hardcoded core values (from values.json concept for this function's scope)
const CORE_VALUES = {
  trust: {
    keywords_positive: ["transparent", "reliable", "clear", "honest", "verifiable"],
    keywords_negative: ["guaranteed", "always", "never", "misleading", "deceptive", "obscure"] // example penalties
  },
  innovation: {
    keywords_positive: ["new", "creative", "explore", "discover", "imagine", "pioneer"],
    keywords_negative: ["impossible", "won't work", "can't be done", "stick to"]
  },
  sovereignty: {
    keywords_positive: ["empower", "your choice", "control", "flexible", "adapt"],
    keywords_negative: ["must", "required", "only way", "dictate"]
  }
};

// Simple sentiment keyword lists
const POSITIVE_KEYWORDS = ["great", "good", "excellent", "positive", "success", "wonderful", "amazing", "effective", "helpful"];
const NEGATIVE_KEYWORDS = ["bad", "terrible", "poor", "negative", "fail", "problem", "issue", "difficult", "error", "warning"];


interface FilterInput {
  text_content: string;
  target_frequency_profile?: {
    core_values_emphasis?: string[];
    desired_sentiment?: "positive" | "neutral" | "negative";
  };
  source_agent_id?: string;
}

interface FilterOutput {
  filtered_text: string;
  alignment_score: number;
  sentiment_score: number;
  value_alignment: {
    trust: number;
    innovation: number;
    sovereignty: number;
    [key: string]: number;
  };
  applied_modifications: string[];
  warnings: string[];
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
        text_content,
        target_frequency_profile,
        source_agent_id
    }: FilterInput = await req.json();

    console.log('Resonator Filter received input:', { text_content, target_frequency_profile, source_agent_id });

    let filtered_text = text_content; // No modifications in v1, just analysis
    const applied_modifications: string[] = [];
    const warnings: string[] = [];

    let overall_alignment_score = 1.0;
    const value_alignment_scores: { [key: string]: number } = { trust: 1.0, innovation: 1.0, sovereignty: 1.0 };

    const text_lower = text_content.toLowerCase();
    const words = text_lower.split(/\s+/);

    // 1. Value Alignment (Simple Keyword Check)
    for (const valueName in CORE_VALUES) {
        if (CORE_VALUES.hasOwnProperty(valueName)) {
            const valueDef = CORE_VALUES[valueName as keyof typeof CORE_VALUES];
            let score_deduction = 0;
            valueDef.keywords_negative.forEach(kw => {
                if (text_lower.includes(kw)) {
                    score_deduction += 0.2; // Arbitrary penalty
                    warnings.push(`Potential negative impact on ${valueName} due to phrase: "${kw}"`);
                }
            });
            // Positive keywords could boost, but let's keep it simple: focus on reducing for violations
            value_alignment_scores[valueName] = Math.max(0, 1.0 - score_deduction);
        }
    }

    // 2. Sentiment Analysis (Simple Keyword Count)
    let sentiment_score = 0;
    let positive_hits = 0;
    let negative_hits = 0;
    words.forEach(word => {
        if (POSITIVE_KEYWORDS.includes(word)) positive_hits++;
        if (NEGATIVE_KEYWORDS.includes(word)) negative_hits++;
    });

    if (words.length > 0) {
        sentiment_score = (positive_hits - negative_hits) / words.length;
        sentiment_score = Math.max(-1, Math.min(1, sentiment_score)); // Normalize
    }

    if (sentiment_score < -0.5) warnings.push("Strong negative sentiment detected.");
    if (sentiment_score > 0.7) warnings.push("Strong positive sentiment detected.");

    if (target_frequency_profile?.desired_sentiment) {
        const desired = target_frequency_profile.desired_sentiment;
        if (desired === "neutral" && Math.abs(sentiment_score) > 0.3) {
            warnings.push(`Sentiment (${sentiment_score.toFixed(2)}) deviates from desired neutral.`);
        } else if (desired === "positive" && sentiment_score < 0.1) {
            warnings.push(`Sentiment (${sentiment_score.toFixed(2)}) is not as positive as desired.`);
        } else if (desired === "negative" && sentiment_score > -0.1) {
            warnings.push(`Sentiment (${sentiment_score.toFixed(2)}) is not as negative as desired.`);
        }
    }

    // 3. Calculate Overall Alignment Score (simple average for now)
    let sum_value_scores = 0;
    let num_value_scores = 0;
    for (const valueName in value_alignment_scores) {
        sum_value_scores += value_alignment_scores[valueName];
        num_value_scores++;
    }
    const avg_value_alignment = num_value_scores > 0 ? sum_value_scores / num_value_scores : 1.0;
    // Simple average of value alignment and sentiment (abs val for sentiment deviation from neutral)
    // This scoring is very basic and needs refinement.
    overall_alignment_score = (avg_value_alignment + (1.0 - Math.abs(sentiment_score))) / 2;
    overall_alignment_score = Math.max(0, Math.min(1, overall_alignment_score));


    const output: FilterOutput = {
        filtered_text,
        alignment_score: parseFloat(overall_alignment_score.toFixed(3)),
        sentiment_score: parseFloat(sentiment_score.toFixed(3)),
        value_alignment: {
            trust: parseFloat(value_alignment_scores.trust.toFixed(3)),
            innovation: parseFloat(value_alignment_scores.innovation.toFixed(3)),
            sovereignty: parseFloat(value_alignment_scores.sovereignty.toFixed(3))
        },
        applied_modifications,
        warnings
    };

    console.log('Resonator Filter output:', output);

    return new Response(
      JSON.stringify(output),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Resonator Filter:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
