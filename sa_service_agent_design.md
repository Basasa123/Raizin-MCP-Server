# SA Service Delivery Agent (sa_service_agent_v1) - Design Document

## 1. Purpose

The SA Service Delivery Agent (`sa_service_agent_v1`) is responsible for presenting and facilitating the "sale" of two initial services to the South African market:
1.  **Tender BOQ (Bill of Quantities) Assistance:** Priced at R500.
2.  **Website Design:** Priced at R1500.

The agent will provide clear descriptions, pricing, and precise instructions for payment via a specified Ozow payment link. After payment (which is manually verified by the Raizin Vault operator in v1), the agent will collect initial requirements from the user to begin service fulfillment.

## 2. Function Name (Supabase Edge Function)

`sa_service_agent_v1`

## 3. Frequency Profile (Conceptual)

*   **`clarity`**: Very High (e.g., 0.9) - Essential for service descriptions, pricing, and payment instructions.
*   **`trust`**: High (e.g., 0.8) - Important for users to feel confident in making a payment.
*   **`innovation`**: Low (e.g., 0.2) - This agent is transactional, not primarily creative.
*   **`sovereignty`**: Moderate (e.g., 0.6) - Empowers users by providing clear choices and instructions.
*   **`empathy`**: Moderate (e.g., 0.5) - Should be polite and understanding in its interactions.
*   **`urgency`**: Moderate (e.g., 0.5) - Responsive but not overly pushy.

## 4. Inputs (from MCP Node)

The agent expects a JSON object structured as `transformed_input` from the MCP:

```json
{
  "originalText": "string", // The user's query.
  "desiredFrequency": { /* ... */ }, // Optional.
  "sessionId": "string (optional, but useful for payment reference)",
  "source": "string (optional)"
}
```

## 5. Knowledge & Service Details (Hardcoded in v1)

The agent will have internal knowledge of:

*   **Ozow Payment Link:** `https://ozow.me/#/pay/za/0782587132`
*   **Service 1: Tender BOQ Assistance**
    *   **Description:** "I can assist you with preparing your Bill of Quantities (BOQ) for tenders. This service helps ensure your tender submissions are accurate and comprehensive."
    *   **Price:** R500.00
    *   **Payment Reference Instruction:** "Please use reference: `BOQ-[YourName/Email]` or `BOQ-[SessionID]` if a session ID is available." (The agent will try to use SessionID if present).
    *   **Post-Payment Requirements Prompt:** "Thank you! Once you've made the payment, please reply with your payment confirmation (e.g., screenshot or Ozow reference) and provide the tender documents or key details about the project so I can begin assisting you with the BOQ."
*   **Service 2: Website Design**
    *   **Description:** "I can help you design a professional website for your business or project. This includes initial design concepts and structure."
    *   **Price:** R1500.00
    *   **Payment Reference Instruction:** "Please use reference: `WEBDESIGN-[YourName/Email]` or `WEBDESIGN-[SessionID]`."
    *   **Post-Payment Requirements Prompt:** "Thank you! Once you've made the payment, please reply with your payment confirmation and details about your business, target audience, style preferences, required pages (e.g., Home, About, Services, Contact), and any existing branding material."

## 6. Core Conversational Logic (v1 - Primarily Scripted)

The agent's logic will follow these general flows. It does not use an LLM for these core service presentation/payment instruction responses.

1.  **Greeting/Query about Services:**
    *   If `originalText` matches keywords like "services", "offer", "help with", "buy":
        *   Agent responds: "I offer the following services: 1. Tender BOQ Assistance (R500), 2. Website Design (R1500). Which service are you interested in?"
2.  **Query about a Specific Service (e.g., "tell me about BOQ service" or "website design price"):**
    *   Identify the service from keywords.
    *   Respond with the service description, price. Then ask: "Would you like to proceed with this service?"
3.  **User Confirms Intent to Proceed (e.g., "yes", "proceed with website design"):**
    *   Identify the chosen service.
    *   Respond with: "[Service Name] costs [Price]. To proceed, please make a payment to our Ozow account: [Ozow Link].
**Important:** Please use the following payment reference so we can identify your order: `[SERVICE_CODE]-[Identifier]`. For the amount, please enter exactly ZAR [Price]."
        *   `[SERVICE_CODE]` will be "BOQ" or "WEBDESIGN".
        *   `[Identifier]` will be the `sessionId` if available and non-empty. Otherwise, the agent will say: "...reference: `[SERVICE_CODE]-YourNameOrEmail`. Please ensure you use a unique identifier."
    *   Follow up with: "After making the payment, please reply here with your payment confirmation (like a reference number or screenshot) and the specific details for your [Service Name] project."
4.  **User Provides Post-Payment Information (Simulated - Agent just acknowledges):**
    *   If user input seems like they are providing details post-payment (e.g., contains "paid," "confirmation," "requirements," "here are the docs"):
        *   Agent responds with the relevant "Post-Payment Requirements Prompt" for the likely service. E.g., "Thank you for providing the details for your [Service Name] project. We will verify your payment and begin processing your request shortly. Please ensure you have sent your payment confirmation as well."
        *   *(In v1, the agent does not verify payment or start fulfillment. This response manages user expectation).*
5.  **Generic Fallback:**
    *   If user query is unclear or unrelated to the services:
        *   Agent responds: "I can help you with Tender BOQ Assistance or Website Design. Please let me know if you're interested in one of these, or ask me to list my services." (This part *could* be optionally enhanced by an LLM call for more general conversation, but is not core to v1 transactional flow).

## 7. Outputs (to MCP Node)

Standard agent JSON output:
```json
{
  "status": "success", // or "error"
  "agent_id": "sa_service_agent_v1",
  "response_text": "string", // The agent's reply.
  "confidence_score": "float", // High for scripted responses (e.g., 0.95).
  // Standard detailed logging fields will be populated by the agent
  "kb_article_slug": null, // Or could be e.g., "service_boq", "service_webdesign" if structured internally
  "pre_filter_response": "string",
  "pre_filter_confidence": "float",
  "filter_alignment_score": null, // To be filled by MCP
  "filter_warnings": [] // To be filled by MCP
}
```

## 8. Error Handling
*   Basic error handling for unexpected issues.

## 9. Orchestration with MCP & Resonator Filter
*   The `sa_service_agent_v1` generates its scripted responses.
*   It returns this text and its confidence to the MCP.
*   The MCP is responsible for passing this `response_text` through the `resonator_filter`.

This design focuses on clear, direct communication to facilitate service understanding and payment for the defined offerings.
```
