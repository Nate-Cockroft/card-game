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

// The absurd roster. Each card is [name, emoji, packId]; stats seed from the
// card NAME, so list order never changes existing cards' stats.
export const PACKS = [
  { id: "space", label: "Space & Science", emoji: "🚀" },
  { id: "politicians", label: "Politicians", emoji: "🏛️" },
  { id: "religion", label: "Religion", emoji: "⛪" },
  { id: "places", label: "Countries & Places", emoji: "🌍" },
  { id: "internet", label: "Internet", emoji: "🌐" },
  { id: "gaming", label: "Gaming", emoji: "🎮" },
  { id: "food", label: "Food & Drink", emoji: "🌮" },
  { id: "creatures", label: "Creatures & Body", emoji: "🐾" },
  { id: "home", label: "Home & Objects", emoji: "🏠" },
  { id: "colors", label: "Colors", emoji: "🎨" },
  { id: "numbers", label: "Numbers", emoji: "🔢" },
  { id: "economy", label: "Concepts & Economy", emoji: "💰" },
  { id: "people", label: "People", emoji: "👤" },
];

const S = (id) => id;
const CARD_TEMPLATES = [
  ["Mercury", "⚫", S("space")],
  ["Venus", "🟡", S("space")],
  ["Earth", "🌍", S("space")],
  ["Mars", "🔴", S("space")],
  ["Jupiter", "🟠", S("space")],
  ["Saturn", "🪐", S("space")],
  ["Uranus", "🟦", S("space")],
  ["Neptune", "🔵", S("space")],
  ["The Moon", "🌕", S("space")],
  ["The Sun", "☀️", S("space")],
  ["Donald Trump", "🍊", S("politicians")],
  ["A Refrigerator", "🧊", S("home")],
  ["Karl Marx", "📕", S("politicians")],
  ["Charlie Kirk", "🎙️", S("politicians")],
  ["Skateboard", "🛹", S("home")],
  ["Angel", "👼", S("religion")],
  ["Jesus", "✝️", S("religion")],
  ["Israel", "🇮🇱", S("places")],
  ["Nuclear Bomb", "☢️", S("economy")],
  ["Josef Stalin", "🚜", S("politicians")],
  ["Pepsi", "🥤", S("food")],
  ["Coke", "🥤", S("food")],
  ["Reddit", "👽", S("internet")],
  ["Discord", "💬", S("internet")],
  ["Communism", "🚩", S("economy")],
  ["Capitalism", "💰", S("economy")],
  ["Little Saint James", "🏝️", S("places")],
  ["Peoples Republic of China", "🇨🇳", S("places")],
  ["United States of America", "🇺🇸", S("places")],
  ["Schizophrenia", "🧠", S("creatures")],
  ["Chair", "🪑", S("home")],
  ["Kitchen", "🍳", S("home")],
  ["Living Room", "🛋️", S("home")],
  ["Time", "⏰", S("economy")],
  ["Space", "🌌", S("space")],
  ["Gender", "🚻", S("creatures")],
  ["Arms", "💪", S("creatures")],
  ["Legs", "🦵", S("creatures")],
  ["Pokemon", "⚡", S("gaming")],
  ["Red", "🔴", S("colors")],
  ["Blue", "🔵", S("colors")],
  ["Green", "🟢", S("colors")],
  ["Brown", "🟤", S("colors")],
  ["Black", "⚫", S("colors")],
  ["White", "⚪", S("colors")],
  ["Dragon", "🐉", S("creatures")],
  ["Human", "🧍", S("creatures")],
  ["Sheep", "🐑", S("creatures")],
  ["Dog", "🐶", S("creatures")],
  ["Cat", "🐱", S("creatures")],
  ["Lizard", "🦎", S("creatures")],
  ["Tacos", "🌮", S("food")],
  ["Roblox", "🧱", S("gaming")],
  ["Flowers", "💐", S("creatures")],
  ["Grandmothers", "👵", S("creatures")],
  ["Pluto", "🪐", S("space")],
  ["Electoral College", "🗳️", S("economy")],
  ["Student Debt Crisis", "🎓", S("economy")],
  ["2008 Financial Crisis", "📉", S("economy")],
  ["New York", "🗽", S("places")],
  ["Alabama", "🏈", S("places")],
  ["Washington D.C.", "🏛️", S("places")],
  ["Napoleon", "🥐", S("politicians")],
  ["Atlantis", "🌊", S("places")],
  ["Schrodinger's Cat", "📦", S("space")],
  ["Moses", "📜", S("religion")],
  ["Ohio", "🏞️", S("places")],
  ["Rick Roll", "🎵", S("internet")],
  ["Appendix", "😄", S("creatures")],
  ["Lungs", "🫁", S("creatures")],
  ["Mouth", "👄", S("creatures")],
  ["Plastic", "🧴", S("home")],
  ["Neutron", "⚛️", S("space")],
  ["Proton", "⚛️", S("space")],
  ["Electron", "⚛️", S("space")],
  ["67", "6️⃣7️⃣", S("numbers")],
  ["69", "6️⃣9️⃣", S("numbers")],
  ["420", "4️⃣2️⃣0️⃣", S("numbers")],
  ["Empire of Brazil", "🇧🇷", S("places")],
  ["Croatia", "🇭🇷", S("places")],
  ["Miss Evans", "👩‍🏫", S("people")],
  ["Mr Riley", "🧑‍🏫", S("people")],
  ["Kier Starmer", "🌹", S("politicians")],
  ["AK47", "🔫", S("economy")],
  ["F22 Raptor", "✈️", S("economy")],
  ["Washing Machine", "🌀", S("home")],
  ["Banhammer Phighting", "🔨", S("gaming")],
  ["Zelda", "🔺", S("gaming")],
  ["Steve Minecraft", "🟩", S("gaming")],
  ["chatGPT", "🤖", S("internet")],
  ["Hell", "🔥", S("religion")],
  ["Heaven", "☁️", S("religion")],
  ["Religion", "⛪", S("religion")],
  ["Area 51", "🛸", S("places")],
  ["Gas Prices", "⛽", S("economy")],
  ["Twitter", "🐦", S("internet")],
  ["The Concept of Death", "💀", S("economy")],
  ["Hot Dog Water", "🌭", S("food")],
  ["The Void", "🕳️", S("space")],
  ["An Existential Crisis", "🤯", S("economy")],
  ["Procrastination", "🛌", S("economy")],
  ["Terms & Conditions", "📄", S("economy")],
  ["Monday", "📅", S("economy")],
  ["A Parking Space", "🅿️", S("economy")],
  ["The Illuminati", "👁️", S("economy")],
  ["Free WiFi", "📶", S("internet")],
  ["Angela Merkel", "🇩🇪", S("politicians")],
  ["Vladimir Putin", "🧊", S("politicians")],
  ["Joe Biden", "😎", S("politicians")],
  ["Barack Obama", "🎙️", S("politicians")],
  ["Kamala Harris", "🧂", S("politicians")],
  ["Xi Jinping", "🧧", S("politicians")],
  ["Kim Jong-un", "🎩", S("politicians")],
  ["Margaret Thatcher", "👛", S("politicians")],
  ["Winston Churchill", "🎖️", S("politicians")],
  ["Abraham Lincoln", "🪓", S("politicians")],
  ["George Washington", "⚓", S("politicians")],
  ["Mao Zedong", "🌾", S("politicians")],
  ["Mahatma Gandhi", "🕉️", S("politicians")],
  ["Queen Elizabeth II", "👑", S("politicians")],
  ["Volodymyr Zelensky", "🍇", S("politicians")],
  ["Justin Trudeau", "🧦", S("politicians")],
  ["Fidel Castro", "🚬", S("politicians")],
  ["The Pope", "🛐", S("religion")],
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

export function createDeck(enabledPacks = null) {
  // enabledPacks: null => all packs; otherwise an array of pack ids.
  const keep = enabledPacks === null ? null : new Set(enabledPacks);
  return CARD_TEMPLATES.filter(([, , pack]) => keep === null || keep.has(pack)).map(
    ([name, emoji], idx) => {
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
    }
  );
}

export function packSize(packId) {
  return CARD_TEMPLATES.filter(([, , pack]) => pack === packId).length;
}

export function validPackIds(ids) {
  const known = new Set(PACKS.map((p) => p.id));
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= known.size &&
    ids.every((id) => known.has(id)) &&
    new Set(ids).size === ids.length
  );
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