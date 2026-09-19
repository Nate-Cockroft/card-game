export const STATS = ["health", "speed", "attack", "defense"];

export const STAT_LABELS = {
  health: "Health",
  speed: "Speed",
  attack: "Attack",
  defense: "Defense",
};

export const HAND_SIZE = 7;
export const MAX_PLAYERS = 6;

// 52 creature cards with 4 stats each.
const CARD_TEMPLATES = [
  ["Ember Dragon", "🐉"],
  ["Frost Drake", "🐲"],
  ["Storm Lion", "🦁"],
  ["Shadow Wolf", "🐺"],
  ["Sky Eagle", "🦅"],
  ["Venom Serpent", "🐍"],
  ["Sand Scorpion", "🦂"],
  ["Tide Shark", "🦈"],
  ["Jungle Tiger", "🐅"],
  ["Iron Gorilla", "🦍"],
  ["Mire Croc", "🐊"],
  ["Night Bat", "🦇"],
  ["Crag Boar", "🐗"],
  ["Thorn Fox", "🦊"],
  ["Meadow Bear", "🐻"],
  ["Pale Panther", "🐆"],
  ["Ancient Mammoth", "🦣"],
  ["Blaze Rhino", "🦏"],
  ["Swift Owl", "🦉"],
  ["Prism Peacock", "🦚"],
  ["Coral Crab", "🦀"],
  ["Deep Kraken", "🦑"],
  ["Jade Tortoise", "🐢"],
  ["Crown Eagle", "🦤"],
  ["Fang Viper", "🐍"],
  ["Hollow Wraith", "💀"],
  ["Arcane Imp", "👿"],
  ["Spirit Deer", "🦌"],
  ["Desert Camel", "🐫"],
  ["Thunder Ram", "🐏"],
  ["Swift Hare", "🐇"],
  ["Plains Horse", "🐎"],
  ["Moss Frog", "🐸"],
  ["Crystal Beetle", "🐞"],
  ["Wishing Koi", "🐠"],
  ["Lava Salamander", "🦎"],
  ["Moon Moth", "🦋"],
  ["Rift Goat", "🐐"],
  ["Bramble Hedgehog", "🦔"],
  ["Gale Cockatrice", "🐓"],
  ["Rust Golem", "🗿"],
  ["Vine Mantis", "🦗"],
  ["Honey Stinger", "🐝"],
  ["Bog Lurker", "🐊"],
  ["Sickle Scythe", "🪦"],
  ["Ink Cuttlefish", "🐙"],
  ["Storm Dolphin", "🐬"],
  ["Echo Stag", "🦌"],
  ["Phoenix Ash", "🔥"],
  ["Basalt Wyrm", "🪨"],
  ["Frost Hare", "🐇"],
  ["Copper Seraph", "😇"],
  ["Ancient Tree", "🌳"],
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