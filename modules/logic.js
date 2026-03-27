import { db, localRecipePlans, odishaRideAreas, supportedRideLocations } from "./data.js";
import { fetchRecipePlan, maybePolishResponse } from "./services.js";
import { createInitialRideState, createInitialTotals, resetSessionState, state } from "./state.js";
import { appendMessage, clearConversation, el, removeTyping, renderSuggestions, renderSummary, setAssistantPresence, setDrawerOpen, setMenuView, showTyping } from "./ui.js";
import {
  buildMissingItemMessage,
  buildUnavailablePersonalityReply,
  buildAbsurdCatalogFallback,
  buildPlayfulCookingFallback,
  cleanMealName,
  delay,
  formatAvailabilityList,
  estimateRidePricing,
  formatItems,
  getQuantityStep,
  hasFoodServiceCue,
  includesAny,
  inferQuantity,
  isGreeting,
  isLikelyCookedDish,
  isLikelyRawIngredientRequest,
  normalizeText,
  personalityFlags,
  shouldUseAbsurdCatalogFallback,
  shouldUsePlayfulCookingFallback,
  similarity,
  titleCase,
  toCard,
} from "./utils.js";

const DELIVERY_TRACKING_STAGES = [
  { status: "Order placed", copy: "Your order was placed successfully.", percent: 24 },
  { status: "Preparing", copy: "The store is preparing your order.", percent: 52 },
  { status: "Out for delivery", copy: "Your delivery partner is on the way.", percent: 82 },
  { status: "Delivered", copy: "The order was delivered successfully.", percent: 100 },
];

const RIDE_TRACKING_STAGES = [
  { status: "Ride booked", copy: "Your rental was confirmed successfully.", percent: 26 },
  { status: "Driver assigned", copy: "A driver has been assigned to the ride.", percent: 54 },
  { status: "Driver arriving", copy: "Your driver is heading to the pickup point.", percent: 82 },
  { status: "Trip completed", copy: "The rental trip was completed.", percent: 100 },
];

let speechRecognition = null;
let trackingTimeouts = [];

function action(label, payload, tone = "secondary") {
  return { label, payload, tone };
}

function buildPrimaryEntryActions() {
  return [
    action("Groceries", "i want groceries"),
    action("Food", "i want food"),
    action("Fruits", "i want fruits"),
    action("Rental ride", "book a ride", "primary"),
  ];
}

function buildDeliveryActions() {
  return [
    action("Checkout", "checkout", "primary"),
    action("Add more", "add more"),
  ];
}

function buildRideModeActions() {
  return [
    action("Car", "car"),
    action("Bike", "bike"),
    action("Cab", "cab", "primary"),
  ];
}

function buildRideOccupancyActions(mode) {
  if (mode === "bike") {
    return [action("Reserved", "reserved", "primary")];
  }

  return [
    action("Shared", "shared"),
    action("Reserved", "reserved", "primary"),
  ];
}

function buildRideTimeActions() {
  return [
    action("Now", "now"),
    action("In 30 min", "in 30 min"),
    action("Tomorrow 9 AM", "tomorrow 9 AM"),
  ];
}

function buildRideConfirmActions() {
  return [
    action("Confirm booking", "confirm booking", "primary"),
    action("Change time", "change time"),
  ];
}

export function initApp() {
  bindEvents();
  initVoiceInput();
  setDrawerOpen("");
  setMenuView(state.menuView);
  welcome();
  syncScrollState();
  renderSummary(state);
}

// Wire all persistent UI listeners in one place so startup is easy to follow.
function bindEvents() {
  el.chatForm.addEventListener("submit", onSubmit);
  el.chatLog.addEventListener("click", onChatActionClick);
  el.resetButton.addEventListener("click", resetSession);
  el.historyList.addEventListener("click", onHistoryClick);
  el.cartGroups.addEventListener("click", onCartClick);
  el.cartGroups.addEventListener("input", onCartInputChange);
  el.cartGroups.addEventListener("change", onCartInputChange);
  el.historyViewBtn?.addEventListener("click", () => setMenuSection("history"));
  el.flowViewBtn?.addEventListener("click", () => setMenuSection("flow"));
  el.menuToggle?.addEventListener("click", () => toggleDrawer("menu"));
  el.cartToggle?.addEventListener("click", () => toggleDrawer("cart"));
  el.closeMenu?.addEventListener("click", () => setDrawerOpen(""));
  el.closeCart?.addEventListener("click", () => setDrawerOpen(""));
  el.drawerOverlay?.addEventListener("click", () => setDrawerOpen(""));
  el.uploadTrigger?.addEventListener("click", () => el.imageInput?.click());
  el.imageInput?.addEventListener("change", onMenuImageSelected);
  el.voiceTrigger?.addEventListener("click", onVoiceTrigger);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("scroll", syncScrollState, { passive: true });
}

function welcome() {
  appendMessage("assistant", {
    text: "Hi, Zippy here from eBee. Tell me what you need, and I will help you sort it out step by step. You can ask for groceries, food, fruits, or a rental ride in one simple message.",
    actions: buildPrimaryEntryActions(),
  });
  renderSuggestions([], handleUserMessage);
}

function onSubmit(event) {
  event.preventDefault();
  const message = el.userInput.value.trim();
  if (!message) return;
  handleUserMessage(message);
  el.chatForm.reset();
}

async function handleUserMessage(message) {
  setDrawerOpen("");
  appendMessage("user", { text: message });
  setAssistantPresence("Thinking");
  renderSuggestions([], handleUserMessage);
  showTyping();

  const response = await createResponse(message);
  response.text = await maybePolishResponse(response.text, `${state.activeDomain} | ${state.flowState}`);

  removeTyping();
  setAssistantPresence("Online");
  appendMessage("assistant", response);
  renderSuggestions(response.actions || [], handleUserMessage);
  renderSummary(state);
}

async function createResponse(rawMessage) {
  await delay(360);
  const message = normalizeText(rawMessage);

  if (includesAny(message, ["reset", "new chat", "start over"])) {
    resetStateOnly();
    return {
      text: "Fresh chat started. What would you like help with?",
      actions: buildPrimaryEntryActions(),
    };
  }

  if (isGreeting(message)) {
    return {
      text: "Hi, nice to hear from you. How can I help you today?",
      actions: buildPrimaryEntryActions(),
    };
  }

  if (includesAny(message, ["surprise me"])) {
    return {
      text: "Here is a good cooking surprise for today: chicken biryani, veg pulao, or a simple masala meal prep. If you want, say 'I am in the mood to cook biryani' and I will prepare the ingredient set for you.",
      actions: [
        action("Cook biryani", "i want to cook biryani", "primary"),
        action("Order food", "i want food"),
      ],
    };
  }

  const cookingIntent = inferCookingIntent(message);
  if (cookingIntent) {
    state.recipePlan = null;
    return handleCookingIntent(cookingIntent);
  }

  if (wantsToCookButMealMissing(message)) {
    state.activeDomain = "grocery";
    state.flowState = "waiting for meal idea";
    return {
      text: "Nice. What do you want to cook today? Tell me the dish, and I can suggest the required items or work from your own shopping list.",
    };
  }

  if (state.recipePlan) return handleRecipePlanStep(rawMessage);
  if (state.ride.step) return handleRideStep(rawMessage);

  const rideStartResponse = maybeStartRideFlow(rawMessage);
  if (rideStartResponse) return rideStartResponse;

  if (includesAny(message, ["checkout", "place order"])) {
    if (state.activeDomain === "ride") {
      return buildRideCheckoutResponse();
    }
    return buildCheckoutResponse();
  }

  if (includesAny(message, ["cod", "cash on delivery"])) {
    if (state.activeDomain === "ride") {
      return {
        text: "Rental rides use a dedicated booking flow instead of cash on delivery. Review the ride summary and confirm the booking when you are ready.",
        actions: buildRideConfirmActions(),
      };
    }
    return handlePaymentChoice("cod");
  }

  if (includesAny(message, ["confirm payment", "pay now", "yes pay", "pay"])) {
    if (state.activeDomain === "ride") {
      return buildRideCheckoutResponse();
    }
    if (!state.paymentChoice) return handlePaymentChoice("pay_now");
    return handlePaymentConfirmation();
  }

  if (includesAny(message, ["change address", "office", "home address"])) {
    state.address = message.includes("office") ? "Office Tower, Sector 5" : "Home address";
    state.flowState = "address updated";
    return {
      text: `Address updated to ${state.address}.`,
      actions: buildDeliveryActions(),
    };
  }

  if (includesAny(message, ["remove"])) {
    const removed = removeCartItem(rawMessage);
    if (removed) {
      return { text: `Done. I removed ${removed.name} from your cart. Your updated total is Rs. ${state.totals.total}.` };
    }
  }

  if (includesAny(message, ["i want groceries", "grocery"])) {
    return promptForItems("grocery", "Tell me the grocery items you want, and include quantity if you know it.");
  }

  if (includesAny(message, ["i want food", "food"])) {
    return promptForItems("food", "Tell me the food items you want, and I will add them one by one.");
  }

  if (includesAny(message, ["i want fruits", "fruits", "fruit"])) {
    return promptForItems("fruits", "Tell me the fruits you want, or tell me your budget.");
  }

  if (state.cart.length && includesAny(message, ["no", "nothing else", "thats all", "that's all", "done"])) {
    return buildCheckoutResponse();
  }

  if (state.cart.length && includesAny(message, ["add more", "yes"])) {
    state.flowState = "collecting request";
    return {
      text: "Sure, tell me the next item you want to add.",
      actions: [
        action("Groceries", "milk, bread"),
        action("Food", "burger, fries"),
        action("Fruits", "apples, bananas"),
      ],
    };
  }

  if (state.cart.length && includesAny(message, ["checkout now", "continue checkout", "go to checkout"])) {
    return buildCheckoutResponse();
  }

  const mixedResult = handleMixedCatalogFlow(rawMessage);
  if (mixedResult) return mixedResult;

  const matchedCatalogDomain = inferCatalogDomainByCatalog(rawMessage);
  if (matchedCatalogDomain) return handleCatalogFlow(matchedCatalogDomain, rawMessage);

  const contextualDomain = getContextualDomain();
  if (contextualDomain) return handleCatalogFlow(contextualDomain, rawMessage);

  const inferredDomain = inferCatalogDomain(message);
  if (inferredDomain) return handleCatalogFlow(inferredDomain, rawMessage);

  return {
    text: "I can help with groceries, food, fruits, or rental rides. Tell me what you want in a sentence, and I will take it from there.",
    actions: buildPrimaryEntryActions(),
  };
}

// Recipe planning stays separate from normal grocery parsing so cooking prompts remain readable.
async function handleCookingIntent(mealName) {
  state.activeDomain = "grocery";
  state.flowState = "planning ingredients";

  const plan = await fetchRecipePlan(mealName, localRecipePlans, titleCase);

  if (!plan.ingredients.length) {
    state.recipePlan = null;
    state.flowState = "collecting request";

    if (shouldUsePlayfulCookingFallback(mealName)) {
      return {
        text: `${buildPlayfulCookingFallback(mealName)} If you already know what you need, just type the shopping list and I will add the real items.`,
      };
    }

    return {
      text: `I picked up that you want to cook ${plan.title}. I could not build a reliable ingredient set automatically yet, but I can still help if you tell me the main items you want.`,
    };
  }

  state.recipePlan = plan;
  return {
    text: `${plan.moodReply} Should I add the required items to your cart so you can edit them, or do you already have your own shopping list?`,
    cards: plan.ingredients.slice(0, 6).map((ingredient) => ({
      title: ingredient.name,
      meta: `${ingredient.quantity} ${ingredient.unit}`,
      value: "Recipe ingredient",
    })),
    actions: [
      action("Add all ingredients", "add all", "primary"),
      action("Use my own list", "i have my shopping list"),
    ],
  };
}

function handleRecipePlanStep(rawMessage) {
  const message = normalizeText(rawMessage);

  if (includesAny(message, ["yes", "add all", "add the required items", "add required items", "add all items"])) {
    const items = mapRecipeIngredientsToCatalog(state.recipePlan.ingredients);
    if (!items.length) {
      const title = state.recipePlan.title;
      state.recipePlan = null;
      state.flowState = "collecting request";
      return {
        text: `I could not turn ${title} into a reliable cart yet. Tell me the actual items you want, like '1 kg pork and 2 kg potato', and I will build it from your list instead.`,
      };
    }

    addItems(items, "grocery");
    const title = state.recipePlan.title;
    state.recipePlan = null;
    state.flowState = "cart updated";
    return {
      text: `Done. I added the required ingredients for ${title}. Your current total is Rs. ${state.totals.total}. You can now edit quantities, remove anything, or continue to checkout.`,
      cards: items.map(toCard),
      actions: buildDeliveryActions(),
    };
  }

  if (includesAny(message, ["custom", "i will tell you", "let me edit", "edit quantity", "edit quantities", "shopping list", "i have my shopping list"])) {
    const title = state.recipePlan.title;
    state.recipePlan = null;
    state.flowState = "collecting request";
    return {
      text: `Perfect. Tell me the items or quantity changes you want for ${title}, and I will build the list your way.`,
      actions: [
        action("Add all ingredients", "add all", "primary"),
        action("Custom list", "i have my shopping list"),
      ],
    };
  }

  return {
    text: `For ${state.recipePlan.title}, you can type 'add all' and I will add the core ingredients, or tell me the custom items you want instead.`,
    actions: [
      action("Add all ingredients", "add all", "primary"),
      action("Custom list", "i have my shopping list"),
    ],
  };
}

function promptForItems(domain, text) {
  state.activeDomain = domain;
  state.flowState = "collecting request";
  return {
    text,
    actions: domain === "grocery"
      ? [action("Milk + bread", "milk, bread"), action("Rice + oil", "1 kg rice, 1 litre oil", "primary")]
      : domain === "food"
        ? [action("Burger + fries", "burger, fries", "primary"), action("Biryani", "biryani")]
        : [action("Apples", "apples"), action("Bananas", "bananas"), action("Fruit basket", "fruit basket", "primary")],
  };
}

// Catalog flows share the same parsing path for grocery, food, and fruits.
function handleCatalogFlow(domain, rawMessage) {
  const { items, unmatched } = searchCatalog(domain, rawMessage);
  state.activeDomain = domain;

  if (!items.length) {
    state.flowState = "waiting for item details";
    if (unmatched.length && shouldUseAbsurdCatalogFallback(unmatched[0])) {
      return {
        text: `${buildAbsurdCatalogFallback(unmatched[0])} Tell me something real and I will add it fast.`,
      };
    }

    if (personalityFlags.wittyUnavailableFallback && unmatched.length === 1) {
      return {
        text: `${buildUnavailablePersonalityReply(unmatched[0])} Tell me the replacement and I will handle it.`,
      };
    }

    return { text: buildMissingItemMessage(domain, unmatched) };
  }

  addItems(items, domain);
  state.flowState = "cart updated";

  const missedCopy = unmatched.length
    ? ` I could not clearly match ${unmatched.join(", ")} yet, so tell me those items again if you still want them.`
    : "";

  return {
    text: `Done. I added ${formatItems(items)}.${missedCopy} Your current total is Rs. ${state.totals.total}. Do you want to add anything else or continue to checkout?`,
    cards: items.map(toCard),
    actions: buildDeliveryActions(),
  };
}

function handleMixedCatalogFlow(rawMessage) {
  const segments = splitCatalogSegments(rawMessage);
  if (segments.length < 2) return null;

  const groupedRequests = segments.reduce((groups, segment) => {
    const domain = inferCatalogDomainByCatalog(segment) || inferCatalogDomain(segment);
    if (!domain || domain === "ride") return groups;
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(segment);
    return groups;
  }, {});

  const domains = Object.keys(groupedRequests);
  if (domains.length < 2) return null;

  const allItems = [];
  const unmatchedByDomain = [];

  domains.forEach((domain) => {
    const { items, unmatched } = searchCatalog(domain, groupedRequests[domain].join(", "));
    if (items.length) {
      addItems(items, domain);
      allItems.push(...items);
    }
    if (unmatched.length) {
      unmatchedByDomain.push(`${titleCase(domain)}: ${unmatched.join(", ")}`);
    }
  });

  if (!allItems.length) return null;

  state.activeDomain = "multi-service";
  state.flowState = "cart updated";
  const serviceLabel = domains.map((domain) => titleCase(domain)).join(" + ");
  const unmatchedCopy = unmatchedByDomain.length
    ? ` I still need help with these bits: ${unmatchedByDomain.join(" | ")}.`
    : "";

  return {
    text: `Done. I split that into ${serviceLabel} requests and added ${formatItems(allItems)}.${unmatchedCopy} Your combined total is Rs. ${state.totals.total}. You can keep adding items or continue to checkout.`,
    cards: allItems.map(toCard),
    actions: buildDeliveryActions(),
  };
}

function beginRideFlow() {
  state.activeDomain = "ride";
  state.flowState = "collecting destination";
  state.ride = { ...createInitialRideState(), step: "destination" };

  return {
    text: "Sure. Where do you want to go? Type the destination name, for example Bhubaneswar, Cuttack, or Puri.",
    actions: [
      action("Bhubaneswar", "bhubaneswar", "primary"),
      action("Cuttack", "cuttack"),
      action("Puri", "puri"),
    ],
  };
}

// Rental rides have their own booking state machine and do not share checkout logic.
function handleRideStep(rawMessage) {
  const message = rawMessage.trim();
  const lower = normalizeText(rawMessage);

  if (state.ride.step === "destination") {
    const matchedCity = findSupportedRideLocation(lower);
    const vehicleMode = inferRideMode(lower);
    const occupancy = inferRideOccupancy(lower, vehicleMode || state.ride.vehicleMode);
    const requestedDestination = extractRideDestinationRequest(lower);

    if (vehicleMode) {
      state.ride.vehicleMode = vehicleMode;
    }

    if (occupancy && (vehicleMode || state.ride.vehicleMode)) {
      state.ride.occupancy = occupancy;
    }

    if (matchedCity) {
      state.ride.destination = titleCase(matchedCity);
      state.ride.available = true;
      state.ride.agencyName = getRideAgencyName(matchedCity);
    } else if (requestedDestination) {
      state.ride.destination = titleCase(requestedDestination);
      state.ride.available = false;
    } else {
      state.ride.destination = "";
      state.ride.available = null;
    }

    if (state.ride.available === false) {
      state.flowState = "location unavailable";
      state.ride.step = "destination";
      return {
        text: `Sorry, rental rides are not available for ${state.ride.destination} right now. Our Odisha rental service is currently available in ${formatAvailabilityList(supportedRideLocations)}. You can pick one of those cities to continue.`,
        actions: [
          action("Bhubaneswar", "bhubaneswar", "primary"),
          action("Cuttack", "cuttack"),
          action("Puri", "puri"),
        ],
      };
    }

    if (!state.ride.destination) {
      state.flowState = "collecting destination";
      state.ride.step = "destination";
      const modeCopy = state.ride.vehicleMode ? ` I already noted ${titleCase(state.ride.vehicleMode)}${state.ride.occupancy ? `, ${titleCase(state.ride.occupancy)}` : ""}.` : "";
      return {
        text: `Tell me the destination city to continue with your rental ride.${modeCopy}`,
        actions: [
          action("Bhubaneswar", "bhubaneswar", "primary"),
          action("Cuttack", "cuttack"),
          action("Puri", "puri"),
        ],
      };
    }

    const localAreas = odishaRideAreas[matchedCity] || [];
    if (!state.ride.vehicleMode) {
      state.flowState = "options ready";
      state.ride.step = "mode";
      return {
        text: `Rental rides are available for ${state.ride.destination}. Your travel partner here is ${state.ride.agencyName}. Popular pickup areas include ${formatAvailabilityList(localAreas)}. How would you like to go: Car, Bike, or Cab?`,
        cards: [
          { title: "Car", meta: "Comfort commute", value: "Reserved or shared" },
          { title: "Bike", meta: "Fastest short commute", value: "Reserved only" },
          { title: "Cab", meta: "Standard city taxi", value: "Reserved or shared" },
        ],
        actions: buildRideModeActions(),
      };
    }

    if (!state.ride.occupancy) {
      if (state.ride.vehicleMode === "bike") {
        state.ride.occupancy = "reserved";
      } else {
        state.ride.step = "occupancy";
        state.flowState = "collecting occupancy";
        return {
          text: `${titleCase(state.ride.vehicleMode)} is selected for ${state.ride.destination}. Do you want a shared or reserved ride?`,
          actions: buildRideOccupancyActions(state.ride.vehicleMode),
        };
      }
    }

    state.ride.step = "pickup";
    state.flowState = "collecting pickup location";
    return {
      text: `Great, ${titleCase(state.ride.occupancy)} ${titleCase(state.ride.vehicleMode)} is ready for ${state.ride.destination}. What is the pickup location?`,
    };
  }

  if (state.ride.step === "mode") {
    const vehicleMode = inferRideMode(lower);
    if (!vehicleMode) {
      return {
        text: "Please choose how you want to travel: Car, Bike, or Cab.",
        actions: buildRideModeActions(),
      };
    }

    state.ride.vehicleMode = vehicleMode;
    const occupancy = inferRideOccupancy(lower, vehicleMode);

    if (occupancy) {
      state.ride.occupancy = occupancy;
      state.ride.step = "pickup";
      state.flowState = "collecting pickup location";
      return { text: `Great, ${titleCase(occupancy)} ${titleCase(vehicleMode)} is selected. What is the pickup location?` };
    }

    if (vehicleMode === "bike") {
      state.ride.occupancy = "reserved";
      state.ride.step = "pickup";
      state.flowState = "collecting pickup location";
      return { text: "Bike is selected as a reserved ride. What is the pickup location?" };
    }

    state.ride.step = "occupancy";
    state.flowState = "collecting occupancy";
    return {
      text: `Great, ${titleCase(vehicleMode)} is selected. Do you want a shared or reserved ride?`,
      actions: buildRideOccupancyActions(vehicleMode),
    };
  }

  if (state.ride.step === "occupancy") {
    const occupancy = inferRideOccupancy(lower, state.ride.vehicleMode);
    if (!occupancy) {
      return {
        text: state.ride.vehicleMode === "bike"
          ? "Bike rides are reserved only right now. Type 'reserved' to continue."
          : "Please choose whether you want a shared or reserved ride.",
        actions: buildRideOccupancyActions(state.ride.vehicleMode),
      };
    }

    state.ride.occupancy = occupancy;
    state.ride.step = "pickup";
    state.flowState = "collecting pickup location";
    return { text: `Got it. ${titleCase(occupancy)} ${titleCase(state.ride.vehicleMode)} selected. What is the pickup location?` };
  }

  if (state.ride.step === "pickup") {
    state.ride.pickupLocation = message;
    state.ride.step = "time";
    state.flowState = "collecting pickup time";
    return {
      text: "Got it. What time do you want the pickup? You can type something like 'now', 'in 30 min', or 'tomorrow 9 AM'.",
      actions: buildRideTimeActions(),
    };
  }

  if (state.ride.step === "time") {
    state.ride.pickupTime = message;
    state.ride.step = "confirm";
    state.flowState = "awaiting ride confirmation";
    return buildRideCheckoutResponse();
  }

  if (state.ride.step === "confirm") {
    if (lower.includes("change time")) {
      state.ride.step = "time";
      state.flowState = "collecting pickup time";
      return {
        text: "No problem. Tell me the new pickup time.",
        actions: buildRideTimeActions(),
      };
    }

    if (!lower.includes("confirm")) {
      return buildRideCheckoutResponse();
    }

    state.ride.contactName = "Rohan Driver";
    state.ride.contactPhone = "+91 98765 43210";
    state.ride.step = null;
    state.flowState = "ride booked";
    archiveRideBooking();

    return {
      text: "All done. Your rental ride is booked and confirmed.",
      summaries: [
        ["Agency", state.ride.agencyName],
        ["Driver", state.ride.contactName],
        ["Contact", state.ride.contactPhone],
        ["Vehicle", `${titleCase(state.ride.vehicleMode)} / ${titleCase(state.ride.occupancy)}`],
        ["Pickup time", state.ride.pickupTime],
      ],
      actions: [
        action("New chat", "new chat"),
        action("Book another ride", "book a ride"),
      ],
    };
  }

  return {
    text: "I am ready to help with your ride booking. Where do you want to go?",
    actions: [
      action("Bhubaneswar", "bhubaneswar", "primary"),
      action("Cuttack", "cuttack"),
      action("Puri", "puri"),
    ],
  };
}

function handlePaymentConfirmation() {
  if (!state.cart.length) {
    return { text: "There is nothing to pay for yet. Add items first, then I will prepare checkout." };
  }

  state.flowState = "order confirmed";
  state.paymentStatus = state.paymentChoice === "cod" ? "pay on delivery" : "verified";
  archiveCurrentOrder();

  return {
    text: state.paymentChoice === "cod"
      ? `Order confirmed with cash on delivery. Your ${state.activeDomain} request is placed for ${state.address}. Everything is set from my side.`
      : `Payment verified and order confirmed. Your ${state.activeDomain} request is placed for ${state.address}. Everything is set from my side.`,
    summaries: [
      ["Payment", state.paymentChoice === "cod" ? "Cash on delivery" : "Verified"],
      ["Order status", "Confirmed"],
      ["Delivery ETA", state.activeDomain === "food" ? "28 min" : "35 min"],
    ],
    actions: [
      action("New chat", "new chat", "primary"),
      action("Add more later", "add more"),
    ],
  };
}

// Delivery checkout owns payment mode; rides intentionally bypass this path.
function handlePaymentChoice(choice) {
  if (!state.cart.length) {
    return { text: "There is no active order yet. Add items first and then choose the payment mode." };
  }

  state.paymentChoice = choice;
  state.paymentStatus = choice === "cod" ? "cash on delivery selected" : "payment initiated";
  state.flowState = "payment mode selected";

  if (choice === "cod") {
    return {
      text: "Cash on delivery is selected. Tap confirm to place the order, or switch to pay now if you prefer online payment.",
      summaries: [
        ["Payment mode", "Cash on delivery"],
        ["Payable", `Rs. ${state.totals.total}`],
      ],
      actions: [
        action("Confirm order", "confirm payment", "primary"),
        action("Pay now instead", "pay now"),
      ],
    };
  }

  return {
    text: "Pay now is selected. Tap confirm payment to continue, or switch to cash on delivery if you prefer.",
    summaries: [
      ["Payment mode", "Pay now"],
      ["Payable", `Rs. ${state.totals.total}`],
    ],
    actions: [
      action("Confirm payment", "confirm payment", "primary"),
      action("Switch to COD", "cod"),
    ],
  };
}

function buildCheckoutResponse() {
  if (!state.cart.length) return { text: "Your order sheet is empty right now. Tell me what you want first." };

  state.flowState = "checkout ready";
  state.paymentChoice = "";
  state.paymentStatus = "awaiting payment mode";
  const breakdown = getServiceBreakdown();
  const serviceLines = Object.entries(breakdown)
    .map(([domain, info]) => `${titleCase(domain)} Rs. ${info.total}`)
    .join(" | ");

  return {
    text: `Delivery checkout is ready. Your order will go to ${state.address}. ${serviceLines ? `Current split: ${serviceLines}. ` : ""}Choose a payment mode to continue.`,
    summaries: [
      ["Address", state.address],
      ["Subtotal", `Rs. ${state.totals.subtotal}`],
      ["Delivery fee", `Rs. ${state.totals.delivery}`],
      ["Tax", `Rs. ${state.totals.tax}`],
      ["Payable", `Rs. ${state.totals.total}`],
    ],
    actions: [
      action("Cash on delivery", "cod"),
      action("Pay now", "pay now", "primary"),
      action("Add more items", "add more"),
    ],
  };
}

function searchCatalog(domain, rawMessage) {
  const message = normalizeText(rawMessage);

  if (domain === "fruits" && message.includes("500")) {
    return {
      items: [{ ...db.fruits.find((item) => item.id === "fr4"), quantity: 1, lineTotal: 499 }],
      unmatched: [],
    };
  }

  const segments = message
    .split(/\s*(?:,| and | plus )\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const items = [];
  const unmatched = [];

  segments.forEach((segment) => {
    const matchedItem = findCatalogItem(domain, segment);
    if (!matchedItem) {
      unmatched.push(segment);
      return;
    }

    const quantity = inferQuantity(segment, matchedItem);
    const existing = items.find((item) => item.id === matchedItem.id);
    if (existing) {
      existing.quantity += quantity;
      existing.lineTotal = existing.quantity * existing.price;
      return;
    }

    items.push({
      ...matchedItem,
      quantity,
      lineTotal: matchedItem.price * quantity,
    });
  });

  return { items, unmatched };
}

function inferCatalogDomain(message) {
  const normalized = normalizeText(message);

  if (includesAny(normalized, ["apple", "banana", "orange", "basket"])) return "fruits";

  if (hasFoodServiceCue(normalized) && isLikelyCookedDish(normalized)) return "food";
  if (hasFoodServiceCue(normalized) && includesAny(normalized, ["coke", "cola", "chips", "pizza", "burger", "fries", "wrap"])) return "food";

  if (isLikelyRawIngredientRequest(normalized)) return "grocery";

  if (includesAny(normalized, ["milk", "bread", "egg", "chicken", "rice", "potato", "oil", "maida", "onion", "tomato", "curd", "detergent", "biscuit", "biscuits", "parle g", "mutton", "pork", "lamb", "honey", "jar"])) {
    return "grocery";
  }

  if (isLikelyCookedDish(normalized) || includesAny(normalized, ["burger", "fries", "biryani", "wrap", "pizza", "coke", "cola", "chips"])) {
    return "food";
  }

  return null;
}

function inferCatalogDomainByCatalog(rawMessage) {
  const candidates = ["grocery", "food", "fruits"]
    .map((domain) => inspectCatalogDomain(domain, rawMessage))
    .filter((candidate) => candidate.itemCount > 0);

  if (!candidates.length) return null;

  candidates.sort((left, right) =>
    right.exactHits - left.exactHits
    || right.itemCount - left.itemCount
    || left.unmatchedCount - right.unmatchedCount
  );

  return candidates[0].domain;
}

function inspectCatalogDomain(domain, rawMessage) {
  const segments = splitCatalogSegments(rawMessage);
  const exactHits = segments.reduce((count, segment) => {
    const hasExactHit = db[domain].some((item) => item.aliases.some((alias) => segment.includes(alias)));
    return count + (hasExactHit ? 1 : 0);
  }, 0);
  const result = searchCatalog(domain, rawMessage);

  return {
    domain,
    exactHits,
    itemCount: result.items.length,
    unmatchedCount: result.unmatched.length,
  };
}

function splitCatalogSegments(rawMessage) {
  return normalizeText(rawMessage)
    .split(/\s*(?:,| and | plus )\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getServiceBreakdown(items = state.cart) {
  const breakdown = items.reduce((groups, item) => {
    const key = item.domain || "other";
    if (!groups[key]) {
      groups[key] = { subtotal: 0, delivery: 0, tax: 0, total: 0, itemCount: 0 };
    }
    groups[key].subtotal += item.lineTotal;
    groups[key].itemCount += 1;
    return groups;
  }, {});

  if (breakdown.food) {
    breakdown.food.delivery = 45;
  }

  if (breakdown.grocery || breakdown.fruits) {
    if (breakdown.grocery) breakdown.grocery.delivery += 35;
    else breakdown.fruits.delivery += 35;
  }

  Object.values(breakdown).forEach((entry) => {
    entry.tax = Math.round(entry.subtotal * 0.05);
    entry.total = entry.subtotal + entry.delivery + entry.tax;
  });

  return breakdown;
}

function addItems(items, domain) {
  items.forEach((incoming) => {
    const existing = state.cart.find((item) => item.id === incoming.id);
    if (existing) {
      existing.quantity += incoming.quantity;
      existing.lineTotal = existing.quantity * existing.price;
    } else {
      state.cart.push({ ...incoming, domain });
    }
  });

  if (state.address === "Not set") state.address = "Home address";
  recalcTotals();
}

function removeCartItem(rawMessage) {
  const message = normalizeText(rawMessage);
  const item = state.cart.find((entry) =>
    entry.aliases?.some((alias) => message.includes(alias)) || message.includes(entry.name.toLowerCase())
  );

  if (!item) return null;
  state.cart = state.cart.filter((entry) => entry.id !== item.id);
  recalcTotals();
  return item;
}

// Cart math is isolated so every caller gets one consistent total calculation.
function recalcTotals() {
  state.totals.subtotal = state.cart.reduce((sum, item) => sum + item.lineTotal, 0);
  const breakdown = getServiceBreakdown();
  state.totals.delivery = Object.values(breakdown).reduce((sum, entry) => sum + entry.delivery, 0);
  state.totals.tax = Math.round(state.totals.subtotal * 0.05);
  state.totals.total = state.totals.subtotal + state.totals.delivery + state.totals.tax;
}

function resetSession() {
  clearTrackingTimers();
  resetStateOnly();
  setDrawerOpen("");
  setMenuView(state.menuView);
  clearConversation();
  welcome();
  renderSummary(state);
}

function toggleDrawer(name) {
  const isOpen = document.body.classList.contains(`${name}-open`);
  setDrawerOpen(isOpen ? "" : name);
}

function onKeydown(event) {
  if (event.key === "Escape") {
    setDrawerOpen("");
  }
}

function onChatActionClick(event) {
  const button = event.target.closest(".message-action");
  if (!button?.dataset.payload) return;
  event.preventDefault();
  handleUserMessage(button.dataset.payload);
}

function onHistoryClick(event) {
  const toggle = event.target.closest(".history-card-toggle");
  if (!toggle?.dataset.orderId) return;

  const { orderId } = toggle.dataset;
  state.selectedHistoryOrderId = state.selectedHistoryOrderId === orderId ? null : orderId;
  renderSummary(state);
}

function onCartClick(event) {
  const button = event.target.closest(".item-action");
  if (!button) return;

  const { action, id } = button.dataset;
  if (!id) return;

  if (action === "delete") {
    updateCartItem(id, 0, true);
    return;
  }

  const item = state.cart.find((entry) => entry.id === id);
  if (!item) return;
  const delta = action === "increase" ? getQuantityStep(item.unit) : -getQuantityStep(item.unit);
  updateCartItem(id, Number((item.quantity + delta).toFixed(2)));
}

function onCartInputChange(event) {
  const input = event.target.closest(".item-qty-input");
  if (!input) return;

  const { id } = input.dataset;
  updateCartItem(id, Number(input.value));
}

function updateCartItem(id, quantity, remove = false) {
  const item = state.cart.find((entry) => entry.id === id);
  if (!item) return;

  if (remove || quantity <= 0) {
    state.cart = state.cart.filter((entry) => entry.id !== id);
  } else {
    item.quantity = quantity;
    item.lineTotal = Number((item.price * quantity).toFixed(2));
  }

  recalcTotals();
  if (!state.cart.length && state.activeDomain !== "ride") {
    state.activeDomain = "general";
    state.flowState = "ready";
    state.paymentChoice = "";
    state.paymentStatus = "not started";
    state.address = "Not set";
  }

  renderSummary(state);
}

function setMenuSection(view) {
  state.menuView = view;
  setMenuView(view);
  renderSummary(state);
}

function syncScrollState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 20);
}

function initVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    el.voiceTrigger?.setAttribute("aria-disabled", "true");
    el.voiceTrigger?.classList.add("is-disabled");
    return;
  }

  speechRecognition = new Recognition();
  speechRecognition.lang = "en-IN";
  speechRecognition.interimResults = false;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.addEventListener("start", () => {
    document.body.classList.add("voice-listening");
  });

  speechRecognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
    if (!transcript) return;
    el.userInput.value = [el.userInput.value, transcript].filter(Boolean).join(" ").trim();
    el.userInput.focus();
  });

  const stopListening = () => {
    document.body.classList.remove("voice-listening");
  };

  speechRecognition.addEventListener("end", stopListening);
  speechRecognition.addEventListener("error", stopListening);
}

function onVoiceTrigger() {
  if (!speechRecognition) {
    appendMessage("assistant", {
      text: "Voice input is not available in this browser right now. You can still type your request and I will help from there.",
    });
    return;
  }

  if (document.body.classList.contains("voice-listening")) {
    speechRecognition.stop();
  } else {
    speechRecognition.start();
  }
}

function onMenuImageSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setDrawerOpen("");
  appendMessage("assistant", {
    text: `I received ${file.name}. Tell me which item or dish you want from the menu image and I will help you add it manually.`,
  });
  el.imageInput.value = "";
}

// These helpers keep routing and fuzzy matching close to the main chat logic.
function getContextualDomain() {
  if (["grocery", "food", "fruits"].includes(state.activeDomain)) {
    if (includesAny(state.flowState, ["collecting request", "cart updated", "waiting for item details"])) {
      return state.activeDomain;
    }
  }
  return null;
}

function maybeStartRideFlow(rawMessage) {
  const message = normalizeText(rawMessage);
  const hasIntent = hasRideIntent(message) || Boolean(findSupportedRideLocation(message));
  if (!hasIntent) return null;

  const destination = findSupportedRideLocation(message);
  const vehicleMode = inferRideMode(message);
  const requestedDestination = extractRideDestinationRequest(message);

  if (!destination && !vehicleMode && !requestedDestination) {
    return beginRideFlow();
  }

  state.activeDomain = "ride";
  state.flowState = "collecting destination";
  state.ride = { ...createInitialRideState(), step: "destination" };
  return handleRideStep(rawMessage);
}

function hasRideIntent(text) {
  return /\b(rental ride|book a ride|ride|cab|taxi|bike|car)\b/.test(text);
}

function extractRideDestinationRequest(text) {
  return text
    .replace(/\b(i|need|want|book|a|an|for|please|ride|rental|cab|taxi|car|bike|shared|reserved|to|from|go|going|trip)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRideCheckoutResponse() {
  const missingStep = getMissingRideStep();
  if (missingStep) {
    if (missingStep === "destination") return beginRideFlow();
    if (missingStep === "mode") {
      state.ride.step = "mode";
      return {
        text: "Choose the vehicle for your rental ride first.",
        actions: buildRideModeActions(),
      };
    }
    if (missingStep === "occupancy") {
      state.ride.step = "occupancy";
      return {
        text: "Choose whether you want a shared or reserved ride first.",
        actions: buildRideOccupancyActions(state.ride.vehicleMode),
      };
    }
    if (missingStep === "pickup") {
      state.ride.step = "pickup";
      return { text: "Tell me the pickup location first." };
    }
    if (missingStep === "time") {
      state.ride.step = "time";
      return {
        text: "Tell me the pickup time first.",
        actions: buildRideTimeActions(),
      };
    }
  }

  const pricing = estimateRidePricing(state.ride);
  state.ride.step = "confirm";
  state.flowState = "awaiting ride confirmation";

  return {
    text: `Your rental booking is ready. Review the fare and confirm when you are ready.`,
    summaries: [
      ["Agency", state.ride.agencyName],
      ["Vehicle", titleCase(state.ride.vehicleMode)],
      ["Type", titleCase(state.ride.occupancy)],
      ["Destination", state.ride.destination],
      ["Pickup", state.ride.pickupLocation],
      ["Time", state.ride.pickupTime],
      ["Fare", `Rs. ${pricing.subtotal}`],
      ["Delivery fee", "Not applicable"],
      ["Tax", `Rs. ${pricing.tax}`],
      ["Payable", `Rs. ${pricing.total}`],
    ],
    actions: buildRideConfirmActions(),
  };
}

function getMissingRideStep() {
  if (!state.ride.destination) return "destination";
  if (!state.ride.vehicleMode) return "mode";
  if (!state.ride.occupancy) return "occupancy";
  if (!state.ride.pickupLocation) return "pickup";
  if (!state.ride.pickupTime) return "time";
  return null;
}

function findCatalogItem(domain, segment) {
  const exact = db[domain].find((item) => item.aliases.some((alias) => segment.includes(alias)));
  if (exact) return exact;

  const words = segment.split(/\s+/);
  for (const item of db[domain]) {
    for (const alias of item.aliases) {
      if (words.some((word) => similarity(word, alias.split(" ")[0]) >= 0.75)) {
        return item;
      }
    }
  }

  return null;
}

function findSupportedRideLocation(text) {
  const exact = supportedRideLocations.find((location) => text.includes(location));
  if (exact) return exact;

  const words = text.split(/\s+/);
  return supportedRideLocations.find((location) =>
    words.some((word) => similarity(word, location.split(" ")[0]) >= 0.72)
  ) || null;
}

function inferRideMode(text) {
  if (/\bcar\b/.test(text)) return "car";
  if (/\bbike\b/.test(text)) return "bike";
  if (/\b(cab|taxi)\b/.test(text)) return "cab";
  return null;
}

function inferRideOccupancy(text, mode) {
  if (mode === "bike") return "reserved";
  if (/\b(shared|share)\b/.test(text)) return "shared";
  if (/\b(reserved|private)\b/.test(text)) return "reserved";
  return null;
}

function getRideAgencyName(city) {
  const agencies = {
    bhubaneswar: "Kalinga Travel Hub",
    cuttack: "Silver City Mobility",
    puri: "Jagannath Coastal Rides",
    sambalpur: "Western Odisha Transit",
    berhampur: "Ganjam Ride Connect",
    rourkela: "Steel City Travel Desk",
  };
  return agencies[city] || "eBee Travel Partner";
}

function inferCookingIntent(message) {
  const normalized = normalizeText(message);
  const patterns = [
    /mood to cook\s+(.+)/,
    /planning to cook\s+(.+)/,
    /want to cook\s+(.+)/,
    /gonna cook\s+(.+)/,
    /going to cook\s+(.+)/,
    /cook\s+(.+)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const meal = cleanMealName(match[1]);
    if (meal) return meal;
  }

  return null;
}

function mapRecipeIngredientsToCatalog(ingredients) {
  return ingredients
    .map((ingredient) => {
      const matched = findCatalogItem("grocery", normalizeText(ingredient.name));
      if (!matched) return null;
      return {
        ...matched,
        quantity: ingredient.quantity,
        lineTotal: matched.price * ingredient.quantity,
      };
    })
    .filter(Boolean);
}

function wantsToCookButMealMissing(message) {
  return includesAny(message, ["cook today", "wanna cook", "want to cook", "mood to cook", "planning to cook"])
    && !inferCookingIntent(message);
}

function archiveCurrentOrder() {
  if (!state.cart.length) return;

  const createdAt = new Date();
  const orderId = `order-${Date.now()}`;
  const serviceDomains = [...new Set(state.cart.map((item) => item.domain).filter(Boolean))];
  state.orderHistory.unshift({
    id: orderId,
    domain: serviceDomains.length > 1 ? "Multi-Service" : titleCase(state.activeDomain),
    serviceDomains,
    items: state.cart.map((item) => ({ ...item })),
    breakdown: getServiceBreakdown(state.cart),
    total: state.totals.total,
    dateLabel: formatOrderDate(createdAt),
    status: DELIVERY_TRACKING_STAGES[0].status,
    payment: state.paymentChoice === "cod" ? "Cash on delivery" : "Pay now",
    address: state.address,
    deliveryDetails: {
      address: state.address,
      payment: state.paymentChoice === "cod" ? "Cash on delivery" : "Pay now",
      eta: state.activeDomain === "food" ? "28 min" : "35 min",
      category: serviceDomains.map((domain) => titleCase(domain)).join(" + "),
    },
  });

  state.cart = [];
  state.totals = createInitialTotals();
  state.selectedHistoryOrderId = state.orderHistory[0].id;
  state.menuView = "history";
  startTracking(orderId, "delivery");
}

function archiveRideBooking() {
  if (!state.ride.destination) return;

  const createdAt = new Date();
  const ridePricing = estimateRidePricing(state.ride);
  const orderId = `rental-${Date.now()}`;

  state.orderHistory.unshift({
    id: orderId,
    domain: "Rental",
    serviceDomains: ["ride"],
    items: [
      {
        id: "ride-booking",
        domain: "ride",
        name: `${titleCase(state.ride.vehicleMode || "Ride")} to ${state.ride.destination}`,
        unit: "trip",
        quantity: 1,
        price: ridePricing.subtotal,
        lineTotal: ridePricing.total,
      },
    ],
    breakdown: {
      ride: {
        subtotal: ridePricing.subtotal,
        delivery: 0,
        tax: ridePricing.tax,
        total: ridePricing.total,
        itemCount: 1,
      },
    },
    total: ridePricing.total,
    dateLabel: formatOrderDate(createdAt),
    status: RIDE_TRACKING_STAGES[0].status,
    payment: "Verified",
    address: state.ride.pickupLocation || state.ride.destination,
    deliveryDetails: {
      destination: state.ride.destination,
      pickup: state.ride.pickupLocation || "-",
      agency: state.ride.agencyName || "-",
      driver: state.ride.contactName || "-",
      phone: state.ride.contactPhone || "-",
    },
  });

  state.selectedHistoryOrderId = state.orderHistory[0].id;
  state.menuView = "history";
  startTracking(orderId, "rental");
}

function startTracking(orderId, kind) {
  const stages = kind === "rental" ? RIDE_TRACKING_STAGES : DELIVERY_TRACKING_STAGES;
  clearTrackingTimers();
  applyTrackingStage(orderId, kind, stages[0]);

  stages.slice(1).forEach((stage, index) => {
    const timeoutId = window.setTimeout(() => {
      if (state.activeTracking?.orderId !== orderId) return;
      applyTrackingStage(orderId, kind, stage);
      renderSummary(state);
    }, (index + 1) * 2600);
    trackingTimeouts.push(timeoutId);
  });
}

function applyTrackingStage(orderId, kind, stage) {
  state.activeTracking = {
    orderId,
    kind,
    status: stage.status,
    copy: stage.copy,
    percent: stage.percent,
  };

  const order = state.orderHistory.find((entry) => entry.id === orderId);
  if (order) {
    order.status = stage.status;
  }

  if (kind === "rental" && stage.status === "Trip completed") {
    state.ride = createInitialRideState();
  }
}

function clearTrackingTimers() {
  trackingTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  trackingTimeouts = [];
}

function formatOrderDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resetStateOnly() {
  resetSessionState();
}
