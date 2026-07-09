const normalizeImageValue = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => item.toString().trim()).filter(Boolean);
  }
  return [value.toString().trim()].filter(Boolean);
};

const uniqueImages = (items = []) => [...new Set(items.filter(Boolean))];
const normalizeAmenities = (value) => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => toTrimmedString(item)).filter(Boolean))];
};

const toTrimmedString = (value) => {
  if (value == null) return "";
  return value.toString().trim();
};

const buildFloorPlans = (property = {}, fallbackImage = "") => {
  if (Array.isArray(property.floorPlans) && property.floorPlans.length > 0) {
    return property.floorPlans
      .filter((plan) => plan && typeof plan === "object")
      .map((plan, index) => {
        const image = toTrimmedString(plan.image) || fallbackImage;
        const title =
          toTrimmedString(plan.title) ||
          toTrimmedString(plan.label) ||
          `${property.bedrooms ?? property.bhk ?? ""} BHK`.trim() ||
          `Floor Plan ${index + 1}`;
        const area = toTrimmedString(plan.area) || toTrimmedString(property.area);
        const carpetArea =
          toTrimmedString(plan.carpetArea) ||
          `${property.bedrooms ?? property.bhk ?? ""} BHK`.trim();

        return {
          ...plan,
          title,
          label: toTrimmedString(plan.label) || title,
          area,
          carpetArea,
          price: plan.price ?? property.price ?? null,
          possession: toTrimmedString(plan.possession),
          launchStatus: toTrimmedString(plan.launchStatus),
          image,
          imageAlt:
            toTrimmedString(plan.imageAlt) ||
            `${title} floor plan`.trim(),
          beds: plan.beds ?? property.bedrooms ?? property.bhk ?? null,
          baths: plan.baths ?? property.bathrooms ?? property.baths ?? null,
        };
      });
  }

  const fallbackTitle = `${property.bedrooms ?? property.bhk ?? ""} BHK`.trim();
  if (!fallbackTitle && !property.area && property.price == null && !fallbackImage) {
    return [];
  }

  return [
    {
      title: fallbackTitle || "Floor Plan",
      label: fallbackTitle || "Floor Plan",
      area: toTrimmedString(property.area),
      carpetArea: fallbackTitle,
      price: property.price ?? null,
      possession: "",
      launchStatus: property.status === "PENDING" ? "New Launch" : "",
      image: fallbackImage,
      imageAlt: `${fallbackTitle || "Property"} floor plan`,
      beds: property.bedrooms ?? property.bhk ?? null,
      baths: property.bathrooms ?? property.baths ?? null,
    },
  ];
};

const getRelativeTimeFromNow = (dateValue) => {
  if (!dateValue) return "";

  const timestamp = new Date(dateValue).getTime();
  if (Number.isNaN(timestamp)) return "";

  const diffMs = Date.now() - timestamp;
  const future = diffMs < 0;
  const absMs = Math.abs(diffMs);

  const units = [
    { label: "year", ms: 365 * 24 * 60 * 60 * 1000 },
    { label: "month", ms: 30 * 24 * 60 * 60 * 1000 },
    { label: "day", ms: 24 * 60 * 60 * 1000 },
    { label: "hour", ms: 60 * 60 * 1000 },
    { label: "minute", ms: 60 * 1000 },
  ];

  for (const unit of units) {
    if (absMs >= unit.ms) {
      const value = Math.floor(absMs / unit.ms);
      return future
        ? `in ${value} ${unit.label}${value > 1 ? "s" : ""}`
        : `${value} ${unit.label}${value > 1 ? "s" : ""} ago`;
    }
  }

  return future ? "in a few seconds" : "just now";
};

const getListingLabel = (property = {}) => {
  const purpose = (property.purpose || "").toString().toUpperCase();
  if (property.status === "BOOKED") return "BOOKED";
  if (purpose === "SALE") return "FOR SALE";
  if (purpose === "RENT") return "FOR RENT";
  if (purpose === "PG") return "PG";
  return property.status === "RENTED" ? "RENTED" : "LISTED";
};

const canUseFullPayment = (property = {}) => {
  const purpose = (property.purpose || "").toString().toLowerCase();
  const type = (property.type || property.propertyType || "").toString().toLowerCase();
  return ["rent", "pg"].includes(purpose) || ["plot", "commercial", "pg"].includes(type);
};

const canUseAdvancePayment = (property = {}) => {
  const purpose = (property.purpose || "").toString().toLowerCase();
  return purpose === "sale";
};

const serializeProperty = (propertyDoc) => {
  if (!propertyDoc) return null;

  const property = typeof propertyDoc.toObject === "function" ? propertyDoc.toObject() : { ...propertyDoc };
  const galleryImages = uniqueImages(normalizeImageValue(property.images));
  const primaryImage = galleryImages[0] || "";
  const listedAt = property.createdAt || null;
  const updatedAt = property.updatedAt || property.createdAt || null;
  const city = property?.location?.city || property.city || "";
  const locality = property?.location?.address || property.locality || "";
  const state = property?.location?.state || property.state || "";
  const purpose = (property.purpose || property.listingType || "").toString().toLowerCase();
  const type = (property.type || property.propertyType || "").toString().toLowerCase();
  const bedrooms = property.bedrooms ?? property.bhk ?? null;
  const bathrooms = property.bathrooms ?? property.baths ?? null;
  const guestCapacity = property.guestCapacity ?? property.guests ?? property.capacity ?? null;
  const floorPlans = buildFloorPlans(property, primaryImage);
  const amenities = normalizeAmenities(property.amenities);

  return {
    ...property,
    id: property._id ? property._id.toString() : null,
    images: galleryImages,
    primaryImage,
    coverImage: primaryImage,
    listingType: purpose,
    propertyType: type,
    city,
    locality,
    state,
    bhk: bedrooms,
    baths: bathrooms,
    guests: guestCapacity,
    capacity: guestCapacity,
    guestCapacity,
    amenities,
    floorPlans,
    listingLabel: getListingLabel(property),
    isBooked: property.status === "BOOKED",
    canUseFullPayment: canUseFullPayment(property),
    canUseAdvancePayment: canUseAdvancePayment(property),
    listedAt,
    updatedAt,
    listedSince: getRelativeTimeFromNow(listedAt),
    lastUpdatedSince: getRelativeTimeFromNow(updatedAt),
  };
};

module.exports = {
  serializeProperty,
  getRelativeTimeFromNow,
  uniqueImages,
  normalizeImageValue,
};
