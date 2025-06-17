# Clarity Agent v1 Design

## 1. Purpose

This document outlines the design for the first prototype Harmonic Agent, named "Clarity Agent v1" (with a conceptual ID like `clarity_pulse_v1_001`). This agent is designed to respond to queries requiring clear, concise information, aligning with the "clarity" and "trust" frequencies. It will be implemented as a Supabase Edge Function.

## 2. Alignment with Genesis Field

*   **Core Values:** The agent will strive to embody "Transmit trust" and "Transmit innovation (by providing clear information)" in its responses.
*   **Tone Profile:** (Reference `agent_tone_profile_definition.md`)
    *   `clarity`: High (e.g., 0.95)
    *   `trust`: High (e.g., 0.8)
    *   Other dimensions (innovation, sovereignty, empathy, urgency) will be lower for this specialized agent.

## 3. Input from MCP Node

The agent expects input structured as follows (passed from the MCP Node):

```json
{
  "originalText": "string", // The original user input
  "desiredFrequency": { /* ... */ } // The desired frequency profile from the initial request
}
```

## 4. Core Logic & Response Shaping (Prototype)

The agent's logic will be simple for this initial version:

1.  Log the received input.
2.  **Specific Query Handling:**
    *   If `originalText` (case-insensitive) contains "what is raizin vault":
        *   Retrieve project name and vision from `values.json` (conceptually, as direct file access might be tricky in a serverless function; for prototype, could be hardcoded or passed in environment variables).
        *   Respond: `"Raizin Vault, as envisioned, is '[project_vision]'. It operates on the core values of: [core_values listed]. My purpose is to provide clear and trustworthy information."` (Values to be interpolated).
3.  **Generic Query Handling:**
    *   For any other input:
        *   Respond: `"This is the Clarity Agent. I have received your query: '[originalText]'. My primary function is to provide clear and direct information."`
4.  **Tone Application:**
    *   Responses should be framed clearly and directly.
    *   Avoid jargon where possible, or explain it.

## 5. Output Structure

The agent will return a JSON object:

```json
{
  "status": "success",
  "agent_id": "clarity_pulse_v1_001", // Or the specific ID used
  "response_text": "string", // The generated response
  "confidence_score": "float (0.0-1.0)" // Placeholder for future use
}
```
A `confidence_score` (e.g., 0.9 for specific, 0.6 for generic) can be added.

## 6. Implementation Notes (Supabase Edge Function)

*   The function will be triggered via an HTTP request (though in a full system, the MCP might invoke it directly or via a queue).
*   For accessing `values.json` content:
    *   **Prototype:** Hardcode the relevant values from `values.json` directly into the function.
    *   **Short-term:** Load these values via environment variables when deploying the Supabase function.
    *   **Long-term:** The agent might receive necessary "Genesis Field" constants from the MCP or a shared configuration service.

## 7. Future Enhancements

*   Integration with the "Resonator Filter."
*   More sophisticated query understanding and response generation (e.g., using an LLM with a clarity-focused prompt).
*   Dynamic loading of its own tone profile and adherence checks.
*   Ability to query a knowledge base or other data sources.
```
