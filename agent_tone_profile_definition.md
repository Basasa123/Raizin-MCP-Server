# Agent Tone Profile Definition

## 1. Purpose

Agents in the Raizin Vault system are "Harmonic Emitters," each tuned to a specific frequency cluster. This document defines the metadata structure used to describe an agent's tone profile. This profile is essential for the MCP Node Grid to route signals effectively and for agents to shape their responses in alignment with their designated frequency.

## 2. Metadata Structure

The tone profile for an agent is defined using a JSON object. Below is the schema and an explanation of its fields:

```json
{
  "agent_id": "string (unique)",
  "name": "string",
  "description": "string",
  "frequency_profile": {
    "trust": "float (0.0-1.0)",
    "innovation": "float (0.0-1.0)",
    "sovereignty": "float (0.0-1.0)",
    "clarity": "float (0.0-1.0)",
    "empathy": "float (0.0-1.0)",
    "urgency": "float (0.0-1.0)"
  },
  "keywords": ["string"],
  "response_style_guide": "string (URI/path, optional)"
}
```

### Field Explanations:

*   **`agent_id` (string, unique):**
    A unique identifier for the agent (e.g., "pulse_agent_clarity_001", "wave_agent_trust_analyzer_alpha"). This ID will be used internally for routing and management.

*   **`name` (string):**
    A human-readable name for the agent (e.g., "Clarity Pulse Emitter", "Trust Resonance Modulator").

*   **`description` (string):**
    A brief explanation of the agent's primary function and the type of resonance it aims to achieve (e.g., "Provides immediate, clear answers to factual queries," "Analyzes input for alignment with trust principles and suggests refinements").

*   **`frequency_profile` (object):**
    An object containing key-value pairs where keys are tone dimensions and values are floats between 0.0 and 1.0, indicating the agent's alignment or specialization in that dimension.
    *   **`trust`**: Alignment with transparency, reliability, and honesty.
    *   **`innovation`**: Alignment with forward-thinking, creativity, and new ideas.
    *   **`sovereignty`**: Alignment with empowerment, autonomy, and respect.
    *   **`clarity`**: Specialization in providing clear, unambiguous information.
    *   **`empathy`**: Specialization in understanding and responding to emotional context.
    *   **`urgency`**: Specialization in handling time-sensitive matters or conveying importance.
    *   *Additional custom dimensions can be added as the system evolves.*

*   **`keywords` (array of strings):**
    A list of keywords or phrases that are strongly associated with this agent's function or the type of input it's designed to handle. This can aid the MCP Node Grid in initial signal routing. (e.g., ["faq", "define", "explain"] for a clarity agent).

*   **`response_style_guide` (string, URI/path, optional):**
    An optional field that can point to a more detailed document, prompt template, or configuration file that guides the agent's response generation (e.g., a specific LLM prompt, a set of stylistic rules).

## 3. Example Profile:

```json
{
  "agent_id": "clarity_pulse_v1_001",
  "name": "Instant Clarity Agent",
  "description": "Responds to direct questions with concise and clear information, prioritizing factual accuracy.",
  "frequency_profile": {
    "trust": 0.8,
    "innovation": 0.3,
    "sovereignty": 0.6,
    "clarity": 0.95,
    "empathy": 0.2,
    "urgency": 0.7
  },
  "keywords": ["what is", "explain", "define", "how to", "faq"],
  "response_style_guide": "agents/styles/clarity_pulse_prompt.md"
}
```

## 4. Usage

This metadata will be stored and accessed by the MCP Node Grid and potentially by the agents themselves. For instance, it could be stored in a Firestore collection, a Supabase table, or as individual JSON files if agents are managed as separate microservices.
```
