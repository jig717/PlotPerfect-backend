const ALLOWED_LISTING_TYPES = ["For Sale", "For Rent", "PG", "Lease"];
const ALLOWED_BHK = ["1", "2", "3", "4+"];

const LISTING_TYPE_KEYWORDS = {
  "for sale": "For Sale",
  sale: "For Sale",
  buy: "For Sale",
  "for rent": "For Rent",
  rent: "For Rent",
  rental: "For Rent",
  pg: "PG",
  "paying guest": "PG",
  lease: "Lease",
};

const PROPERTY_TYPE_KEYWORDS = {
  apartment: "Apartment",
  flat: "Apartment",
  house: "House",
  villa: "Villa",
  plot: "Plot",
  pg: "PG",
  commercial: "Commercial",
  office: "Office",
  farmhouse: "Farmhouse",
};

const KNOWN_CITIES = [
  "Ahmedabad",
  "Mumbai",
  "Delhi",
  "Delhi NCR",
  "Bangalore",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
];

const numberRegex = /(\d+(?:\.\d+)?)\s*(k|l|lac|lakh|cr|crore)?/i;

const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.toLowerCase().replace(/[, ]+/g, "");
  const match = cleaned.match(numberRegex);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = match[2];
  if (!unit) return Math.round(base);
  if (unit === "k") return Math.round(base * 1000);
  if (unit === "l" || unit === "lac" || unit === "lakh") return Math.round(base * 100000);
  if (unit === "cr" || unit === "crore") return Math.round(base * 10000000);
  return Math.round(base);
};

const normalizeListingType = (input) => {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (LISTING_TYPE_KEYWORDS[value]) return LISTING_TYPE_KEYWORDS[value];

  const matched = Object.entries(LISTING_TYPE_KEYWORDS).find(([keyword]) => value.includes(keyword));
  return matched ? matched[1] : null;
};

const normalizePropertyType = (input) => {
  if (!input) return null;
  const value = String(input).trim().toLowerCase();
  if (PROPERTY_TYPE_KEYWORDS[value]) return PROPERTY_TYPE_KEYWORDS[value];

  const matched = Object.entries(PROPERTY_TYPE_KEYWORDS).find(([keyword]) => value.includes(keyword));
  return matched ? matched[1] : null;
};

const normalizeBhk = (input) => {
  if (!input && input !== 0) return null;
  const value = String(input).trim().toLowerCase();

  if (value === "4+" || value === "4+bhk" || value === "4 + bhk") return "4+";
  const matched = value.match(/([1-4])\s*\+?\s*bhk?/i);
  if (matched) {
    if (matched[1] === "4" && value.includes("+")) return "4+";
    return matched[1];
  }

  if (["1", "2", "3"].includes(value)) return value;
  if (value === "4") return "4";
  return null;
};

const parseCityFromText = (text) => {
  const lowered = text.toLowerCase();
  const matchedKnownCity = KNOWN_CITIES.find((city) => lowered.includes(city.toLowerCase()));
  if (matchedKnownCity) return matchedKnownCity;

  const inMatch = lowered.match(/\bin\s+([a-z ]{2,})/i);
  if (!inMatch) return null;
  return inMatch[1]
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const parsePriceRange = (value) => {
  if (!value && value !== 0) return null;
  if (Array.isArray(value) && value.length === 2) {
    const min = toNumber(value[0]);
    const max = toNumber(value[1]);
    if (min == null && max == null) return null;
    return { min, max };
  }
  if (typeof value === "object" && value !== null) {
    const min = toNumber(value.min);
    const max = toNumber(value.max);
    if (min == null && max == null) return null;
    return { min, max };
  }

  const text = String(value).toLowerCase().trim();
  const betweenMatch = text.match(/(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)/i);
  if (betweenMatch) {
    const min = toNumber(betweenMatch[1]);
    const max = toNumber(betweenMatch[2]);
    return { min, max };
  }

  if (text.startsWith("under") || text.startsWith("below")) {
    return { min: null, max: toNumber(text) };
  }
  if (text.startsWith("above") || text.startsWith("over")) {
    return { min: toNumber(text), max: null };
  }

  return null;
};

const parseBudgetFromText = (text) => {
  const lowered = text.toLowerCase();
  const underMatch = lowered.match(/\b(under|below|upto|up to|max)\s+(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)/i);
  if (underMatch) return { budget: toNumber(underMatch[2]), priceRange: null };

  const aboveMatch = lowered.match(/\b(above|over|min|minimum)\s+(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)/i);
  if (aboveMatch) return { budget: null, priceRange: { min: toNumber(aboveMatch[2]), max: null } };

  const betweenMatch = lowered.match(/\bbetween\s+(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)\s+(?:and|to)\s+(\d+(?:\.\d+)?\s*(?:k|l|lac|lakh|cr|crore)?)/i);
  if (betweenMatch) {
    return {
      budget: null,
      priceRange: {
        min: toNumber(betweenMatch[1]),
        max: toNumber(betweenMatch[2]),
      },
    };
  }

  return { budget: null, priceRange: null };
};

const parseFromText = (queryText) => {
  const text = String(queryText || "").trim();
  const lowered = text.toLowerCase();

  const listingType = normalizeListingType(lowered);
  const propertyType = normalizePropertyType(lowered);
  const city = parseCityFromText(text);

  let bhk = null;
  const bhkMatch = lowered.match(/\b([1-4])\s*\+?\s*bhk\b/i);
  if (bhkMatch) {
    bhk = bhkMatch[1] === "4" && lowered.includes("4+") ? "4+" : bhkMatch[1];
  }

  const { budget, priceRange } = parseBudgetFromText(text);

  return {
    listingType,
    city,
    propertyType: propertyType || (bhk ? "Apartment" : null),
    bhk,
    budget,
    priceRange,
    hasNearMe: lowered.includes("near me"),
    hasCheapKeyword: lowered.includes("cheap"),
  };
};

const normalizeFromObject = (input) => {
  const source = input || {};
  return {
    listingType: normalizeListingType(source.listingType || source.purpose || source.typeIntent),
    city: source.city ? String(source.city).trim() : null,
    propertyType: normalizePropertyType(source.propertyType || source.type),
    bhk: normalizeBhk(source.bhk),
    budget: toNumber(source.budget),
    priceRange: parsePriceRange(source.priceRange || source.range),
    hasNearMe: false,
    hasCheapKeyword: false,
  };
};

const mergeNormalizedFilters = (base, incoming) => ({
  listingType: incoming.listingType || base.listingType || null,
  city: incoming.city || base.city || null,
  propertyType: incoming.propertyType || base.propertyType || null,
  bhk: incoming.bhk || base.bhk || null,
  budget: incoming.budget ?? base.budget ?? null,
  priceRange: incoming.priceRange || base.priceRange || null,
  hasNearMe: Boolean(base.hasNearMe || incoming.hasNearMe),
  hasCheapKeyword: Boolean(base.hasCheapKeyword || incoming.hasCheapKeyword),
});

const validateFilters = (filters) => {
  const errors = [];
  const warnings = [];
  const clarifications = [];

  if (filters.listingType && !ALLOWED_LISTING_TYPES.includes(filters.listingType)) {
    errors.push("listingType must be one of: For Sale, For Rent, PG, Lease");
  }

  if (filters.bhk && !ALLOWED_BHK.includes(filters.bhk) && filters.bhk !== "4") {
    errors.push("bhk must be one of: 1, 2, 3, 4+");
  }

  if (filters.budget != null && !Number.isFinite(filters.budget)) {
    errors.push("budget must be numeric");
  }

  if (filters.priceRange) {
    const { min, max } = filters.priceRange;
    if (min != null && !Number.isFinite(min)) errors.push("priceRange.min must be numeric");
    if (max != null && !Number.isFinite(max)) errors.push("priceRange.max must be numeric");
    if (min != null && max != null && min > max) {
      errors.push("priceRange.min cannot be greater than priceRange.max");
    }
  }

  if (filters.hasNearMe && !filters.city) {
    clarifications.push("Please provide city for 'near me' search");
  }

  if (filters.hasCheapKeyword && filters.budget == null && !filters.priceRange) {
    clarifications.push("Please provide budget for 'cheap' search");
  }

  if (filters.budget != null && filters.priceRange?.min != null && filters.budget < filters.priceRange.min) {
    clarifications.push("Budget conflicts with priceRange minimum");
  }

  if (!filters.listingType && filters.budget != null && filters.budget <= 100000) {
    warnings.push("Inferred listingType as 'For Rent' from low budget input");
    filters.listingType = "For Rent";
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiresClarification: clarifications.length > 0,
    clarificationPrompts: clarifications,
  };
};

const addPriceRule = (query, rule) => {
  if (!rule) return;
  query.price = query.price || {};
  if (rule.$gte != null) query.price.$gte = rule.$gte;
  if (rule.$lte != null) query.price.$lte = rule.$lte;
};

const buildMongoQuery = (filters) => {
  const query = {};

  if (filters.city) {
    query["location.city"] = filters.city;
  }

  if (filters.propertyType) {
    query.type = filters.propertyType.toLowerCase();
  }

  if (filters.listingType) {
    if (filters.listingType === "For Sale") query.purpose = "sale";
    if (["For Rent", "PG", "Lease"].includes(filters.listingType)) query.purpose = "rent";
  }

  if (filters.bhk) {
    if (filters.bhk === "4+") query.bedrooms = { $gte: 4 };
    else if (filters.bhk === "4") query.bedrooms = 4;
    else query.bedrooms = Number(filters.bhk);
  }

  if (filters.budget != null) {
    addPriceRule(query, { $lte: filters.budget });
  }

  if (filters.priceRange) {
    addPriceRule(query, {
      $gte: filters.priceRange.min ?? undefined,
      $lte: filters.priceRange.max ?? undefined,
    });
  }

  return query;
};

const stripMetaFields = (filters) => ({
  listingType: filters.listingType,
  city: filters.city,
  propertyType: filters.propertyType,
  bhk: filters.bhk,
  budget: filters.budget,
  priceRange: filters.priceRange,
});

const handlePropertyFilterInput = (input) => {
  let normalized;

  if (typeof input === "string") {
    normalized = parseFromText(input);
  } else if (typeof input === "object" && input !== null) {
    const objectFilters = normalizeFromObject(input);
    const textFilters = input.queryText || input.query ? parseFromText(input.queryText || input.query) : {};
    normalized = mergeNormalizedFilters(objectFilters, textFilters);
  } else {
    normalized = normalizeFromObject({});
  }

  if (!normalized.bhk) {
    normalized.bhk = normalizeBhk(input?.bhk);
  }

  const validation = validateFilters(normalized);
  const query = validation.isValid ? buildMongoQuery(normalized) : {};

  return {
    filters: stripMetaFields(normalized),
    query,
    validation,
  };
};

// Example usage:
// const result = handlePropertyFilterInput("2BHK in Ahmedabad under 15000");
// console.log(result.filters, result.query, result.validation);

module.exports = {
  ALLOWED_LISTING_TYPES,
  ALLOWED_BHK,
  parseFromText,
  normalizeFromObject,
  validateFilters,
  buildMongoQuery,
  handlePropertyFilterInput,
};
