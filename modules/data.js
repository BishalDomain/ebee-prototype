export const db = {
  grocery: [
    { id: "g1", name: "Milk", unit: "litre", price: 32, meta: "Daily Fresh", aliases: ["milk"] },
    { id: "g2", name: "Bread", unit: "loaf", price: 38, meta: "Brown Bake", aliases: ["bread", "loaf"] },
    { id: "g3", name: "Eggs", unit: "pieces", price: 8, meta: "Country Eggs", aliases: ["egg", "eggs"] },
    { id: "g4", name: "Chicken", unit: "kg", price: 260, meta: "Fresh Farm", aliases: ["chicken"] },
    { id: "g5", name: "Rice", unit: "kg", price: 74, meta: "Premium Select", aliases: ["rice"] },
    { id: "g6", name: "Potato", unit: "kg", price: 26, meta: "Farm Fresh", aliases: ["potato", "potatoes"] },
    { id: "g7", name: "Cooking Oil", unit: "litre", price: 155, meta: "Sunflower", aliases: ["oil", "cooking oil"] },
    { id: "g8", name: "Maida", unit: "kg", price: 52, meta: "Fine Flour", aliases: ["maida", "flour"] },
    { id: "g9", name: "Basmati Rice", unit: "kg", price: 120, meta: "Long Grain", aliases: ["basmati rice", "basmati"] },
    { id: "g10", name: "Curd", unit: "kg", price: 70, meta: "Fresh Dairy", aliases: ["curd", "yogurt", "dahi"] },
    { id: "g11", name: "Onion", unit: "kg", price: 34, meta: "Fresh Red Onion", aliases: ["onion", "onions"] },
    { id: "g12", name: "Tomato", unit: "kg", price: 30, meta: "Fresh Tomato", aliases: ["tomato", "tomatoes"] },
    { id: "g13", name: "Ginger Garlic Paste", unit: "jar", price: 85, meta: "Kitchen Essentials", aliases: ["ginger garlic paste", "paste"] },
    { id: "g14", name: "Biryani Masala", unit: "pack", price: 65, meta: "Spice Blend", aliases: ["biryani masala", "masala"] },
    { id: "g15", name: "Chicken Pieces", unit: "kg", price: 280, meta: "Curry Cut", aliases: ["chicken pieces", "chicken curry cut"] },
    { id: "g16", name: "Coriander", unit: "bunch", price: 18, meta: "Fresh Herbs", aliases: ["coriander", "dhania"] },
    { id: "g17", name: "Mint", unit: "bunch", price: 20, meta: "Fresh Mint", aliases: ["mint", "pudina"] },
    { id: "g18", name: "Mutton", unit: "kg", price: 640, meta: "Fresh cut", aliases: ["mutton"] },
    { id: "g19", name: "Pork", unit: "kg", price: 420, meta: "Fresh cut", aliases: ["pork"] },
    { id: "g20", name: "Lamb", unit: "kg", price: 690, meta: "Fresh cut", aliases: ["lamb"] },
    { id: "g21", name: "Detergent", unit: "pack", price: 110, meta: "Home care", aliases: ["detergent", "washing powder"] },
    { id: "g22", name: "Parle-G Biscuits", unit: "pack", price: 10, meta: "Tea-time biscuits", aliases: ["parle g", "parle-g", "biscuit", "biscuits", "parle g biscuits"] },
    { id: "g23", name: "Honey", unit: "jar", price: 185, meta: "500 gm jar", aliases: ["honey", "honey jar"] },
  ],
  food: [
    { id: "f1", name: "Veg Burger", unit: "plate", price: 120, meta: "Urban Bites", aliases: ["veg burger", "burger"] },
    { id: "f2", name: "Fries", unit: "box", price: 90, meta: "Urban Bites", aliases: ["fries", "french fries"] },
    { id: "f3", name: "Paneer Wrap", unit: "plate", price: 150, meta: "Street Leaf", aliases: ["paneer wrap", "wrap"] },
    { id: "f4", name: "Chicken Biryani", unit: "box", price: 240, meta: "Spice Route", aliases: ["chicken biryani", "biryani"] },
    { id: "f5", name: "Coke", unit: "bottle", price: 55, meta: "750 ml chilled bottle", aliases: ["coke", "coca cola", "cola"] },
    { id: "f6", name: "Potato Chips", unit: "pack", price: 20, meta: "Classic salted", aliases: ["potato chips", "chips", "lays"] },
    { id: "f7", name: "Pizza", unit: "box", price: 299, meta: "Medium size", aliases: ["pizza", "medium pizza", "pizza medium size"] },
    { id: "f8", name: "Mutton Curry", unit: "box", price: 320, meta: "Slow-cooked curry", aliases: ["mutton curry"] },
    { id: "f9", name: "Chicken Curry", unit: "box", price: 260, meta: "Home-style curry", aliases: ["chicken curry"] },
    { id: "f10", name: "Pork Chop", unit: "plate", price: 340, meta: "Grilled plate", aliases: ["pork chop", "pork chops"] },
  ],
  fruits: [
    { id: "fr1", name: "Apples", unit: "kg", price: 140, meta: "Red apples", aliases: ["apple", "apples"] },
    { id: "fr2", name: "Bananas", unit: "dozen", price: 68, meta: "Robusta", aliases: ["banana", "bananas"] },
    { id: "fr3", name: "Oranges", unit: "kg", price: 110, meta: "Nagpur", aliases: ["orange", "oranges"] },
    { id: "fr4", name: "Mixed Fruit Basket", unit: "basket", price: 499, meta: "Curated basket", aliases: ["basket", "fruit basket", "mixed fruit basket"] },
  ],
};

export const supportedRideLocations = ["bhubaneswar", "cuttack", "puri", "sambalpur", "berhampur", "rourkela"];

export const odishaRideAreas = {
  bhubaneswar: ["Patia", "Jaydev Vihar", "Saheed Nagar", "Khandagiri", "Old Town"],
  cuttack: ["Badambadi", "Link Road", "College Square", "CDA Sector 9", "Tulsipur"],
  puri: ["Puri Beach", "Grand Road", "Baliapanda", "Sea Beach Road", "Station Area"],
  sambalpur: ["Ainthapali", "Bareipali", "Budharaja", "Dhanupali", "Modipara"],
  berhampur: ["Aska Road", "Courtpeta", "Annapurna Market", "Lanji Palli", "Gopalpur Road"],
  rourkela: ["Udit Nagar", "Civil Township", "Panposh", "Chhend", "Sector 19"],
};

export const localRecipePlans = {
  biryani: {
    title: "Chicken Biryani",
    moodReply: "That sounds like a great plan. I can add the core ingredients to your cart so you can edit them after that.",
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
  },
  pulao: {
    title: "Veg Pulao",
    moodReply: "Nice choice. I can prepare a clean veg pulao ingredient set and you can still adjust quantities afterward.",
    ingredients: [
      { name: "Basmati Rice", quantity: 1, unit: "kg" },
      { name: "Onion", quantity: 0.5, unit: "kg" },
      { name: "Tomato", quantity: 0.5, unit: "kg" },
      { name: "Cooking Oil", quantity: 1, unit: "litre" },
      { name: "Coriander", quantity: 1, unit: "bunch" },
      { name: "Mint", quantity: 1, unit: "bunch" },
    ],
  },
  "fish curry": {
    title: "Fish Curry",
    moodReply: "Nice choice. I can help prepare a fish curry ingredient base and you can still edit the list before checkout.",
    ingredients: [
      { name: "Onion", quantity: 0.5, unit: "kg" },
      { name: "Tomato", quantity: 0.5, unit: "kg" },
      { name: "Cooking Oil", quantity: 1, unit: "litre" },
      { name: "Coriander", quantity: 1, unit: "bunch" },
    ],
  },
};
