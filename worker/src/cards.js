export const STATS = ["health", "speed", "attack", "defense"];

export const STAT_LABELS = {
  health: "Health",
  speed: "Speed",
  attack: "Attack",
  defense: "Defense",
};

export const DEFAULT_HAND_SIZE = 7;
export const MIN_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 9;
export const DEFAULT_MAX_PLAYERS = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

// The absurd-only roster. Stats seed from the card NAME, so list order
// never changes existing cards' stats. Deck is intentionally small: games
// that ask for more cards than exist get a clear "Deck too small" error.
const CARD_TEMPLATES = [
  ["Mercury", "⚫"],
  ["Venus", "🟡"],
  ["Earth", "🌍"],
  ["Mars", "🔴"],
  ["Jupiter", "🟠"],
  ["Saturn", "🪐"],
  ["Uranus", "🟦"],
  ["Neptune", "🔵"],
  ["The Moon", "🌕"],
  ["The Sun", "☀️"],
  ["Donald Trump", "🍊"],
  ["A Refrigerator", "🧊"],
  ["Karl Marx", "📕"],
  ["Charlie Kirk", "🎙️"],
  ["Skateboard", "🛹"],
  ["Angel", "👼"],
  ["Jesus", "✝️"],
  ["Israel", "🇮🇱"],
  ["Nuclear Bomb", "☢️"],
  ["Josef Stalin", "🚜"],
  ["Pepsi", "🥤"],
  ["Coke", "🥤"],
  ["Reddit", "👽"],
  ["Discord", "💬"],
  ["Communism", "🚩"],
  ["Capitalism", "💰"],
  ["Little Saint James", "🏝️"],
  ["Peoples Republic of China", "🇨🇳"],
  ["United States of America", "🇺🇸"],
  ["Schizophrenia", "🧠"],
  ["Chair", "🪑"],
  ["Kitchen", "🍳"],
  ["Living Room", "🛋️"],
  ["Time", "⏰"],
  ["Space", "🌌"],
  ["Gender", "🚻"],
  ["Arms", "💪"],
  ["Legs", "🦵"],
  ["Pokemon", "⚡"],
  ["Red", "🔴"],
  ["Blue", "🔵"],
  ["Green", "🟢"],
  ["Brown", "🟤"],
  ["Black", "⚫"],
  ["White", "⚪"],
  ["Dragon", "🐉"],
  ["Human", "🧍"],
  ["Sheep", "🐑"],
  ["Dog", "🐶"],
  ["Cat", "🐱"],
  ["Lizard", "🦎"],
  ["Tacos", "🌮"],
  ["Roblox", "🧱"],
  ["Flowers", "💐"],
  ["Grandmothers", "👵"],
  ["Pluto", "🪐"],
  ["Electoral College", "🗳️"],
  ["Student Debt Crisis", "🎓"],
  ["2008 Financial Crisis", "📉"],
  ["New York", "🗽"],
  ["Alabama", "🏈"],
  ["Washington D.C.", "🏛️"],
  ["Napoleon", "🥐"],
  ["Atlantis", "🌊"],
  ["Schrodinger's Cat", "📦"],
  ["Moses", "📜"],
  ["Ohio", "🏞️"],
  ["Rick Roll", "🎵"],
  ["Appendix", "😄"],
  ["Lungs", "🫁"],
  ["Mouth", "👄"],
  ["Plastic", "🧴"],
  ["Neutron", "⚛️"],
  ["Proton", "⚛️"],
  ["Electron", "⚛️"],
  ["67", "6️⃣7️⃣"],
  ["69", "6️⃣9️⃣"],
  ["420", "4️⃣2️⃣0️⃣"],
  ["Empire of Brazil", "🇧🇷"],
  ["Croatia", "🇭🇷"],
  ["Miss Evans", "👩‍🏫"],
  ["Mr Riley", "🧑‍🏫"],
  ["Kier Starmer", "🌹"],
  ["AK47", "🔫"],
  ["F22 Raptor", "✈️"],
  ["Washing Machine", "🌀"],
  ["Banhammer Phighting", "🔨"],
  ["Zelda", "🔺"],
  ["Steve Minecraft", "🟩"],
  ["chatGPT", "🤖"],
  ["Hell", "🔥"],
  ["Heaven", "☁️"],
  ["Religion", "⛪"],
  ["Area 51", "🛸"],
  ["Gas Prices", "⛽"],
  ["Twitter", "🐦"],
  ["The Concept of Death", "💀"],
  ["Hot Dog Water", "🌭"],
  ["The Void", "🕳️"],
  ["An Existential Crisis", "🤯"],
  ["Procrastination", "🛌"],
  ["Terms & Conditions", "📄"],
  ["Monday", "📅"],
  ["A Parking Space", "🅿️"],
  ["The Illuminati", "👁️"],
  ["Free WiFi", "📶"],
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rint(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function createDeck() {
  return CARD_TEMPLATES.map(([name, emoji], idx) => {
    // Seed from the card NAME, not its index, so adding/removing cards
    // elsewhere in the list never changes existing cards' stats.
    const rng = mulberry32(hashString(name));
    return {
      id: idx,
      name,
      emoji,
      health: rint(rng, 0, 1000),
      speed: rint(rng, 0, 1000),
      attack: rint(rng, 0, 1000),
      defense: rint(rng, 0, 1000),
    };
  });
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function randomCode() {
  // returns a random 5-letter room code from an unambiguous alphabet
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function isStat(s) {
  return STATS.includes(s);
}