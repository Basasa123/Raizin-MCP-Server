# Prototype MCP Node Design

## 1. Purpose

This document outlines the design for a prototype Master Control Protocol (MCP) Node. The MCP Node acts as a "frequency router," directing incoming signals (requests) to appropriate Agents based on their frequency profile and detecting potential dissonance in the input. This prototype will focus on a very simple implementation, likely as a Supabase Edge Function.

## 2. Core Functionality

The prototype MCP Node will:
1.  Receive an input signal (e.g., text and a desired frequency profile).
2.  Perform basic dissonance detection.
3.  Apply a simple frequency routing rule.
4.  Determine the target Agent or an appropriate response if dissonance is detected or no route is found.

## 3. Input Signal Structure

The MCP Node will expect an input JSON object structured as follows:

```json
{
  "inputText": "string", // The textual input from the user or system
  "desiredFrequency": { // Optional: hints for desired agent characteristics
    "clarity": 0.8, // Example: high desire for clarity
    // other frequency dimensions...
  },
  "sessionId": "string (optional)" // For context tracking
}
```

## 4. Dissonance Detection (Prototype)

For this prototype, dissonance is detected if:
*   **Rule D1 (Too Short):** `inputText` has fewer than 3 words.
    *   *Response:*  `{"status": "dissonance_detected", "reason": "Input too short", "resolution": "Please provide more details."}`
*   **Rule D2 (Basic Negative Sentiment):** `inputText` contains keywords like "useless," "broken," "stupid," "fail" (case-insensitive) and the list is kept small for the prototype.
    *   *Response:* `{"status": "dissonance_detected", "reason": "Potential negative sentiment", "resolution": "Could you please rephrase or provide more context?"}`

## 5. Frequency Routing Rule (Prototype)

*   **Rule R1 (Clarity Request):**
    *   **Condition:** If `inputText` contains keywords such as "what is", "explain", "define", "how to" (case-insensitive) AND/OR `desiredFrequency.clarity` is high (e.g., > 0.7).
    *   **Action:** Route to a designated "Clarity Agent" (e.g., `agent_id: "clarity_pulse_v1_001"`).
    *   *Response (if agent available):* `{"status": "routed", "agent_id": "clarity_pulse_v1_001", "input": "..."}`
    *   *Response (if agent not available/defined yet):* `{"status": "no_route_found", "reason": "Clarity agent not currently available for this query."}`

## 6. Output Structure

The MCP Node will return a JSON object indicating the outcome:

```json
// Example: Dissonance Detected
{
  "status": "dissonance_detected",
  "reason": "Input too short",
  "resolution": "Please provide more details."
}

// Example: Routed to Agent
{
  "status": "routed",
  "agent_id": "clarity_pulse_v1_001",
  "transformed_input": { /* Potentially modified input for the agent */ }
}

// Example: No Route Found
{
  "status": "no_route_found",
  "reason": "No suitable agent profile matched the input frequency."
}
```

## 7. Implementation Notes (Supabase Edge Function - Conceptual)

*   The function would be triggered via an HTTP request.
*   It would need access to Agent Tone Profiles (e.g., from a Supabase table or embedded configuration). For the prototype, we might hardcode the "Clarity Agent" profile.
*   Keywords for routing and dissonance detection will be simple string matches for now.

## 8. Future Enhancements

*   More sophisticated NLP for intent recognition and sentiment analysis.
*   Dynamic loading of Agent Profiles.
*   Vector similarity matching for `desiredFrequency` against Agent Profiles.
*   Learning capabilities to improve routing over time.
```
