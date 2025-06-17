// supabase/functions/sa_service_agent_v1/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// Supabase client might be needed if we enhance it to pull service details from DB later,
// but for v1, service details are hardcoded. Not importing it for now to keep it minimal.
// import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`SA Service Delivery Agent v1 function booting up...`);

const AGENT_ID = "sa_service_agent_v1";
const OZOW_PAYMENT_LINK = "https://ozow.me/#/pay/za/0782587132";

const SERVICES = {
    "boq": {
        id: "boq",
        name: "Tender BOQ Assistance",
        description: "I can assist you with preparing your Bill of Quantities (BOQ) for tenders. This service helps ensure your tender submissions are accurate and comprehensive.",
        price: 500.00,
        currency: "ZAR",
        reference_code: "BOQ",
        post_payment_prompt: "Thank you! Once you've made the payment, please reply with your payment confirmation (e.g., screenshot or Ozow reference) and provide the tender documents or key details about the project so I can begin assisting you with the BOQ."
    },
    "webdesign": {
        id: "webdesign",
        name: "Website Design",
        description: "I can help you design a professional website for your business or project. This includes initial design concepts and structure.",
        price: 1500.00,
        currency: "ZAR",
        reference_code: "WEBDESIGN",
        post_payment_prompt: "Thank you! Once you've made the payment, please reply with your payment confirmation and details about your business, target audience, style preferences, required pages (e.g., Home, About, Services, Contact), and any existing branding material."
    }
};

interface AgentInput {
  originalText: string;
  desiredFrequency?: any;
  sessionId?: string; // Crucial for payment reference
  source?: string;
}

// Helper to generate a unique part of the reference if sessionId is not good enough
function generateShortId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let responseText = "";
  let confidenceScore = 0.95; // High for scripted responses
  let preFilterResponse = "";
  let preFilterConfidence = 0.95;
  let chosenServiceKey: string | null = null; // For kb_article_slug

  // Default fallback response
  const genericFallback = `I can help you with ${SERVICES.boq.name} (ZAR ${SERVICES.boq.price.toFixed(2)}) or ${SERVICES.webdesign.name} (ZAR ${SERVICES.webdesign.price.toFixed(2)}). Please let me know if you're interested in one of these, or ask me to list my services.`;

  try {
    const { originalText, sessionId }: AgentInput = await req.json();
    const inputTextLower = originalText.toLowerCase();
    console.log(`${AGENT_ID} received input: "${originalText}", sessionId: ${sessionId}`);

    // Simple intent detection based on keywords
    if (inputTextLower.includes("services") || inputTextLower.includes("offer") || inputTextLower.includes("help with") || inputTextLower.includes("buy") || inputTextLower.includes("list services")) {
        responseText = `I offer the following services:
1. ${SERVICES.boq.name} - ZAR ${SERVICES.boq.price.toFixed(2)}
2. ${SERVICES.webdesign.name} - ZAR ${SERVICES.webdesign.price.toFixed(2)}
Which service are you interested in?`;
        chosenServiceKey = "service_list";
    } else if (inputTextLower.includes("boq") || inputTextLower.includes("bill of quantities") || inputTextLower.includes("tender assist")) {
        chosenServiceKey = "boq";
    } else if (inputTextLower.includes("website") || inputTextLower.includes("web design")) {
        chosenServiceKey = "webdesign";
    } else if (inputTextLower.includes("paid") || inputTextLower.includes("payment confirmation") || inputTextLower.includes("requirements") || inputTextLower.includes("docs")) {
        // This is a rough guess. Ideally, context/state would determine which service's post-payment prompt to show.
        chosenServiceKey = "post_payment_info";
        if (inputTextLower.includes("boq")) {
             responseText = SERVICES.boq.post_payment_prompt;
        } else if (inputTextLower.includes("web") || inputTextLower.includes("site")) {
             responseText = SERVICES.webdesign.post_payment_prompt;
        } else {
            responseText = "Thank you for your message. If you have made a payment, please specify which service it was for and provide your project details. We will verify and proceed.";
        }
    }


    if (chosenServiceKey && (chosenServiceKey === "boq" || chosenServiceKey === "webdesign")) {
        const service = SERVICES[chosenServiceKey as keyof typeof SERVICES];
        // Check if user is confirming or asking to proceed
        if (inputTextLower.includes("yes") || inputTextLower.includes("proceed") || inputTextLower.includes("like to order") ||
            (inputTextLower.includes(service.name.toLowerCase().split(" ")[0])) ) { // Match first word of service name too
            // User wants to proceed with this service
            const identifier = (sessionId && sessionId.trim() !== "") ? sessionId : generateShortId();
            const paymentReference = `${service.reference_code}-${identifier}`;
            responseText = `${service.name} costs ZAR ${service.price.toFixed(2)}.
To proceed, please make a payment to our Ozow account: ${OZOW_PAYMENT_LINK}

` +
                             `**Important:**
Amount to pay: **ZAR ${service.price.toFixed(2)}**
Payment Reference: **${paymentReference}**

` +
                             `After making the payment, please reply here with your payment confirmation (e.g., a reference number or screenshot) and then provide the specific details for your project.`;
            chosenServiceKey = `proceed_${chosenServiceKey}`; // More specific slug
        } else {
            // User is asking about the service
            responseText = `${service.description} This service costs ZAR ${service.price.toFixed(2)}. Would you like to proceed?`;
            chosenServiceKey = `info_${chosenServiceKey}`; // More specific slug
        }
    } else if (!responseText) { // If no intent matched yet
        responseText = genericFallback;
        chosenServiceKey = "fallback_generic";
    }

    preFilterResponse = responseText;
    preFilterConfidence = confidenceScore;

    console.log(`${AGENT_ID} responding with: "${responseText.substring(0,150)}..."`);

    return new Response(
      JSON.stringify({
        status: "success",
        agent_id: AGENT_ID,
        response_text: responseText,
        confidence_score: confidenceScore,
        kb_article_slug: chosenServiceKey,
        pre_filter_response: preFilterResponse,
        pre_filter_confidence: preFilterConfidence,
        filter_alignment_score: null,
        filter_warnings: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error in ${AGENT_ID}:`, error);
    preFilterResponse = "I encountered an issue processing your request. Please try again, or ask about my services (Tender BOQ Assistance, Website Design).";
    preFilterConfidence = 0.3;

    return new Response(
      JSON.stringify({
        status: "error",
        agent_id: AGENT_ID,
        message: error.message,
        response_text: preFilterResponse,
        confidence_score: preFilterConfidence,
        kb_article_slug: "error_fallback",
        pre_filter_response: preFilterResponse,
        pre_filter_confidence: preFilterConfidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
