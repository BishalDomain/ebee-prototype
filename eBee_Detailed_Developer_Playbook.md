# eBee Conversational Commerce Platform
## Detailed Developer Playbook and Implementation Framework

Version: 2.0  
Document Type: Product, Architecture, Development, and Delivery Playbook  
Audience: Founders, product managers, frontend engineers, backend engineers, AI engineers, QA, DevOps, and integration teams

---

## 1. Executive Summary

eBee is a conversational commerce platform that allows a user to complete local commerce actions through a single chat interface. Instead of opening separate screens and apps for groceries, food, rides, fruit orders, service booking, or payment, the user interacts with one assistant that understands intent, asks for missing details, calls the correct business flow, and completes the transaction.

The goal of the system is not to build an AI that does everything autonomously. The goal is to build a production-safe commerce system where:

- chat is the primary interaction layer
- AI is used only where interpretation is needed
- business rules remain deterministic in backend services
- payments and order state remain fully auditable
- existing app infrastructure can be reused without duplication

This document refines the original concept into a full development guide that explains:

- what the product does
- how the system works end to end
- where each component runs
- when each service is invoked
- how data moves between modules
- how payment, state, and error handling should behave
- how the system should be built, tested, deployed, and scaled

---

## 2. Product Vision

### 2.1 Vision Statement

Provide a single conversational interface for local commerce that reduces friction from discovery to checkout and allows a user to complete a valid transaction in under 30 seconds for common repeatable tasks.

### 2.2 Core Promise

The user should be able to type natural language such as:

- "Order 1 kg chicken and 12 eggs"
- "Book me a ride to City Center"
- "Get me two veg burgers near my office"
- "Send fruits worth 500 rupees to home"

The system should:

1. understand the request
2. identify the business domain
3. gather only missing information
4. present valid options
5. calculate price and fees
6. trigger payment or COD flow
7. confirm the order with full traceability

### 2.3 Product Principles

- One chat interface, many commerce flows
- AI for understanding, not for core business truth
- Deterministic pricing and order handling
- Minimal user effort
- Reusable backend integrations
- Payment and order verification must be auditable
- Fast fallback when AI confidence is low

---

## 3. Scope of the Platform

### 3.1 In Scope for V1

- Conversational ordering for grocery, fruits, and food
- Conversational ride booking request flow
- Cart creation and cart modification through chat
- Address selection and delivery slot collection
- Payment initiation through Razorpay
- Existing app/backend integration
- Session memory inside a single user journey
- Human-readable confirmations
- Admin-friendly logs and monitoring

### 3.2 Out of Scope for V1

- Fully autonomous vendor negotiation
- Dynamic marketplace bidding
- Advanced personalization models
- Voice-first interface
- Full multilingual NLU beyond a basic extension path
- Long-term behavioral recommendation engine

### 3.3 Future Scope

- Voice ordering
- multilingual support
- user preference memory
- recommendation engine
- merchant onboarding panel
- live driver/vendor tracking
- subscriptions and recurring orders

---

## 4. User Personas and Primary Use Cases

### 4.1 Primary Users

- Busy households ordering groceries quickly
- Office users ordering food during work hours
- Repeat customers who want fewer taps and screens
- Users unfamiliar with complex app navigation

### 4.2 Use Cases

#### Grocery Ordering

User types a product list. The system maps products, asks only for missing quantities or brand variants, confirms cart, and moves to checkout.

#### Food Ordering

User requests a cuisine, dish, or restaurant preference. The system finds available items, presents a shortlist, allows modifications, and places the order.

#### Ride Booking

User shares pickup and destination. The system validates locations, offers ride options, collects confirmation, and books the trip or redirects to the ride module.

#### Fruit Ordering

User gives either product quantities or budget-based requests. The system converts the request into available SKUs or basket options.

---

## 5. High-Level System Objective

eBee should function as an orchestration layer, not as a replacement for every operational system underneath.

That means the platform is split into these responsibilities:

- frontend chat UI captures user messages and renders structured responses
- AI parser converts natural language into structured intent and entities
- intent router maps the structured output to a business domain
- domain services enforce business logic and validation
- data services read from product, pricing, cart, ride, and order sources
- payment service handles secure order creation and payment verification
- orchestration layer manages conversation state and next-step decisions

---

## 6. Architecture Overview

### 6.1 Logical Architecture

```text
Flutter App
  -> Chat UI Layer
  -> Session State / Tokens
  -> Razorpay SDK

FastAPI Backend
  -> Chat Orchestrator
  -> Intent Router
  -> AI Parsing Adapter
  -> Domain Services
  -> Cart Service
  -> Order Service
  -> Payment Service
  -> Integration Connectors
  -> Audit / Logging Layer

AI Layer
  -> Ollama-hosted local model or pluggable LLM provider
  -> Strict JSON extraction only

Persistence
  -> SQLite/PostgreSQL for app data
  -> Redis or in-memory store for sessions
  -> Existing product/order database
```

### 6.2 Runtime Sequence

```text
User message
-> frontend sends /chat request
-> backend loads session state
-> AI extracts intent/entities if required
-> router selects domain flow
-> domain service validates data
-> system asks follow-up or executes action
-> backend returns response payload
-> frontend renders chat bubble, cards, buttons, or payment trigger
```

### 6.3 Where Each Part Runs

- Flutter app runs on Android and iOS client devices
- FastAPI backend runs on a VPS, cloud VM, container platform, or internal server
- Ollama can run on the same backend host in early-stage deployments or on a separate AI host when scaling
- database runs on the backend environment or managed database service
- Razorpay checkout runs in the client through the Flutter SDK, with server-side verification on backend

---

## 7. Deployment Modes

### 7.1 Development Mode

- Flutter app runs locally
- FastAPI runs on local machine or dev VM
- Ollama runs locally
- SQLite may be used for quick prototyping
- mock products and mock payment callbacks are allowed

### 7.2 Staging Mode

- shared backend environment
- test merchant keys
- staging database
- controlled vendor catalog
- end-to-end flow verification

### 7.3 Production Mode

- FastAPI behind reverse proxy
- PostgreSQL recommended instead of SQLite
- Redis recommended for session caching
- AI hosted with resource isolation
- HTTPS mandatory
- payment verification mandatory
- structured logging and monitoring enabled

---

## 8. Recommended Tech Stack

### 8.1 Frontend

- Flutter for cross-platform mobile app
- Provider, Riverpod, or Bloc for state management
- Dio or HTTP package for API calls
- Razorpay Flutter SDK for payment collection

### 8.2 Backend

- Python FastAPI
- Pydantic models for request/response contracts
- SQLAlchemy or SQLModel for persistence
- Uvicorn/Gunicorn for serving
- Redis for session and rate-limited caching

### 8.3 AI Layer

- Ollama for self-hosted local inference in low-cost mode
- Mistral, Llama, or equivalent instruction model
- strict prompt + JSON schema validation

### 8.4 Data Layer

- SQLite for prototype
- PostgreSQL for production
- existing product, order, and customer tables reused where possible

### 8.5 Infrastructure

- Nginx or Caddy as reverse proxy
- Docker for packaging
- GitHub Actions or similar CI/CD
- Sentry or equivalent error monitoring
- Prometheus/Grafana or cloud metrics for observability

---

## 9. Design Philosophy for AI

The AI should not decide prices, inventory, payment status, or final order truth.

The AI should only perform tasks like:

- intent extraction
- entity extraction
- short clarification suggestions
- optional response wording

The AI must not perform tasks like:

- calculating final payable amount
- marking payment success
- bypassing validation
- inventing product IDs
- creating irreversible business state without backend validation

### 9.1 Why This Matters

This separation keeps the system:

- cheaper to run
- safer to scale
- easier to debug
- less likely to hallucinate business data
- easier to audit for payment and order disputes

---

## 10. AI Prompting and Output Contract

### 10.1 Prompt Objective

Given a user message and current session context, the AI should return only structured JSON with:

- `intent`
- `domain`
- `entities`
- `confidence`
- `missing_fields`
- `next_action`

### 10.2 Example Prompt

```text
You are an intent extraction engine for a conversational commerce app.
Read the user message and return JSON only.
Do not explain anything.
Extract:
- domain
- intent
- entities
- missing_fields
- confidence
- next_action

Allowed domains: grocery, fruits, food, ride, support, unknown
Allowed intents: add_to_cart, modify_cart, checkout, browse, book_ride, confirm_order, cancel, greeting, unknown
```

### 10.3 Example AI Output

```json
{
  "domain": "grocery",
  "intent": "add_to_cart",
  "entities": {
    "items": [
      { "name": "chicken", "quantity": 1, "unit": "kg" },
      { "name": "eggs", "quantity": 12, "unit": "pieces" }
    ]
  },
  "missing_fields": [],
  "confidence": 0.95,
  "next_action": "resolve_catalog_items"
}
```

### 10.4 Guardrails

- reject non-JSON responses
- validate against schema
- fallback to clarification flow if confidence is below threshold
- store raw AI output for debug in non-sensitive logs

---

## 11. Conversation Orchestration Framework

### 11.1 Orchestrator Responsibilities

The chat orchestrator is the most important backend module. It receives the request and decides what to do next based on state and validated outputs.

Responsibilities:

- load session context
- decide if AI parsing is required
- merge AI output with known user data
- trigger domain service
- build user-facing response
- preserve conversation state

### 11.2 Conversation State Model

Each session should track:

- session ID
- user ID
- active domain
- active intent
- collected entities
- pending required fields
- cart ID or booking ID
- last assistant message type
- payment stage
- retry counts

### 11.3 Why State Management Matters

Without persistent state, the assistant repeats questions, loses context, or breaks after payment and checkout steps.

Example:

If the user says:

- "Add milk and bread"
- "Also two apples"
- "Use my home address"

the system must remember that all these belong to the same active cart session and should not ask for cart creation again.

---

## 12. Domain Routing Strategy

### 12.1 Router Inputs

- intent
- domain
- current state
- user role
- integration availability

### 12.2 Router Outputs

- target service name
- required validations
- next workflow step

### 12.3 Example Routing Rules

- `grocery + add_to_cart` -> `GroceryCartService.add_items`
- `food + browse` -> `FoodDiscoveryService.search_items`
- `ride + book_ride` -> `RideService.prepare_quote`
- `checkout` with active cart -> `CheckoutService.prepare_order`
- `confirm_order` after payable amount -> `PaymentService.create_payment_order`

---

## 13. Domain Modules

### 13.1 Grocery Module

Responsibilities:

- map generic product names to available SKUs
- ask for quantity only if missing
- support weight, pieces, brand, and size variants
- add or update cart lines
- calculate subtotal

Flow:

1. parse items from chat
2. resolve catalog matches
3. detect ambiguity
4. ask follow-up if needed
5. add valid item to cart
6. confirm updated cart

### 13.2 Food Module

Responsibilities:

- search restaurant/menu source
- filter by cuisine, dish, price, or distance
- support item customization
- bundle delivery charge and tax

Flow:

1. capture user preference
2. shortlist valid items
3. let user choose
4. handle add-ons or notes
5. confirm order summary
6. proceed to payment

### 13.3 Fruit Module

Responsibilities:

- support quantity-based and budget-based ordering
- map seasonal availability
- suggest basket combinations if exact items unavailable

### 13.4 Ride Module

Responsibilities:

- capture pickup and destination
- validate serviceable geography
- estimate fare or request quote
- confirm ride type
- hand off to ride backend or external provider

Note:

Ride flow may require stronger geolocation and operational integration than food/grocery. It can be architected as a partially conversational front door that redirects to a dedicated ride screen if needed.

---

## 14. Business Logic Layer

This layer must be deterministic and must not depend on the AI model.

Core responsibilities:

- product validation
- quantity validation
- service-area validation
- pricing
- tax and delivery charge calculation
- cart merge rules
- order creation rules
- inventory checks
- payment status enforcement

### 14.1 Example Rule Types

- quantity must be positive
- item must exist in catalog
- checkout requires address and payment method
- ride booking requires pickup and destination
- payment success must be verified before order finalization

---

## 15. Data Model Framework

### 15.1 Core Entities

- User
- Session
- Message
- Cart
- CartItem
- Product
- CatalogVariant
- Address
- Order
- PaymentOrder
- PaymentTransaction
- RideRequest

### 15.2 Suggested Minimal Schema

#### User

- `id`
- `name`
- `phone`
- `email`
- `default_address_id`
- `created_at`

#### Session

- `id`
- `user_id`
- `active_domain`
- `active_intent`
- `state_json`
- `status`
- `updated_at`

#### Message

- `id`
- `session_id`
- `sender`
- `message_text`
- `message_type`
- `structured_payload`
- `created_at`

#### Cart

- `id`
- `user_id`
- `session_id`
- `status`
- `subtotal`
- `tax_amount`
- `delivery_fee`
- `total_amount`

#### Order

- `id`
- `user_id`
- `cart_id`
- `domain`
- `status`
- `payment_status`
- `address_id`
- `final_amount`
- `created_at`

#### PaymentTransaction

- `id`
- `order_id`
- `gateway`
- `gateway_order_id`
- `gateway_payment_id`
- `signature`
- `status`
- `amount`
- `created_at`

---

## 16. API Contract Design

### 16.1 Core APIs

#### POST `/chat`

Purpose:

- receive user chat message
- process orchestration
- return UI-ready structured reply

Request:

```json
{
  "user_id": "u_123",
  "session_id": "s_456",
  "message": "Add 1 kg chicken and 12 eggs"
}
```

Response:

```json
{
  "session_id": "s_456",
  "reply_text": "I have added 1 kg chicken and 12 eggs to your cart. Would you like to checkout now?",
  "reply_type": "confirmation",
  "domain": "grocery",
  "actions": [
    { "type": "button", "id": "checkout", "label": "Checkout" },
    { "type": "button", "id": "continue", "label": "Add More" }
  ],
  "state": {
    "cart_id": "c_101",
    "pending_fields": []
  }
}
```

#### POST `/cart/add`

Adds validated line items to cart.

#### POST `/checkout/prepare`

Creates final payable summary after address, fees, taxes, and offers.

#### POST `/payment/create-order`

Creates Razorpay order on backend and returns payload needed by frontend SDK.

#### POST `/payment/verify`

Validates Razorpay signature and marks payment transaction status.

#### POST `/order/confirm`

Creates or finalizes order after payment verification or allowed COD path.

---

## 17. Frontend Architecture

### 17.1 Flutter App Structure

Suggested modules:

- `presentation/chat`
- `presentation/cart`
- `presentation/checkout`
- `presentation/payment`
- `domain/models`
- `domain/usecases`
- `data/repositories`
- `data/api`
- `core/theme`
- `core/navigation`

### 17.2 Chat UI Requirements

- chat bubble timeline
- assistant cards for items and options
- quick reply buttons
- typing/loading state
- payment CTA rendering
- graceful fallback messages

### 17.3 UI Interaction Principles

- keep interaction conversational but not vague
- render structured data as cards instead of long text where possible
- reduce typing with chips and buttons
- preserve scroll and conversation history
- always show the next actionable step

---

## 18. Personality and Response Design

The system tone should remain:

- calm
- efficient
- professional
- lightly human
- operationally clear

### 18.1 Personality Rules

- use complete sentences
- confirm actions clearly
- ask one decision at a time
- avoid slang, jokes, and overfriendly filler
- never sound uncertain when backend state is known
- never claim payment success before verification

### 18.2 Response Template

Use this structure:

`Action completed -> current status -> next decision`

Example:

"I have added 1 kg chicken and 12 eggs to your cart. Your current total is Rs. 420. Would you like to checkout now?"

### 18.3 Clarification Style

Bad:

"What do you mean?"

Good:

"I found multiple matches for apples. Would you like 1 kg red apples or 1 kg green apples?"

---

## 19. End-to-End Flow Design

### 19.1 Grocery Order Flow

1. user types order
2. `/chat` receives message
3. AI extracts grocery intent and entities
4. backend resolves catalog products
5. missing information is requested if necessary
6. item is added to cart
7. cart summary is returned
8. user selects checkout
9. address and payment method are confirmed
10. payable summary is generated
11. payment is initiated
12. payment is verified
13. order is created
14. final confirmation is shown

### 19.2 Food Order Flow

1. detect cuisine or dish request
2. fetch relevant menu items
3. ask user to choose from structured options
4. capture item customization
5. generate order summary
6. collect payment
7. confirm order

### 19.3 Ride Booking Flow

1. detect pickup and destination request
2. resolve or geocode locations
3. validate serviceability
4. estimate price or request provider quote
5. collect ride preference
6. confirm booking
7. hand off booking ID and status

---

## 20. Payment Integration Framework

### 20.1 Payment Architecture

Razorpay must be integrated in a split-responsibility model:

- backend creates payment order
- frontend launches Razorpay checkout
- backend verifies payment signature
- order finalization happens only after verification

### 20.2 Payment Flow

1. user confirms checkout
2. backend calculates final amount
3. backend creates Razorpay order
4. frontend opens Razorpay SDK with returned order ID
5. user completes payment
6. frontend sends payment result to backend
7. backend verifies signature
8. backend marks payment success or failure
9. backend confirms order
10. user receives final confirmation

### 20.3 Required Safety Rules

- never trust frontend payment success blindly
- verify signature on backend every time
- prevent duplicate order confirmation on retries
- store gateway references for reconciliation
- support idempotency keys for repeated callbacks

### 20.4 Failure Cases

- payment window closed
- payment authorized but verification pending
- callback retry received twice
- order creation fails after successful payment

Mitigation:

- maintain transaction status machine
- implement retry-safe order finalization
- queue manual reconciliation when needed

---

## 21. Integration with Existing App and Backend

The chat layer should sit on top of the existing system rather than rebuilding the entire product.

### 21.1 Integration Principles

- reuse product catalog APIs
- reuse cart and order services where available
- reuse authentication and user profile systems
- do not create duplicate data ownership
- build adapters if existing APIs are not chat-friendly

### 21.2 Recommended Integration Pattern

```text
Flutter Chat Layer
-> Chat Orchestrator API
-> Existing Backend Services
   -> Product Service
   -> Cart Service
   -> Order Service
   -> Address Service
   -> Payment Service
```

### 21.3 Where Chat Adds Value

- natural language input
- next-step orchestration
- reduced navigation friction
- unified cross-domain entry point

### 21.4 Where Existing App Still Matters

- detailed product pages
- full cart review
- account management
- support history
- map-heavy experiences

### 21.5 Deep Linking Strategy

When chat is not the best interface for a step, the assistant should deep-link to a specific screen:

- address management
- live map selection
- restaurant menu detail
- ride route preview

The user should return to the same session context after completing the screen task.

---

## 22. Error Handling and Fallback Design

### 22.1 Categories of Errors

- AI parse failure
- unknown intent
- ambiguous entity
- invalid quantity
- product unavailable
- backend timeout
- payment failure
- external integration failure

### 22.2 Fallback Strategy

If AI confidence is low:

- ask a constrained clarification question
- present domain shortcuts
- never guess silently on expensive actions

If backend fails:

- keep session state
- show retry-safe message
- avoid duplicate charges or orders

### 22.3 Example Fallback Message

"I could not confirm the exact item yet. Please choose one of these options so I can continue."

---

## 23. Security and Compliance Considerations

### 23.1 Security Requirements

- HTTPS for all environments except isolated local dev
- token-based authentication
- signed payment verification
- input validation for every endpoint
- role-based access for admin operations
- PII masking in logs

### 23.2 Sensitive Data Rules

Do not log:

- full card details
- payment secrets
- complete personal addresses in unsecured logs
- authentication tokens

### 23.3 Payment Compliance Direction

The system should rely on Razorpay SDK and backend verification rather than storing any direct card details. This reduces PCI exposure and keeps the architecture safer.

---

## 24. Performance and Scalability

### 24.1 Performance Targets

- average chat response under 2 seconds for common flows
- AI parsing under 1 second if local model is tuned well
- payment initiation under 3 seconds
- order confirmation under 2 seconds after verification

### 24.2 Optimization Strategy

- call AI only when message meaning is not already deterministic
- cache product lookups
- preload repeat user context
- keep prompts small and structured
- use async integration calls

### 24.3 Scale Strategy

As load grows:

- separate AI inference service
- move sessions into Redis
- move from SQLite to PostgreSQL
- scale API horizontally
- queue heavy non-blocking tasks such as analytics and notifications

---

## 25. Observability and Monitoring

### 25.1 What to Track

- message count by domain
- AI parse success and failure rate
- clarification rate
- add-to-cart success rate
- checkout conversion
- payment success rate
- order finalization failures
- average response latency

### 25.2 Logs to Maintain

- request ID
- session ID
- user ID
- selected domain
- chosen service path
- payment order ID
- final order ID

### 25.3 Alerts

- payment verification mismatch
- sudden increase in AI parse failures
- order confirmation failures
- repeated external service timeouts

---

## 26. Testing Strategy

### 26.1 Unit Tests

Test:

- intent router logic
- quantity validation
- pricing calculation
- payment signature verification
- state transition rules

### 26.2 Integration Tests

Test:

- `/chat` with mocked AI
- cart creation and update
- checkout preparation
- payment order creation
- order finalization after verification

### 26.3 End-to-End Tests

Simulate:

- grocery flow from message to paid order
- food flow with customization
- ride flow with serviceability rejection
- payment failure and retry

### 26.4 Manual QA Checklist

- ambiguous items handled correctly
- duplicate button taps do not duplicate orders
- deep links return to same session
- failed payments do not mark orders paid
- cart totals stay consistent across chat and app screens

---

## 27. Suggested Folder Structure

### 27.1 Backend

```text
backend/
  app/
    api/
    core/
    models/
    schemas/
    services/
      ai/
      chat/
      cart/
      checkout/
      payment/
      grocery/
      food/
      fruits/
      ride/
    repositories/
    integrations/
    tests/
```

### 27.2 Flutter

```text
mobile/
  lib/
    core/
    data/
    domain/
    presentation/
      chat/
      cart/
      checkout/
      payment/
```

---

## 28. State Machine Recommendation

### 28.1 Session State Examples

- `idle`
- `collecting_items`
- `clarifying_item`
- `cart_ready`
- `awaiting_address`
- `awaiting_payment_choice`
- `payment_initiated`
- `payment_verified`
- `order_confirmed`
- `failed_recoverable`

### 28.2 Why State Machines Help

State machines reduce hidden logic bugs and make it easier to:

- recover sessions
- support retries
- debug production failures
- build consistent frontend reactions

---

## 29. Development Plan

### Phase 1: Foundation

- define API contracts
- build chat UI shell
- create FastAPI project structure
- set up session model and logging

### Phase 2: Core Commerce Flow

- implement `/chat`
- integrate AI parser
- build grocery and cart services
- create deterministic routing logic

### Phase 3: Checkout and Payment

- build checkout summary
- integrate Razorpay order creation
- integrate payment verification
- implement order finalization

### Phase 4: Additional Domains

- add food ordering
- add fruits flow
- add ride booking integration

### Phase 5: Hardening

- observability
- retry and fallback handling
- security review
- performance tuning
- staging UAT

---

## 30. Team Responsibilities

### Product Team

- define supported journeys
- clarify edge-case behavior
- approve UX and response style

### Frontend Team

- build chat UI and action components
- integrate SDKs and APIs
- manage local app state and navigation

### Backend Team

- orchestration, services, contracts, validation, payment verification

### AI Team

- prompt tuning
- model evaluation
- confidence thresholds
- extraction quality monitoring

### QA Team

- flow coverage
- payment edge-case validation
- regression testing

---

## 31. Risks and Mitigation

### Risk: AI Misclassification

Mitigation:

- use schema validation
- confidence threshold
- fallback questions
- add rule-based short-circuit for common phrases

### Risk: Duplicate Orders from Retry

Mitigation:

- idempotency keys
- order status locks
- transaction-safe finalization

### Risk: Existing API Mismatch

Mitigation:

- add adapter layer
- create chat-specific composition endpoints
- avoid modifying stable legacy APIs unless necessary

### Risk: Slow Response Time

Mitigation:

- reduce AI dependency
- cache common lookups
- optimize prompt and model size

---

## 32. Recommended MVP Definition

The strongest MVP is not "all commerce categories at once." The strongest MVP is:

- one chat interface
- one stable backend orchestrator
- grocery flow fully working
- payment end to end
- existing app integration enabled

Then extend the same framework into food, fruits, and rides.

This gives the team:

- lower complexity
- faster release
- clearer debugging
- reusable architecture

---

## 33. Final Implementation Summary

eBee should be built as a conversational orchestration platform that sits between the user and existing commerce services.

The correct implementation model is:

- chat-first frontend
- FastAPI orchestration backend
- AI for structured interpretation only
- deterministic domain services for execution
- Razorpay for secure payment collection
- session memory for conversational continuity
- reusable integration with existing backend systems

The system works:

- when a user sends a message through the mobile chat UI
- where the backend can parse intent and access catalog/order systems
- how the orchestrator maps the message into a validated commerce action
- when payment is confirmed only after gateway verification
- where existing app modules remain useful through deep links and shared services

If implemented in this structure, eBee becomes not just a chatbot but a scalable conversational commerce operating layer.

---

## 34. Immediate Build Recommendation

Build in this order:

1. chat UI shell
2. `/chat` orchestration endpoint
3. grocery parser and cart service
4. checkout summary
5. Razorpay payment flow
6. order confirmation
7. integration with existing app screens
8. food and ride expansions

This order minimizes risk while producing a usable and demo-ready product early.

