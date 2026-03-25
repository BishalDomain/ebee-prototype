import { db, localRecipePlans, odishaRideAreas, supportedRideLocations } from "./data.js";
import { fetchRecipePlan, maybePolishResponse } from "./services.js";
import { createInitialRideState, createInitialTotals, resetSessionState, state } from "./state.js";
import { appendMessage, clearConversation, el, removeTyping, renderSuggestions, renderSummary, setAssistantPresence, showTyping } from "./ui.js";
import {
  buildMissingItemMessage,
  buildUnavailablePersonalityReply,
  buildAbsurdCatalogFallback,
  buildPlayfulCookingFallback,
  cleanMealName,
  delay,
  formatAvailabilityList,
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

export function initApp() {
  bindEvents();
  welcome();
  syncScrollState();
  renderSummary(state);
}

// Wire all persistent UI listeners in one place so startup is easy to follow.
function bindEvents() {
  el.chatForm.addEventListener("submit", onSubmit);
  el.resetButton.addEventListener("click", resetSession);
  el.summaryItems.addEventListener("click", onSummaryClick);
  el.summaryItems.addEventListener("change", onSummaryInputChange);
  el.tabActive.addEventListener("click", () => setSummaryView("active"));
  el.tabHistory.addEventListener("click", () => setSummaryView("history"));
  window.addEventListener("scroll", syncScrollState, { passive: true });
}

function welcome() {
  appendMessage("assistant", {
    text: "Hi, Zippy here from eBee. Tell me what you need, and I will help you sort it out step by step. You can ask for groceries, food, fruits, or a rental ride in one simple message.",
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
  const message = rawMessage.toLowerCase().trim();

  if (includesAny(message, ["reset", "new chat", "start over"])) {
    resetStateOnly();
    return { text: "Fresh chat started. What would you like help with?" };
  }

  if (isGreeting(message)) {
    return { text: "Hi, nice to hear from you. How can I help you today?" };
  }

  if (includesAny(message, ["surprise me"])) {
    return {
      text: "Here is a good cooking surprise for today: chicken biryani, veg pulao, or a simple masala meal prep. If you want, say 'I am in the mood to cook biryani' and I will prepare the ingredient set for you.",
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

  if (includesAny(message, ["rental ride", "book a ride", "ride", "cab"])) {
    return beginRideFlow();
  }

  if (shouldTreatAsRideDestination(message)) {
    if (!state.ride.step) {
      state.activeDomain = "ride";
      state.flowState = "collecting destination";
      state.ride.step = "destination";
    }
    return handleRideStep(rawMessage);
  }

  if (includesAny(message, ["checkout", "place order"])) {
    if (state.activeDomain === "ride") {
      return { text: "Rental rides use booking confirmation, not checkout. Tell me the destination and I will guide the booking steps." };
    }
    return buildCheckoutResponse();
  }

  if (includesAny(message, ["cod", "cash on delivery"])) {
    if (state.activeDomain === "ride") {
      return { text: "Payment mode selection applies to delivery orders. Rental rides follow the booking flow instead." };
    }
    return handlePaymentChoice("cod");
  }

  if (includesAny(message, ["confirm payment", "pay now", "yes pay", "pay"])) {
    if (state.activeDomain === "ride") {
      return { text: "Rental rides do not use the delivery payment flow here. Continue with destination, vehicle, pickup, and booking confirmation." };
    }
    if (!state.paymentChoice) return handlePaymentChoice("pay_now");
    return handlePaymentConfirmation();
  }

  if (includesAny(message, ["change address", "office", "home address"])) {
    state.address = message.includes("office") ? "Office Tower, Sector 5" : "Home address";
    state.flowState = "address updated";
    return { text: `Address updated to ${state.address}.` };
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
    return { text: "Sure, tell me the next item you want to add." };
  }

  if (state.cart.length && includesAny(message, ["checkout now", "continue checkout", "go to checkout"])) {
    return buildCheckoutResponse();
  }

  const mixedResult = handleMixedCatalogFlow(rawMessage);
  if (mixedResult) return mixedResult;

  const contextualDomain = getContextualDomain();
  if (contextualDomain) return handleCatalogFlow(contextualDomain, rawMessage);

  const inferredDomain = inferCatalogDomain(message);
  if (inferredDomain) return handleCatalogFlow(inferredDomain, rawMessage);

  return {
    text: "I can help with groceries, food, fruits, or rental rides. Tell me what you want in a sentence, and I will take it from there.",
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
    };
  }

  if (includesAny(message, ["custom", "i will tell you", "let me edit", "edit quantity", "edit quantities", "shopping list", "i have my shopping list"])) {
    const title = state.recipePlan.title;
    state.recipePlan = null;
    state.flowState = "collecting request";
    return { text: `Perfect. Tell me the items or quantity changes you want for ${title}, and I will build the list your way.` };
  }

  return {
    text: `For ${state.recipePlan.title}, you can type 'add all' and I will add the core ingredients, or tell me the custom items you want instead.`,
  };
}

function promptForItems(domain, text) {
  state.activeDomain = domain;
  state.flowState = "collecting request";
  return { text };
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
  };
}

function handleMixedCatalogFlow(rawMessage) {
  const segments = splitCatalogSegments(rawMessage);
  if (segments.length < 2) return null;

  const groupedRequests = segments.reduce((groups, segment) => {
    const domain = inferCatalogDomain(segment);
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
  };
}

function beginRideFlow() {
  state.activeDomain = "ride";
  state.flowState = "collecting destination";
  state.ride = { ...createInitialRideState(), step: "destination" };

  return { text: "Sure. Where do you want to go? Type the destination name, for example Bhubaneswar, Cuttack, or Puri." };
}

// Rental rides have their own booking state machine and do not share checkout logic.
function handleRideStep(rawMessage) {
  const message = rawMessage.trim();
  const lower = message.toLowerCase();

  if (state.ride.step === "destination") {
    const matchedCity = findSupportedRideLocation(lower);
    state.ride.destination = matchedCity ? titleCase(matchedCity) : message;
    state.ride.available = Boolean(matchedCity);

    if (!state.ride.available) {
      state.flowState = "location unavailable";
      state.ride.step = "destination";
      return {
        text: `Sorry, rental rides are not available for ${message} right now. Our Odisha rental service is currently available in ${formatAvailabilityList(supportedRideLocations)}. You can pick one of those cities to continue.`,
      };
    }

    state.flowState = "options ready";
    state.ride.step = "mode";
    state.ride.agencyName = getRideAgencyName(matchedCity);
    const localAreas = odishaRideAreas[matchedCity] || [];
    return {
      text: `Rental rides are available for ${state.ride.destination}. Your travel partner here is ${state.ride.agencyName}. Popular pickup areas include ${formatAvailabilityList(localAreas)}. How would you like to go: Car, Bike, or Cab?`,
      cards: [
        { title: "Car", meta: "Comfort commute", value: "Reserved or shared" },
        { title: "Bike", meta: "Fastest short commute", value: "Reserved only" },
        { title: "Cab", meta: "Standard city taxi", value: "Reserved or shared" },
      ],
    };
  }

  if (state.ride.step === "mode") {
    const vehicleMode = inferRideMode(lower);
    if (!vehicleMode) return { text: "Please type how you want to travel: Car, Bike, or Cab." };

    state.ride.vehicleMode = vehicleMode;
    state.ride.step = "occupancy";
    state.flowState = "collecting occupancy";
    return { text: `Great, ${titleCase(vehicleMode)} is selected. Do you want a shared or reserved ride?` };
  }

  if (state.ride.step === "occupancy") {
    const occupancy = inferRideOccupancy(lower, state.ride.vehicleMode);
    if (!occupancy) {
      return {
        text: state.ride.vehicleMode === "bike"
          ? "Bike rides are reserved only right now. Type 'reserved' to continue."
          : "Please type whether you want a shared or reserved ride.",
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
    return { text: "Got it. What time do you want the pickup? You can type something like 'now', 'in 30 min', or 'tomorrow 9 AM'." };
  }

  if (state.ride.step === "time") {
    state.ride.pickupTime = message;
    state.ride.step = "confirm";
    state.flowState = "awaiting ride confirmation";
    return {
      text: `Please confirm your ride booking: ${titleCase(state.ride.vehicleMode)}, ${titleCase(state.ride.occupancy)}, destination ${state.ride.destination}, pickup ${state.ride.pickupLocation}, time ${state.ride.pickupTime}. Type 'confirm booking' to continue or 'change time' if you want to update it.`,
      summaries: [
        ["Agency", state.ride.agencyName],
        ["Vehicle", titleCase(state.ride.vehicleMode)],
        ["Type", titleCase(state.ride.occupancy)],
        ["Destination", state.ride.destination],
        ["Pickup", state.ride.pickupLocation],
        ["Time", state.ride.pickupTime],
      ],
    };
  }

  if (state.ride.step === "confirm") {
    if (lower.includes("change time")) {
      state.ride.step = "time";
      state.flowState = "collecting pickup time";
      return { text: "No problem. Tell me the new pickup time." };
    }

    if (!lower.includes("confirm")) {
      return { text: "Please type 'confirm booking' to book the ride, or type 'change time' if you want to update the pickup time." };
    }

    state.ride.contactName = "Rohan Driver";
    state.ride.contactPhone = "+91 98765 43210";
    state.ride.step = null;
    state.flowState = "ride booked";

    return {
      text: "All done. Your rental ride is booked and confirmed.",
      summaries: [
        ["Agency", state.ride.agencyName],
        ["Driver", state.ride.contactName],
        ["Contact", state.ride.contactPhone],
        ["Vehicle", `${titleCase(state.ride.vehicleMode)} / ${titleCase(state.ride.occupancy)}`],
        ["Pickup time", state.ride.pickupTime],
      ],
    };
  }

  return { text: "I am ready to help with your ride booking. Where do you want to go?" };
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
      text: "Cash on delivery selected. Type 'confirm payment' to place the order with COD, or type 'pay now' if you want to switch.",
      summaries: [
        ["Payment mode", "Cash on delivery"],
        ["Payable", `Rs. ${state.totals.total}`],
      ],
      actions: [{ label: "Confirm COD", payload: "confirm payment" }],
    };
  }

  return {
    text: "Pay now selected. Type 'confirm payment' to simulate payment verification and place the order, or type 'cod' to switch to cash on delivery.",
    summaries: [
      ["Payment mode", "Pay now"],
      ["Payable", `Rs. ${state.totals.total}`],
    ],
    actions: [{ label: "Pay now", payload: "confirm payment" }],
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
    text: `Checkout is ready. Your order will go to ${state.address}. ${serviceLines ? `Current split: ${serviceLines}. ` : ""}Choose a payment mode: type 'cod' for cash on delivery or 'pay now' to continue with online payment.`,
    summaries: [
      ["Address", state.address],
      ["Subtotal", `Rs. ${state.totals.subtotal}`],
      ["Delivery", `Rs. ${state.totals.delivery}`],
      ["Tax", `Rs. ${state.totals.tax}`],
      ["Payable", `Rs. ${state.totals.total}`],
    ],
    actions: [
      { label: "COD", payload: "cod" },
      { label: "Pay now", payload: "pay now" },
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
  resetStateOnly();
  clearConversation();
  welcome();
  renderSummary(state);
}

function resetStateOnly() {
  resetSessionState();
}

// The summary panel is editable, so quantity controls round-trip through state here.
function onSummaryClick(event) {
  const historyCard = event.target.closest(".history-card");
  if (historyCard?.dataset.orderId) {
    state.selectedHistoryOrderId = historyCard.dataset.orderId;
    renderSummary(state);
    return;
  }

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

function onSummaryInputChange(event) {
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

function setSummaryView(view) {
  state.summaryView = view;
  renderSummary(state);
}

function syncScrollState() {
  document.body.classList.toggle("is-scrolled", window.scrollY > 20);
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

function shouldTreatAsRideDestination(message) {
  if (state.activeDomain === "ride" && includesAny(state.flowState, ["collecting destination", "location unavailable"])) {
    return true;
  }

  return Boolean(findSupportedRideLocation(message));
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
  if (includesAny(text, ["car"])) return "car";
  if (includesAny(text, ["bike"])) return "bike";
  if (includesAny(text, ["cab", "taxi"])) return "cab";
  return null;
}

function inferRideOccupancy(text, mode) {
  if (mode === "bike") return "reserved";
  if (includesAny(text, ["shared", "share"])) return "shared";
  if (includesAny(text, ["reserved", "private"])) return "reserved";
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
    /make\s+(.+)/,
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

  const serviceDomains = [...new Set(state.cart.map((item) => item.domain).filter(Boolean))];
  state.orderHistory.unshift({
    id: `order-${Date.now()}`,
    domain: serviceDomains.length > 1 ? "Multi-Service" : titleCase(state.activeDomain),
    serviceDomains,
    items: state.cart.map((item) => ({ ...item })),
    breakdown: getServiceBreakdown(state.cart),
    total: state.totals.total,
    payment: state.paymentChoice === "cod" ? "Cash on delivery" : "Pay now",
    address: state.address,
  });

  state.cart = [];
  state.totals = createInitialTotals();
  state.selectedHistoryOrderId = state.orderHistory[0].id;
  state.summaryView = "history";
}
