import { titleCase } from "./utils.js";

const assistantAvatarMarkup = `<img src="./mascot.png" alt="Zippy, eBee mascot">`;

export const el = {
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  userInput: document.getElementById("user-input"),
  suggestions: document.getElementById("suggestions"),
  assistantStatus: document.getElementById("assistant-status"),
  summaryDomain: document.getElementById("summary-domain"),
  summaryFlow: document.getElementById("summary-flow"),
  summaryItems: document.getElementById("summary-items"),
  tabActive: document.getElementById("tab-active"),
  tabHistory: document.getElementById("tab-history"),
  secondaryMicrocopy: document.getElementById("secondary-microcopy"),
  secondaryTitle: document.getElementById("secondary-title"),
  checkoutPanel: document.getElementById("checkout-panel"),
  resetButton: document.getElementById("reset-session"),
};

export function appendMessage(role, payload) {
  const wrap = document.createElement("article");
  wrap.className = `message-wrap ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  if (role === "assistant") {
    avatar.innerHTML = assistantAvatarMarkup;
  } else {
    avatar.textContent = "You";
  }

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;

  const meta = document.createElement("p");
  meta.className = "message-meta";
  meta.textContent = role === "assistant" ? "eBee" : "You";
  bubble.appendChild(meta);

  const body = document.createElement("p");
  body.textContent = payload.text;
  bubble.appendChild(body);

  if (payload.cards?.length) {
    const grid = document.createElement("div");
    grid.className = "message-grid";
    payload.cards.forEach((card) => {
      const node = document.createElement("div");
      node.className = "info-card";
      node.innerHTML = `<strong>${card.title}</strong><span>${card.meta}</span><strong>${card.value}</strong>`;
      grid.appendChild(node);
    });
    bubble.appendChild(grid);
  }

  if (payload.summaries?.length) {
    const grid = document.createElement("div");
    grid.className = "summary-grid";
    payload.summaries.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "summary-row";
      row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
      grid.appendChild(row);
    });
    bubble.appendChild(grid);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  el.chatLog.appendChild(wrap);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

// Suggestions stay optional; the assistant still works fully through typed chat.
export function renderSuggestions(actions, onAction) {
  el.suggestions.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    button.textContent = action.label;
    button.addEventListener("click", () => onAction(action.payload));
    el.suggestions.appendChild(button);
  });
}

export function showTyping() {
  removeTyping();
  const wrap = document.createElement("article");
  wrap.className = "message-wrap assistant";
  wrap.id = "typing-indicator";
  wrap.innerHTML = `
    <div class="avatar assistant">${assistantAvatarMarkup}</div>
    <div class="message assistant">
      <p class="message-meta">eBee</p>
      <div class="typing"><span></span><span></span><span></span></div>
    </div>
  `;
  el.chatLog.appendChild(wrap);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

export function removeTyping() {
  const node = document.getElementById("typing-indicator");
  if (node) node.remove();
}

export function setAssistantPresence(label) {
  el.assistantStatus.textContent = label;
}

export function clearConversation() {
  el.chatLog.innerHTML = "";
}

export function renderSummary(state) {
  const isHistory = state.summaryView === "history";
  const isRide = state.activeDomain === "ride";
  const cartDomains = [...new Set(state.cart.map((item) => item.domain).filter(Boolean))];
  const hasMixedCart = cartDomains.length > 1;

  el.summaryDomain.textContent = isHistory
    ? "Order history"
    : state.activeDomain === "general"
      ? "Nothing started yet"
      : hasMixedCart
        ? "Multi-Service"
        : titleCase(state.activeDomain);
  el.summaryFlow.textContent = isHistory ? `${state.orderHistory.length} Saved` : titleCase(state.flowState);
  el.tabActive.classList.toggle("active", state.summaryView === "active");
  el.tabHistory.classList.toggle("active", state.summaryView === "history");
  el.secondaryMicrocopy.textContent = isRide ? "Ride booking" : "Checkout";
  el.secondaryTitle.textContent = isRide ? "Booking sheet" : "Order sheet";
  el.summaryItems.innerHTML = "";

  if (isHistory) {
    renderHistorySummary(state);
    return;
  }

  if (isRide && (state.ride.destination || state.flowState === "ride booked")) {
    el.summaryItems.innerHTML = `
      <div class="summary-item">
        <header>
          <strong>${state.ride.agencyName || "Ride booking"}</strong>
          <strong>${state.ride.destination || "-"}</strong>
        </header>
        <p>Vehicle: ${state.ride.vehicleMode ? titleCase(state.ride.vehicleMode) : "-"}</p>
        <p>Type: ${state.ride.occupancy ? titleCase(state.ride.occupancy) : "-"}</p>
        <p>Pickup: ${state.ride.pickupLocation || "-"}</p>
        <p>Time: ${state.ride.pickupTime || "-"}</p>
      </div>
    `;
  } else if (!state.cart.length) {
    el.summaryItems.innerHTML = `<div class="empty-state"><strong>Nothing in progress</strong>Start a request and the live summary will appear here.</div>`;
  } else {
    renderActiveCart(state);
  }

  el.checkoutPanel.innerHTML = isRide ? buildRideCheckoutMarkup(state) : buildOrderCheckoutMarkup(state);
}

// History and active cart deliberately render through different paths to keep each state simple.
function renderHistorySummary(state) {
  if (!state.orderHistory.length) {
    el.summaryItems.innerHTML = `<div class="empty-state"><strong>No past orders yet</strong>Completed orders will appear here after checkout.</div>`;
  } else {
    state.orderHistory.forEach((order) => {
      const historyCard = document.createElement("article");
      historyCard.className = `summary-item history-card${state.selectedHistoryOrderId === order.id ? " selected" : ""}`;
      historyCard.dataset.orderId = order.id;
      const serviceLabel = order.serviceDomains?.length
        ? order.serviceDomains.map((domain) => titleCase(domain)).join(" + ")
        : order.domain;
      historyCard.innerHTML = `
        <header>
          <strong>${order.domain}</strong>
          <strong>Rs. ${order.total}</strong>
        </header>
        <p>${order.items.length} item(s) | ${order.payment}</p>
        <p>${serviceLabel}</p>
        <p>${order.address}</p>
      `;
      el.summaryItems.appendChild(historyCard);
    });
  }

  const selected = state.orderHistory.find((order) => order.id === state.selectedHistoryOrderId) || state.orderHistory[0];
  if (selected && !state.selectedHistoryOrderId) {
    state.selectedHistoryOrderId = selected.id;
  }

  if (!selected) {
    el.checkoutPanel.innerHTML = `
      <div class="checkout-box">
        <header>
          <strong>Order details</strong>
          <strong>-</strong>
        </header>
        <p>Select a past order to view the full receipt.</p>
      </div>
    `;
    return;
  }

  const groupedItems = selected.items.reduce((groups, item) => {
    const key = item.domain || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  const groupedMarkup = Object.entries(groupedItems)
    .map(([domain, items]) => `
      <div class="history-detail-group">
        <div class="summary-group-label">${titleCase(domain)} Items</div>
        ${items.map((item) => `
          <div class="history-detail-row">
            <span>${item.name}</span>
            <strong>${item.quantity} ${item.unit}</strong>
          </div>
        `).join("")}
      </div>
    `)
    .join("");

  const breakdownMarkup = selected.breakdown
    ? Object.entries(selected.breakdown)
      .map(([domain, info]) => `
        <div class="history-detail-row">
          <span>${titleCase(domain)}</span>
          <strong>Rs. ${info.total}</strong>
        </div>
      `)
      .join("")
    : "";

  el.checkoutPanel.innerHTML = `
    <div class="checkout-box">
      <header>
        <strong>Selected order</strong>
        <strong>Rs. ${selected.total}</strong>
      </header>
      <p>Status: Confirmed</p>
      <p>Payment: ${selected.payment}</p>
      <p>Address: ${selected.address}</p>
      <p>Services: ${selected.serviceDomains?.length ? selected.serviceDomains.map((domain) => titleCase(domain)).join(" + ") : selected.domain}</p>
    </div>
    <div class="checkout-box">
      <header>
        <strong>Service split</strong>
        <strong>${selected.serviceDomains?.length || 1} service(s)</strong>
      </header>
      ${breakdownMarkup}
    </div>
    <div class="checkout-box">
      <header>
        <strong>What you ordered</strong>
        <strong>${selected.items.length} item(s)</strong>
      </header>
      ${groupedMarkup}
    </div>
  `;
}

function renderActiveCart(state) {
  const groupedItems = state.cart.reduce((groups, item) => {
    const key = item.domain || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});

  Object.entries(groupedItems).forEach(([domain, items]) => {
    const section = document.createElement("section");
    section.className = "summary-group";

    const heading = document.createElement("div");
    heading.className = "summary-group-label";
    heading.textContent = `${titleCase(domain)} Items`;
    section.appendChild(heading);

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "summary-item";
      card.innerHTML = `
        <header>
          <strong>${item.name}</strong>
          <strong>Rs. ${item.lineTotal}</strong>
        </header>
        <p>${item.quantity} ${item.unit} | ${item.meta}</p>
        <div class="item-controls">
          <button type="button" class="item-action" data-action="decrease" data-id="${item.id}">-</button>
          <input class="item-qty-input" type="number" min="0.1" step="0.1" value="${item.quantity}" data-id="${item.id}">
          <span class="item-unit-label">${item.unit}</span>
          <button type="button" class="item-action" data-action="increase" data-id="${item.id}">+</button>
          <button type="button" class="item-action delete" data-action="delete" data-id="${item.id}">Delete</button>
        </div>
      `;
      section.appendChild(card);
    });

    el.summaryItems.appendChild(section);
  });
}

function buildRideCheckoutMarkup(state) {
  return `
    <div class="checkout-box">
      <header>
        <strong>Booking status</strong>
        <strong>${titleCase(state.flowState)}</strong>
      </header>
      <p>Destination: ${state.ride.destination || "-"}</p>
      <p>Agency: ${state.ride.agencyName || "-"}</p>
      <p>Vehicle: ${state.ride.vehicleMode ? titleCase(state.ride.vehicleMode) : "-"}</p>
      <p>Type: ${state.ride.occupancy ? titleCase(state.ride.occupancy) : "-"}</p>
      <p>Pickup: ${state.ride.pickupLocation || "-"}</p>
      <p>Pickup time: ${state.ride.pickupTime || "-"}</p>
    </div>
    <div class="checkout-box">
      <header>
        <strong>Ride contact</strong>
        <strong>${state.ride.contactName || "-"}</strong>
      </header>
      <p>Driver: ${state.ride.contactName || "-"}</p>
      <p>Phone: ${state.ride.contactPhone || "-"}</p>
      <p>Session: ${state.sessionId}</p>
    </div>
  `;
}

function buildOrderCheckoutMarkup(state) {
  const cartDomains = [...new Set(state.cart.map((item) => item.domain).filter(Boolean))];
  const serviceLabel = cartDomains.length > 1 ? cartDomains.map((domain) => titleCase(domain)).join(" + ") : (cartDomains[0] ? titleCase(cartDomains[0]) : "Order");
  const groupedBreakdown = state.cart.reduce((groups, item) => {
    const key = item.domain || "other";
    if (!groups[key]) {
      groups[key] = { subtotal: 0, itemCount: 0 };
    }
    groups[key].subtotal += item.lineTotal;
    groups[key].itemCount += 1;
    return groups;
  }, {});
  const breakdownMarkup = Object.entries(groupedBreakdown)
    .map(([domain, info]) => `<p>${titleCase(domain)}: ${info.itemCount} item(s) • Rs. ${info.subtotal}</p>`)
    .join("");

  return `
    <div class="checkout-box">
      <header>
        <strong>Total payable</strong>
        <strong>Rs. ${state.totals.total}</strong>
      </header>
      <p>Services: ${serviceLabel}</p>
      ${breakdownMarkup}
      <p>Subtotal: Rs. ${state.totals.subtotal}</p>
      <p>Delivery: Rs. ${state.totals.delivery}</p>
      <p>Tax: Rs. ${state.totals.tax}</p>
    </div>
    <div class="checkout-box">
      <header>
        <strong>Address</strong>
        <strong>${state.address}</strong>
      </header>
      <p>Payment mode: ${state.paymentChoice ? titleCase(state.paymentChoice.replace("_", " ")) : "-"}</p>
      <p>Payment: ${titleCase(state.paymentStatus)}</p>
      <p>Session: ${state.sessionId}</p>
    </div>
  `;
}
