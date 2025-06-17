# Innovation Pulse Agent - Design Document

## 1. Purpose

The Innovation Pulse Agent (`innovation_pulse_v1_001`) is a Harmonic Emitter designed to generate creative ideas, brainstorm solutions, offer novel perspectives, and respond to "what if" scenarios. It aims to stimulate innovative thinking.

## 2. Function Name (Supabase Edge Function)

`innovation_agent_v1`

## 3. Frequency Profile

*   **`innovation`**: Very High (e.g., 0.9 - 1.0)
*   **`clarity`**: Moderate (e.g., 0.5 - 0.6) - Ideas should be understandable but not necessarily rigidly defined.
*   **`trust`**: Moderate (e.g., 0.5) - It's about exploration, not guaranteed truths.
*   **`sovereignty`**: Moderate (e.g., 0.6) - Empowers users to explore ideas.
*   **`empathy`**: Low (e.g., 0.2) - Not its primary focus.
*   **`urgency`**: Low (e.g., 0.1) - Designed for thoughtful exploration, not rapid responses.

## 4. Inputs (from MCP Node)

The agent expects a JSON object structured as `transformed_input` from the MCP:

```json
{
  "originalText": "string", // The user's query or prompt for innovation.
  "desiredFrequency": { /* ... */ }, // Optional: from initial request, might hint at innovation focus.
  "sessionId": "string (optional)",
  "source": "string (optional)"
}
```

## 5. Core Logic: LLM-Powered Idea Generation

1.  **Receive Input:** Get `originalText` from the MCP.
2.  **Construct LLM Prompt:**
    *   A base prompt will be designed to encourage creative, innovative, and slightly "out-of-the-box" thinking.
    *   Example Base Prompt Snippet: "You are an Innovation Catalyst. Given the following user query, generate 2-3 novel ideas, alternative perspectives, or creative solutions. Focus on originality and possibility. User query: ..."
    *   The `originalText` from the user is appended to this base prompt.
3.  **Call External LLM API:**
    *   The agent will make an HTTP POST request to a configured LLM API (e.g., OpenAI's GPT-3.5-turbo/GPT-4o).
    *   Requires environment variables: `LLM_API_KEY` (e.g., `OPENAI_API_KEY`) and `LLM_ENDPOINT_URL`.
    *   Standard parameters like `temperature` (e.g., 0.7-0.9 for creativity) and `max_tokens` will be used.
4.  **Process LLM Response:**
    *   Extract the main textual content from the LLM's response.
    *   Perform basic cleanup if necessary (e.g., removing boilerplate from LLM if any).
5.  **Determine Confidence:**
    *   Confidence for LLM-generated creative content is subjective. It could be a fixed moderate score (e.g., 0.65) or potentially influenced by LLM's own safety/confidence flags if available (though often not standard). For v1, a fixed score after successful generation is fine.

## 6. Outputs (to MCP Node)

The agent returns a standard JSON object:

```json
{
  "status": "success" | "error",
  "agent_id": "innovation_pulse_v1_001",
  "response_text": "string", // The LLM-generated creative response.
  "confidence_score": "float", // e.g., 0.65
  "llm_metadata": { // Optional: For logging or debugging
    "model_used": "string (e.g., gpt-3.5-turbo)",
    "prompt_tokens": "integer",
    "completion_tokens": "integer",
    "total_tokens": "integer"
  },
  // Standard detailed logging fields (to be populated by this agent before returning)
  "kb_article_slug": null, // Not applicable for this agent
  "pre_filter_response": "string", // The raw response from LLM
  "pre_filter_confidence": "float", // Initial confidence
  "filter_alignment_score": null, // To be filled by MCP after resonator_filter call
  "filter_warnings": [] // To be filled by MCP
}
```
*Note: `pre_filter_response` will be the raw response from the LLM. The MCP will then pass this to the `resonator_filter`, and the final `response_text` in the MCP's log will be the filter's output.*
The agent itself will return its raw LLM response as `response_text` and its initial confidence as `confidence_score`. The `pre_filter_` fields are for clarity in its own returned structure, which MCP will then use.

## 7. Error Handling
*   Handles errors during LLM API calls (network issues, API errors).
*   Returns an appropriate error structure if generation fails.

## 8. Orchestration with MCP & Resonator Filter
*   The Innovation Agent generates its creative text.
*   It returns this text and its initial confidence to the MCP.
*   The MCP is responsible for then taking this `response_text` and sending it through the `resonator_filter`.
*   The MCP then uses the `resonator_filter`'s output as the final response to the user and logs all details.

This design outlines a creative, LLM-powered agent, ready for integration into the Raizin Vault system.
```
