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
  activeTracking: null,
  paymentStatus: "not started",
  paymentChoice: "",
  address: "Not set",
  cart: [],
  orderHistory: [],
  selectedHistoryOrderId: null,
  menuView: "history",
  recipePlan: null,
  totals: createInitialTotals(),
  ride: createInitialRideState(),
};

export function resetSessionState() {
  state.activeDomain = "general";
  state.flowState = "ready";
  state.activeTracking = null;
  state.paymentStatus = "not started";
  state.paymentChoice = "";
  state.address = "Not set";
  state.cart = [];
  state.selectedHistoryOrderId = null;
  state.menuView = "history";
  state.recipePlan = null;
  state.totals = createInitialTotals();
  state.ride = createInitialRideState();
}
