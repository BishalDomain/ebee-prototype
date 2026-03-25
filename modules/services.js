export async function maybePolishResponse(text, context) {
  try {
    const response = await fetch("/api/assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, context }),
    });

    if (!response.ok) return text;
    const payload = await response.json();
    return payload.text || text;
  } catch {
    return text;
  }
}

export async function fetchRecipePlan(mealName, localRecipePlans, titleCase) {
  try {
    const response = await fetch(`/api/recipe?meal=${encodeURIComponent(mealName)}`);
    if (response.ok) {
      const payload = await response.json();
      if (payload) return payload;
    }
  } catch {
    // Fall back to local curated recipe plans.
  }

  return localRecipePlans[mealName] || {
    title: titleCase(mealName),
    moodReply: `That sounds good. I can try building the ingredient list for ${titleCase(mealName)}, and you can edit anything that feels off.`,
    ingredients: [],
  };
}
