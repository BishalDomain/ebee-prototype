export function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bpls\b/g, "please")
    .replace(/\bu\b/g, "you")
    .replace(/\bkgs\b/g, "kg")
    .replace(/\bgms\b/g, "gm")
    .replace(/\bgrams\b/g, "gram")
    .replace(/\bmls\b/g, "ml")
    .replace(/\bltr\b/g, "litre")
    .replace(/\bltrs\b/g, "litre")
    .replace(/\bliter\b/g, "litre")
    .replace(/\bliters\b/g, "litre")
    .replace(/\bbiriyani\b/g, "biryani")
    .replace(/\bbiryanii\b/g, "biryani")
    .replace(/\blamp\b/g, "lamb")
    .replace(/\bpotatoes\b/g, "potato")
    .replace(/\beggs\b/g, "egg")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferQuantity(message, item) {
  const normalized = normalizeText(message);

  if (includesAny(normalized, ["half kg", "half kilo", "half litre", "half liter"])) {
    return 0.5;
  }

  if (includesAny(normalized, ["one dozen"])) {
    return item.unit === "pieces" ? 12 : 1;
  }

  if (includesAny(normalized, ["two dozen"])) {
    return item.unit === "pieces" ? 24 : 2;
  }

  const compactMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|litre|liter|liters|litres|l|dozen|box|boxes|bottle|bottles|pack|packs|jar|jars|bunch|bunches|loaf|loaves|plate|plates|piece|pieces)?/);
  const isPriceMention = /\b\d+(?:\.\d+)?\s*(rs|rupees)\b/.test(normalized) || /\brs\s*\d+(?:\.\d+)?\b/.test(normalized);
  const allNumbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const hasPackSizeOnly = /\b\d+(?:\.\d+)?\s*(gm|gram|kg|ml|litre|liter|liters|litres)\b/.test(normalized);

  if (item.unit === "pieces") {
    const pieceMatch = normalized.match(/(\d+)\s*(egg|eggs|pieces)/);
    if (pieceMatch) return Number(pieceMatch[1]);
  }

  if (item.unit === "basket") return 1;

  const unitAwarePatterns = {
    kg: /(\d+(?:\.\d+)?)\s*(kg|kilogram|kilograms)\b/,
    litre: /(\d+(?:\.\d+)?)\s*(litre|liter|liters|litres|l)\b/,
    bottle: /(\d+(?:\.\d+)?)\s*(bottle|bottles)\b/,
    pack: /(\d+(?:\.\d+)?)\s*(pack|packs)\b/,
    jar: /(\d+(?:\.\d+)?)\s*(jar|jars)\b/,
    bunch: /(\d+(?:\.\d+)?)\s*(bunch|bunches)\b/,
    box: /(\d+(?:\.\d+)?)\s*(box|boxes)\b/,
    loaf: /(\d+(?:\.\d+)?)\s*(loaf|loaves)\b/,
    plate: /(\d+(?:\.\d+)?)\s*(plate|plates)\b/,
    dozen: /(\d+(?:\.\d+)?)\s*(dozen)\b/,
  };

  const unitPattern = unitAwarePatterns[item.unit];
  if (unitPattern) {
    const match = normalized.match(unitPattern);
    if (match) return Number(match[1]);
  }

  if (["jar", "pack", "bottle", "box"].includes(item.unit) && hasPackSizeOnly) {
    return 1;
  }

  if (compactMatch && compactMatch[2]) return Number(compactMatch[1]);
  if (isPriceMention && allNumbers.length > 1) return allNumbers[0];
  if (isPriceMention) return 1;

  const directNumber = normalized.match(/(\d+)/);
  return directNumber ? Number(directNumber[1]) : 1;
}

export function formatItems(items) {
  return items.map((item) => `${item.quantity} ${item.unit} ${item.name}`).join(", ");
}

export function toCard(item) {
  return {
    title: item.name,
    meta: `${item.quantity} ${item.unit} | ${item.meta}`,
    value: `Rs. ${item.lineTotal}`,
  };
}

export function buildMissingItemMessage(domain, unmatched) {
  if (unmatched.length) {
    return `I understood this as a ${domain} request, but I could not clearly match ${unmatched.join(", ")}. Please retype the item name with quantity if needed.`;
  }

  return `I am ready for your ${domain} request, but I still need the item names or quantity. Please tell me exactly what you want.`;
}

export const personalityFlags = {
  wittyUnavailableFallback: false,
  absurdRequestHumor: true,
};

const ABSURD_TEMPLATES = [
  "Uh oh! '{item}' just vanished into the wild while I was chasing it. No worries, pick something else while I track it down!",
  "Ohhh nooo! '{item}' sprinted away the moment you asked for it. Bold move. Try something else while I go on a mini hunt!",
  "That request deserves a superhero, not a bee. Let us try something a little more doable.",
  "If I could do that, I would already be famous. Let us try something doable!",
];

const UNAVAILABLE_TEMPLATES = [
  "Zippy checked twice and '{item}' is not available right now. Want to swap it for something similar?",
  "Tiny plot twist: '{item}' is taking a break at the moment. Pick another option and I will keep things moving.",
];

const retailCueWords = new Set([
  "milk", "bread", "egg", "rice", "oil", "maida", "onion", "tomato", "curd", "mint", "coriander",
  "detergent", "biscuit", "biscuits", "burger", "fries", "pizza", "wrap", "biryani", "curry", "chips",
  "coke", "cola", "fruit", "apple", "banana", "orange", "basket", "pack", "box", "bottle", "kg", "litre",
  "honey", "jar", "gm", "gram", "ml",
]);

export function shouldUseAbsurdCatalogFallback(text) {
  if (!personalityFlags.absurdRequestHumor) return false;

  const normalized = normalizeText(text).replace(/\b(buddy|mate|please|i want|i wanna|i need|can i get|order|get me|add)\b/g, "").trim();
  if (!normalized) return false;
  if (/\d/.test(normalized)) return false;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return false;

  return words.every((word) => !retailCueWords.has(word));
}

export function buildAbsurdCatalogFallback(itemName) {
  const cleaned = titleCase(itemName.replace(/\b(add|get|give|send|bring|need)\b/g, "").trim() || itemName);
  return ABSURD_TEMPLATES[cleaned.length % ABSURD_TEMPLATES.length].replace("{item}", cleaned);
}

export function buildUnavailablePersonalityReply(itemName) {
  const cleaned = titleCase(itemName);
  return UNAVAILABLE_TEMPLATES[cleaned.length % UNAVAILABLE_TEMPLATES.length].replace("{item}", cleaned);
}

export function formatAvailabilityList(locations) {
  const pretty = locations.map((location) => titleCase(location));
  if (pretty.length <= 1) return pretty[0] || "";
  if (pretty.length === 2) return `${pretty[0]} and ${pretty[1]}`;
  return `${pretty.slice(0, -1).join(", ")}, and ${pretty[pretty.length - 1]}`;
}

export function cleanMealName(value) {
  return value
    .replace(/\b(today|buddy|mate|please|for lunch|for dinner|tonight|today im|today i'm)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldUsePlayfulCookingFallback(mealName) {
  const normalized = normalizeText(mealName);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) return false;

  const knownFoodWords = new Set([
    "biryani", "pulao", "curry", "masala", "rice", "chicken", "fish", "mutton",
    "veg", "vegetable", "egg", "paneer", "cutlet", "fry", "gravy", "kebab",
    "soup", "noodles", "roll", "wrap", "fried", "meal",
  ]);

  return words.some((word) => !knownFoodWords.has(word));
}

export function buildPlayfulCookingFallback(mealName) {
  const token = extractPlayfulIngredientToken(mealName);
  const templates = [
    `That is a bold menu choice. Should I add ${token} to the cart, or do you want to tell me what you actually need for your not-so-suspicious meal?`,
    `I respect the ambition. Before I start hunting for ${token}, tell me the ingredients you really want and I will build the cooking list for you.`,
    `That sounds... memorable. Instead of quietly adding ${token} to the cart, tell me the real ingredients you want for this masterpiece.`,
  ];

  return templates[mealName.length % templates.length];
}

export function isGreeting(message) {
  return ["hi", "hello", "hey", "hii", "helo", "yo"].includes(message.trim());
}

export function getQuantityStep(unit) {
  if (["pieces", "pack", "jar", "bunch", "box", "loaf", "plate", "dozen"].includes(unit)) return 1;
  return 0.5;
}

export function extractPlayfulIngredientToken(mealName) {
  const normalized = normalizeText(mealName);
  const filler = new Set(["curry", "cutlet", "masala", "rice", "gravy", "fry", "meal"]);
  return normalized.split(/\s+/).find((word) => !filler.has(word)) || normalized;
}

export function similarity(a, b) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length, 1);
}

export function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FOOD_SERVICE_WORDS = [
  "food", "eat", "hungry", "restaurant", "ready to eat", "ready-to-eat", "meal",
];

const COOKED_DISH_WORDS = [
  "biryani", "curry", "chop", "chops", "gravy", "kebab", "tikka", "fried", "fry",
  "roll", "wrap", "burger", "pizza", "fries", "cutlet", "masala",
];

const RAW_PROTEIN_WORDS = ["chicken", "mutton", "pork", "lamb", "fish", "egg"];

const GROCERY_SIGNAL_WORDS = [
  "kg", "gram", "grams", "litre", "liter", "liters", "litres", "pack", "packs",
  "bottle", "bottles", "grocery", "groceries", "ingredient", "ingredients", "raw",
];

export function hasFoodServiceCue(text) {
  return includesAny(text, FOOD_SERVICE_WORDS);
}

export function isLikelyCookedDish(text) {
  return includesAny(text, COOKED_DISH_WORDS);
}

export function isLikelyRawIngredientRequest(text) {
  const hasProtein = includesAny(text, RAW_PROTEIN_WORDS);
  const hasGroceryCue = includesAny(text, GROCERY_SIGNAL_WORDS);
  return hasProtein && hasGroceryCue;
}
