import {
  estimateRidePricing,
  formatCurrency,
  getCartCategory,
  getCartCategoryLabel,
  getDraftProgress,
  getQuantityStep,
  titleCase,
} from "./utils.js";

const assistantAvatarMarkup = `<img src="./mascot.png" alt="Zippy, eBee mascot">`;

export const el = {
  chatLog: document.getElementById("chat-log"),
  chatForm: document.getElementById("chat-form"),
  userInput: document.getElementById("user-input"),
  imageInput: document.getElementById("menu-image-input"),
  uploadTrigger: document.getElementById("upload-trigger"),
  voiceTrigger: document.getElementById("voice-trigger"),
  suggestions: document.getElementById("suggestions"),
  historyList: document.getElementById("history-list"),
  flowDetails: document.getElementById("flow-details"),
  flowStatusLabel: document.getElementById("flow-status-label"),
  flowStatusCopy: document.getElementById("flow-status-copy"),
  historyViewBtn: document.getElementById("history-view-btn"),
  flowViewBtn: document.getElementById("flow-view-btn"),
  historyPanel: document.getElementById("history-panel"),
  flowPanel: document.getElementById("flow-panel"),
  menuToggle: document.getElementById("menu-toggle"),
  cartToggle: document.getElementById("cart-toggle"),
  closeMenu: document.getElementById("close-menu"),
  closeCart: document.getElementById("close-cart"),
  menuDrawer: document.getElementById("menu-drawer"),
  cartDrawer: document.getElementById("cart-drawer"),
  drawerOverlay: document.getElementById("drawer-overlay"),
  cartGroups: document.getElementById("cart-groups"),
  cartSubtotal: document.getElementById("cart-subtotal"),
  cartFees: document.getElementById("cart-fees"),
  cartTotal: document.getElementById("cart-total"),
  cartFooterCopy: document.getElementById("cart-footer-copy"),
  cartBadge: document.getElementById("cart-badge"),
  progressFill: document.getElementById("order-progress-fill"),
  resetButton: document.getElementById("reset-session"),
};

export function setDrawerOpen(drawerName = "") {
  const next = drawerName === "menu" || drawerName === "cart" ? drawerName : "";

  document.body.classList.toggle("menu-open", next === "menu");
  document.body.classList.toggle("cart-open", next === "cart");
  document.body.classList.toggle("drawer-open", Boolean(next));

  el.menuDrawer?.setAttribute("aria-hidden", String(next !== "menu"));
  el.cartDrawer?.setAttribute("aria-hidden", String(next !== "cart"));
  el.drawerOverlay?.setAttribute("aria-hidden", String(!next));
  el.menuToggle?.setAttribute("aria-expanded", String(next === "menu"));
  el.cartToggle?.setAttribute("aria-expanded", String(next === "cart"));
}

export function setMenuView(view) {
  const next = view === "flow" ? "flow" : "history";
  el.historyViewBtn?.classList.toggle("active", next === "history");
  el.flowViewBtn?.classList.toggle("active", next === "flow");
  el.historyViewBtn?.setAttribute("aria-selected", String(next === "history"));
  el.flowViewBtn?.setAttribute("aria-selected", String(next === "flow"));
  if (el.historyPanel) el.historyPanel.hidden = next !== "history";
  if (el.flowPanel) el.flowPanel.hidden = next !== "flow";
  el.historyPanel?.classList.toggle("active", next === "history");
  el.flowPanel?.classList.toggle("active", next === "flow");
}

export function appendMessage(role, payload) {
  const wrap = document.createElement("article");
  wrap.className = `message-wrap ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${role}`;
  if (role === "assistant") {
    avatar.innerHTML = assistantAvatarMarkup;
  } else {
    avatar.innerHTML = `<span aria-hidden="true"></span>`;
  }

  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;

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

  if (role === "assistant" && payload.actions?.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "message-actions";

    payload.actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `message-action ${action.tone === "primary" ? "primary" : "secondary"}`;
      button.textContent = action.label;
      button.dataset.payload = action.payload;
      actionRow.appendChild(button);
    });

    bubble.appendChild(actionRow);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  el.chatLog.appendChild(wrap);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

export function renderSuggestions(actions, onAction) {
  el.suggestions.innerHTML = "";
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      setDrawerOpen("");
      onAction(action.payload);
    });
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
      <div class="typing"><span></span><span></span><span></span></div>
    </div>
  `;
  el.chatLog.appendChild(wrap);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
}

export function removeTyping() {
  document.getElementById("typing-indicator")?.remove();
}

export function setAssistantPresence(label) {
  document.body.dataset.assistantPresence = label.toLowerCase();
}

export function clearConversation() {
  el.chatLog.innerHTML = "";
}

export function renderSummary(state) {
  setMenuView(state.menuView);
  renderProgress(state);
  renderHistory(state);
  renderFlow(state);
  renderCart(state);
}

function renderProgress(state) {
  const progress = getDraftProgress(state);
  if (!el.progressFill) return;

  el.progressFill.style.width = `${progress.percent}%`;
  el.progressFill.classList.toggle("inactive", !progress.active);
  if (el.flowStatusLabel) el.flowStatusLabel.textContent = progress.label;
  if (el.flowStatusCopy) el.flowStatusCopy.textContent = progress.copy;
}

function renderHistory(state) {
  if (!el.historyList) return;
  el.historyList.innerHTML = "";

  if (!state.orderHistory.length) {
    el.historyList.innerHTML = `<div class="drawer-empty-state"><strong>No orders yet</strong>Your confirmed deliveries and rentals will appear here.</div>`;
    return;
  }

  state.orderHistory.forEach((order) => {
    const expanded = state.selectedHistoryOrderId === order.id;
    const card = document.createElement("article");
    card.className = `history-card${expanded ? " expanded" : ""}`;
    card.dataset.orderId = order.id;

    const itemsMarkup = order.items
      .map((item) => `
        <div class="history-detail-row">
          <span>${item.name}</span>
          <strong>${item.quantity} ${item.unit}</strong>
        </div>
        <div class="history-detail-row subtle">
          <span>${getCartCategoryLabel(getCartCategory(item.domain || "grocery"))}</span>
          <strong>${formatCurrency(item.lineTotal || item.price || 0)}</strong>
        </div>
      `)
      .join("");

    const breakdownMarkup = Object.entries(order.breakdown || {})
      .map(([domain, info]) => `
        <div class="history-detail-row">
          <span>${getCartCategoryLabel(getCartCategory(domain))}</span>
          <strong>${formatCurrency(info.total)}</strong>
        </div>
      `)
      .join("");

    const deliveryMarkup = Object.entries(order.deliveryDetails || {})
      .map(([label, value]) => `
        <div class="history-detail-row">
          <span>${titleCase(label.replace(/([A-Z])/g, " $1").replace(/_/g, " "))}</span>
          <strong>${value}</strong>
        </div>
      `)
      .join("");

    card.innerHTML = `
      <button class="history-card-toggle" type="button" data-order-id="${order.id}">
        <div class="history-card-top">
          <div>
            <p class="history-id">${order.id}</p>
            <strong>${order.dateLabel}</strong>
          </div>
          <div class="history-card-meta">
            <strong>${formatCurrency(order.total)}</strong>
            <span>${order.status}</span>
          </div>
        </div>
      </button>
      <div class="history-card-body">
        <div class="history-detail-group">
          <div class="summary-group-label">Items ordered</div>
          ${itemsMarkup}
        </div>
        <div class="history-detail-group">
          <div class="summary-group-label">Price breakdown</div>
          ${breakdownMarkup || `<div class="history-detail-row"><span>Total</span><strong>${formatCurrency(order.total)}</strong></div>`}
        </div>
        <div class="history-detail-group">
          <div class="summary-group-label">Delivery details</div>
          ${deliveryMarkup}
        </div>
      </div>
    `;
    el.historyList.appendChild(card);
  });
}

function renderFlow(state) {
  if (!el.flowDetails) return;

  const liveCart = getLiveCartSnapshot(state);

  if (state.activeTracking) {
    el.flowDetails.innerHTML = `
      <div class="flow-stack">
        <div class="flow-row">
          <span>Tracking</span>
          <strong>${state.activeTracking.status}</strong>
        </div>
        <div class="flow-row">
          <span>Reference</span>
          <strong>${state.activeTracking.orderId}</strong>
        </div>
        <div class="flow-row">
          <span>Type</span>
          <strong>${titleCase(state.activeTracking.kind)}</strong>
        </div>
      </div>
    `;
    return;
  }

  if (liveCart.itemCount) {
    const categoryRows = liveCart.categories
      .filter((group) => group.items.length)
      .map((group) => `
        <div class="flow-row">
          <span>${group.label}</span>
          <strong>${group.items.length} item(s)</strong>
        </div>
      `)
      .join("");

    el.flowDetails.innerHTML = `
      <div class="flow-stack">
        ${categoryRows}
        <div class="flow-row">
          <span>Combined total</span>
          <strong>${formatCurrency(liveCart.total)}</strong>
        </div>
      </div>
    `;
    return;
  }

  el.flowDetails.innerHTML = `<div class="drawer-empty-state"><strong>No active flow</strong>Your current checkout or rental details will appear here.</div>`;
}

function renderCart(state) {
  const snapshot = getLiveCartSnapshot(state);

  if (el.cartBadge) {
    el.cartBadge.textContent = String(snapshot.itemCount);
    el.cartBadge.classList.toggle("has-items", snapshot.itemCount > 0);
  }

  if (el.cartGroups) {
    el.cartGroups.innerHTML = "";

    if (!snapshot.itemCount) {
      el.cartGroups.innerHTML = `<div class="drawer-empty-state"><strong>Cart is empty</strong>Ask eBee for food, groceries, fruits, or a rental to start building it.</div>`;
    } else {
      snapshot.categories.forEach((group) => {
        if (!group.items.length) return;
        const section = document.createElement("section");
        section.className = "cart-group";
        section.innerHTML = `<div class="cart-group-title">${group.label}</div>`;

        group.items.forEach((item) => {
          const article = document.createElement("article");
          article.className = "cart-item-card";
          article.innerHTML = `
            <div class="cart-item-top">
              <div>
                <strong>${item.name}</strong>
                <p>${item.meta}</p>
              </div>
              <strong>${formatCurrency(item.lineTotal)}</strong>
            </div>
            ${item.editable ? `
              <div class="item-controls">
                <button type="button" class="item-action" data-action="decrease" data-id="${item.id}">-</button>
                <input class="item-qty-input" type="number" min="${getQuantityStep(item.unit)}" step="${getQuantityStep(item.unit)}" value="${item.quantity}" data-id="${item.id}">
                <span class="item-unit-label">${item.unit}</span>
                <button type="button" class="item-action" data-action="increase" data-id="${item.id}">+</button>
              </div>
            ` : `
              <div class="cart-item-fixed">
                <span>Quantity</span>
                <strong>${item.quantity} ${item.unit}</strong>
              </div>
            `}
          `;
          section.appendChild(article);
        });

        el.cartGroups.appendChild(section);
      });
    }
  }

  if (el.cartSubtotal) el.cartSubtotal.textContent = formatCurrency(snapshot.subtotal);
  if (el.cartFees) el.cartFees.textContent = formatCurrency(snapshot.fees);
  if (el.cartTotal) el.cartTotal.textContent = formatCurrency(snapshot.total);
  if (el.cartFooterCopy) {
    el.cartFooterCopy.textContent = snapshot.itemCount
      ? `${snapshot.itemCount} item(s) across ${snapshot.activeCategoryCount} active category${snapshot.activeCategoryCount === 1 ? "" : "ies"}.`
      : "Your grouped live cart will appear here.";
  }
}

function getLiveCartSnapshot(state) {
  const groups = [
    { key: "food", label: "Food", items: [] },
    { key: "groceries", label: "Groceries", items: [] },
    { key: "rental", label: "Rental", items: [] },
  ];

  const groupMap = Object.fromEntries(groups.map((group) => [group.key, group]));

  state.cart.forEach((item) => {
    const category = getCartCategory(item.domain);
    groupMap[category].items.push({
      ...item,
      editable: true,
    });
  });

  const rideItem = buildRideCartItem(state);
  if (rideItem) {
    groupMap.rental.items.push(rideItem);
  }

  const rideTotal = rideItem ? rideItem.lineTotal : 0;
  const rideFees = rideItem ? Math.max(0, rideItem.lineTotal - rideItem.price) : 0;
  const subtotal = state.totals.subtotal + (rideItem ? rideItem.price : 0);
  const fees = (state.totals.total - state.totals.subtotal) + rideFees;
  const total = state.totals.total + rideTotal;
  const itemCount = groups.reduce((count, group) => count + group.items.length, 0);
  const activeCategoryCount = groups.filter((group) => group.items.length).length;

  return {
    categories: groups,
    subtotal,
    fees,
    total,
    itemCount,
    activeCategoryCount,
  };
}

function buildRideCartItem(state) {
  const hasDraftRide = Boolean(state.ride.destination && state.ride.vehicleMode && state.ride.occupancy);
  const hasActiveRental = state.activeTracking?.kind === "rental" && state.activeTracking.status !== "Trip completed";

  if (!hasDraftRide && !hasActiveRental) return null;

  const pricing = estimateRidePricing(state.ride);
  return {
    id: "ride-booking",
    domain: "ride",
    name: `${titleCase(state.ride.vehicleMode || "Ride")} to ${state.ride.destination || "Destination pending"}`,
    quantity: 1,
    unit: "trip",
    price: pricing.subtotal,
    lineTotal: pricing.total,
    meta: `${titleCase(state.ride.occupancy || "reserved")} • ${state.ride.pickupLocation || "Pickup pending"}`,
    editable: false,
  };
}
