export function createInitialRideState() {
  return {
    step: null,
    destination: "",
    available: null,
    agencyName: "",
    vehicleMode: "",
    occupancy: "",
    pickupTime: "",
    pickupLocation: "",
    contactName: "",
    contactPhone: "",
  };
}

export function createInitialTotals() {
  return {
    subtotal: 0,
    delivery: 0,
    tax: 0,
    total: 0,
  };
}

export const state = {
  sessionId: `ebee-${Math.random().toString(36).slice(2, 8)}`,
  activeDomain: "general",
  flowState: "ready",
  paymentStatus: "not started",
  paymentChoice: "",
  address: "Not set",
  cart: [],
  orderHistory: [],
  selectedHistoryOrderId: null,
  summaryView: "active",
  recipePlan: null,
  totals: createInitialTotals(),
  ride: createInitialRideState(),
};

export function resetSessionState() {
  state.activeDomain = "general";
  state.flowState = "ready";
  state.paymentStatus = "not started";
  state.paymentChoice = "";
  state.address = "Not set";
  state.cart = [];
  state.selectedHistoryOrderId = null;
  state.summaryView = "active";
  state.recipePlan = null;
  state.totals = createInitialTotals();
  state.ride = createInitialRideState();
}
