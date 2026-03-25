// Lightweight local server for the static app plus optional helper APIs.
const http = require("http");
const fs = require("fs");
const path = require("path");

// Runtime configuration. Ollama is optional and only used when the user runs it locally.
const root = __dirname;
const port = 3000;
const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const ollamaModel = process.env.OLLAMA_MODEL || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// Route API helpers first, then fall back to serving static files.
http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/assist") {
    const body = await readBody(request);
    const payload = safeJsonParse(body);
    const originalText = payload?.text || "";

    if (!ollamaModel || !originalText) {
      return sendJson(response, 200, { text: originalText, provider: "fallback", enabled: false });
    }

    try {
      const aiText = await polishWithOllama(originalText, payload?.context || "");
      return sendJson(response, 200, { text: aiText || originalText, provider: "ollama", enabled: true });
    } catch (error) {
      return sendJson(response, 200, { text: originalText, provider: "fallback", enabled: false });
    }
  }

  if (request.method === "GET" && request.url.startsWith("/api/recipe")) {
    const url = new URL(request.url, `http://localhost:${port}`);
    const meal = (url.searchParams.get("meal") || "").trim();

    if (!meal) {
      return sendJson(response, 400, { error: "Missing meal query" });
    }

    try {
      const recipe = await fetchMealRecipe(meal);
      return sendJson(response, 200, recipe);
    } catch {
      return sendJson(response, 200, localMealFallback(meal));
    }
  }

  const requested = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.join(root, path.normalize(requested).replace(/^(\.\.[/\\])+/, ""));

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
}).listen(port, () => {
  console.log(`eBee prototype running at http://localhost:${port}`);
});

// Common JSON response helper for the small API endpoints.
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

// Optional local AI polishing pass. This never changes facts, only tone.
async function polishWithOllama(text, context) {
  const prompt = [
    "You are eBee, a calm and efficient conversational commerce assistant.",
    "Rewrite the assistant message so it sounds smooth, clear, concise, and human.",
    "Do not change the facts, amounts, addresses, or next steps.",
    "Keep it short and professional.",
    context ? `Context: ${context}` : "",
    `Message: ${text}`,
  ].filter(Boolean).join("\n");

  const result = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
    }),
  });

  if (!result.ok) {
    throw new Error(`Ollama request failed: ${result.status}`);
  }

  const data = await result.json();
  return (data.response || "").trim();
}

// Fetch a recipe plan and convert raw API fields into the smaller shape used by the frontend.
async function fetchMealRecipe(meal) {
  const mealData = await searchMealWithFallbacks(meal);
  if (!mealData) {
    return localMealFallback(meal);
  }

  const ingredients = [];
  for (let index = 1; index <= 20; index += 1) {
    const ingredient = (mealData[`strIngredient${index}`] || "").trim();
    const measure = (mealData[`strMeasure${index}`] || "").trim();
    if (!ingredient) continue;
    const parsed = parseIngredientMeasure(ingredient, measure);
    ingredients.push(parsed);
  }

  return {
    title: mealData.strMeal || titleCase(meal),
    moodReply: `That sounds like a great plan. I found a recipe base for ${mealData.strMeal || titleCase(meal)} and can add the core ingredients for you.`,
    ingredients,
    source: "TheMealDB",
  };
}

// Search with progressively broader attempts, but only accept reasonably similar results.
async function searchMealWithFallbacks(meal) {
  const attempts = buildMealSearchAttempts(meal);

  for (const attempt of attempts) {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(attempt)}`;
    const result = await fetch(url);
    if (!result.ok) {
      continue;
    }

    const data = await result.json();
    if (data.meals?.length) {
      const best = findBestMealMatch(meal, data.meals);
      if (best) return best;
    }
  }

  return null;
}

// Try the full query, then trimmed variants so natural phrasing still has a chance to match.
function buildMealSearchAttempts(meal) {
  const normalized = meal.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const stopwords = new Set(["today", "buddy", "please", "make", "cook"]);
  const filtered = words.filter((word) => !stopwords.has(word));

  const attempts = [normalized];
  if (filtered.length >= 2) attempts.push(filtered.slice(0, 2).join(" "));
  if (filtered.length >= 1) attempts.push(filtered[0]);

  return [...new Set(attempts)];
}

// Reject obviously unrelated API matches so nonsense dishes do not create real carts.
function findBestMealMatch(query, meals) {
  const normalizedQuery = normalizeMealText(query);
  let bestMeal = null;
  let bestScore = 0;

  for (const meal of meals) {
    const score = similarity(normalizedQuery, normalizeMealText(meal.strMeal || ""));
    if (score > bestScore) {
      bestScore = score;
      bestMeal = meal;
    }
  }

  return bestScore >= 0.55 ? bestMeal : null;
}

// Convert free-form recipe measures into the smaller unit model used by the cart.
function parseIngredientMeasure(name, measure) {
  const normalizedMeasure = measure.toLowerCase();
  const quantityMatch = normalizedMeasure.match(/(\d+(?:\/\d+)?(?:\.\d+)?)/);
  let quantity = 1;
  if (quantityMatch) {
    quantity = quantityMatch[1].includes("/")
      ? fractionToNumber(quantityMatch[1])
      : Number(quantityMatch[1]);
  }

  let unit = "pack";
  if (normalizedMeasure.includes("kg")) unit = "kg";
  else if (normalizedMeasure.includes("g")) unit = "kg";
  else if (normalizedMeasure.includes("litre") || normalizedMeasure.includes("liter") || normalizedMeasure.includes("ml")) unit = "litre";
  else if (normalizedMeasure.includes("dozen")) unit = "dozen";
  else if (normalizedMeasure.includes("bunch")) unit = "bunch";
  else if (normalizedMeasure.includes("jar")) unit = "jar";

  if (unit === "kg" && normalizedMeasure.includes("g") && !normalizedMeasure.includes("kg")) {
    quantity = quantity / 1000;
  }

  if (unit === "litre" && normalizedMeasure.includes("ml")) {
    quantity = quantity / 1000;
  }

  return {
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit,
  };
}

function fractionToNumber(value) {
  const [left, right] = value.split("/").map(Number);
  if (!left || !right) return 1;
  return left / right;
}

// Local curated fallback when the public recipe API has no good match.
function localMealFallback(meal) {
  const key = meal.toLowerCase();
  const plans = {
    biryani: {
      title: "Chicken Biryani",
      moodReply: "That sounds like a great plan. I can add the core ingredients for chicken biryani and you can edit quantities after that.",
      ingredients: [
        { name: "Basmati Rice", quantity: 1, unit: "kg" },
        { name: "Chicken Pieces", quantity: 1, unit: "kg" },
        { name: "Curd", quantity: 1, unit: "kg" },
        { name: "Onion", quantity: 1, unit: "kg" },
        { name: "Tomato", quantity: 0.5, unit: "kg" },
        { name: "Cooking Oil", quantity: 1, unit: "litre" },
        { name: "Ginger Garlic Paste", quantity: 1, unit: "jar" },
        { name: "Biryani Masala", quantity: 1, unit: "pack" },
        { name: "Coriander", quantity: 1, unit: "bunch" },
        { name: "Mint", quantity: 1, unit: "bunch" },
      ],
      source: "local",
    },
    pulao: {
      title: "Veg Pulao",
      moodReply: "Nice choice. I can prepare a veg pulao ingredient set and you can still adjust quantities afterward.",
      ingredients: [
        { name: "Basmati Rice", quantity: 1, unit: "kg" },
        { name: "Onion", quantity: 0.5, unit: "kg" },
        { name: "Tomato", quantity: 0.5, unit: "kg" },
        { name: "Cooking Oil", quantity: 1, unit: "litre" },
        { name: "Coriander", quantity: 1, unit: "bunch" },
        { name: "Mint", quantity: 1, unit: "bunch" },
      ],
      source: "local",
    },
  };

  return plans[key] || {
    title: titleCase(meal),
    moodReply: `That sounds good. I do not have a full live recipe match right now, but I can still help you build the ingredient list manually.`,
    ingredients: [],
    source: "local",
  };
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

// Keep string comparison tolerant without overcomplicating the server.
function normalizeMealText(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

// Tiny Levenshtein implementation for approximate meal-name matching.
function levenshtein(a, b) {
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
