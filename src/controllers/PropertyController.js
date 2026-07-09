const mongoose = require('mongoose'); 
const Property = require("../models/PropertyModel");
const View = require("../models/ViewModel");
const { handlePropertyFilterInput } = require("../utilis/propertyFilterHandler");
const { emitPropertyEvent, propertyEvents } = require("../utilis/propertyEvents");
const { serializeProperty } = require("../utilis/propertyResponse");

const sendPropertyError = (res, fallbackMessage, error) => {
    const statusCode = error?.name === "ValidationError" || error?.name === "CastError" ? 400 : 500;
    return res.status(statusCode).json({
        message: fallbackMessage,
        error: error.message
    });
};

const normalizePropertyPayload = (payload = {}) => {
    const normalized = { ...payload };

    const purpose = payload.purpose || payload.listingType;
    if (typeof purpose === "string") {
        normalized.purpose = purpose.trim().toLowerCase();
    }

    const propertyType = payload.type || payload.propertyType;
    if (typeof propertyType === "string") {
        normalized.type = propertyType.trim().toLowerCase();
    }

    const nextLocation = { ...(payload.location || {}) };
    if (typeof payload.city === "string" && payload.city.trim()) {
        nextLocation.city = payload.city.trim();
    }
    if (typeof payload.state === "string" && payload.state.trim()) {
        nextLocation.state = payload.state.trim();
    }
    if (typeof payload.locality === "string" && payload.locality.trim()) {
        nextLocation.address = payload.locality.trim();
    }
    if (typeof payload.address === "string" && payload.address.trim()) {
        nextLocation.address = payload.address.trim();
    }
    if (Object.keys(nextLocation).length > 0) {
        normalized.location = nextLocation;
    }

    if (payload.bhk != null && normalized.bedrooms == null) {
        normalized.bedrooms = payload.bhk;
    }
    if (payload.baths != null && normalized.bathrooms == null) {
        normalized.bathrooms = payload.baths;
    }
    if (payload.guests != null && normalized.guestCapacity == null) {
        normalized.guestCapacity = payload.guests;
    }
    if (payload.capacity != null && normalized.guestCapacity == null) {
        normalized.guestCapacity = payload.capacity;
    }
    if (payload.maxGuests != null && normalized.guestCapacity == null) {
        normalized.guestCapacity = payload.maxGuests;
    }

    if (Array.isArray(payload.floorPlans)) {
        normalized.floorPlans = payload.floorPlans
            .filter((plan) => plan && typeof plan === "object")
            .map((plan) => ({
                ...plan,
                title: typeof plan.title === "string" ? plan.title.trim() : undefined,
                label: typeof plan.label === "string" ? plan.label.trim() : undefined,
                area: plan.area != null ? String(plan.area).trim() : undefined,
                carpetArea: plan.carpetArea != null ? String(plan.carpetArea).trim() : undefined,
                possession: typeof plan.possession === "string" ? plan.possession.trim() : undefined,
                launchStatus: typeof plan.launchStatus === "string" ? plan.launchStatus.trim() : undefined,
                image: typeof plan.image === "string" ? plan.image.trim() : undefined,
                imageAlt: typeof plan.imageAlt === "string" ? plan.imageAlt.trim() : undefined,
            }))
            .filter((plan) => plan.title || plan.label || plan.area || plan.price != null || plan.image);
    }

    const rawAmenities = Array.isArray(payload.amenities)
        ? payload.amenities
        : typeof payload.amenities === "string"
            ? payload.amenities.split(",")
            : [];

    if (rawAmenities.length > 0) {
        normalized.amenities = [...new Set(
            rawAmenities
                .map((item) => item == null ? "" : item.toString().trim())
                .filter(Boolean)
        )];
    }

    delete normalized.listingType;
    delete normalized.propertyType;
    delete normalized.city;
    delete normalized.state;
    delete normalized.locality;
    delete normalized.address;
    delete normalized.bhk;
    delete normalized.baths;
    delete normalized.guests;
    delete normalized.capacity;
    delete normalized.maxGuests;

    return normalized;
};



// CREATE PROPERTY
const createProperty = async (req, res) => {
    try {
        const property = await Property.create(normalizePropertyPayload(req.body));
        emitPropertyEvent("property.created", {
            propertyId: property._id.toString(),
            property: serializeProperty(property),
        });
        res.status(201).json({
            message: "Property added successfully",
            data: serializeProperty(property)
        });
    } catch (error) {
        sendPropertyError(res, "Error while creating property", error);
    }
};

// GET ALL PROPERTIES (WITH FILTERS)
const getAllProperties = async (req, res) => {
    try {
        const { city, type, purpose, minPrice, maxPrice, q, queryText, listingType, propertyType, bhk, budget, priceRange } = req.query;
        let filter = {};
        let smartFilterResult = null;
 
        if (q || queryText || listingType || propertyType || bhk || budget || priceRange) {
            smartFilterResult = handlePropertyFilterInput({
                queryText: q || queryText,
                listingType,
                city,
                propertyType: propertyType || type,
                bhk,
                budget,
                priceRange,
            });

            if (!smartFilterResult.validation.isValid) {
                return res.status(400).json({
                    message: "Invalid property filters",
                    validation: smartFilterResult.validation,
                });
            }

            if (smartFilterResult.validation.requiresClarification) {
                return res.status(400).json({
                    message: "Filter clarification required",
                    validation: smartFilterResult.validation,
                    filters: smartFilterResult.filters,
                });
            }

            // Start with smart query
            filter = { ...smartFilterResult.query };
        }

        // --- Manual Override/Merge (Handles specifics like amenities and direct params) ---
        if (city && !filter["location.city"]) {
            filter["location.city"] = city;
        }

        if (listingType) {
            const normalized = listingType.toLowerCase();
            if (normalized === 'sale') filter.purpose = 'sale';
            if (['rent', 'pg', 'lease'].includes(normalized)) filter.purpose = 'rent';
        }

        if ((type || propertyType) && !filter.type) {
            const typeValue = (type || propertyType).toString().toLowerCase();
            filter.type = typeValue;
        }

        if (purpose && !filter.purpose) {
            filter.purpose = purpose;
        }

        // Amenities filtering
        const { amenities } = req.query;
        if (amenities) {
            const amenitiesList = amenities.split(',').map(a => a.trim()).filter(Boolean);
            if (amenitiesList.length > 0) {
                // Assuming property model has an 'amenities' array field
                filter.amenities = { $all: amenitiesList };
            }
        }

        if (minPrice || maxPrice) {
            filter.price = filter.price || {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        const properties = await Property
            .find(filter)
            .populate("owner", "name email phone");
       res.status(200).json({
         success: true,
         message: "Properties fetched successfully",
         total: properties.length,
         data: properties.map(serializeProperty),
         smartFilters: smartFilterResult ? smartFilterResult.filters : null,
         smartValidation: smartFilterResult ? smartFilterResult.validation : null,
        });

    } catch (error) {
        res.status(500).json({
            message: "Error while fetching properties",
            error: error.message
        });
    }
};

// GET PROPERTY BY ID
const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    // 1. Validate MongoDB ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid property ID format" });
    }
    // 2. Find property and optionally populate owner details
    const property = await Property.findById(id)
      .populate('owner', 'name email role'); // if you have owner reference
    
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }
    // 3. Send response
    res.json({
      success: true,
      data: serializeProperty(property),
    });
  } catch (error) {
    console.error("Error in getPropertyById:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


// UPDATE PROPERTY
const updateProperty = async (req, res) => {
    try {
        const property = await Property.findByIdAndUpdate(
            req.params.id,
            normalizePropertyPayload(req.body),
            { returnDocument: "after", runValidators: true }
        );
        if (!property) {
            return res.status(404).json({
                message: "Property not found"
            });
        }
        emitPropertyEvent("property.updated", {
            propertyId: property._id.toString(),
            property: serializeProperty(property),
        });
        res.status(200).json({
            message: "Property updated successfully",
            data: serializeProperty(property)
        });
    } catch (error) {
        sendPropertyError(res, "Error while updating property", error);
    }
};

// DELETE PROPERTY
const deleteProperty = async (req, res) => {
    try {
        const property = await Property.findByIdAndDelete(req.params.id);
        if (!property) {
            return res.status(404).json({
                message: "Property not found"
            });
        }
        emitPropertyEvent("property.deleted", {
            propertyId: property._id.toString(),
            property: serializeProperty(property),
        });
        res.status(200).json({
            message: "Property deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while deleting property",
            error: error.message
        });
    }
};

// GET PROPERTIES BY OWNER
const getPropertiesByOwner = async (req, res) => {
  try {
    const properties = await Property.find({ owner: req.params.ownerId })
      .populate("owner", "name email phone");
    res.status(200).json({
      message: "Properties fetched successfully",
      total: properties.length,
      data: properties.map(serializeProperty)
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while fetching properties by owner",
      error: error.message
    });
  }
};

const streamProperties = async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (payload) => {
    res.write(`event: ${payload.event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  sendEvent({
    event: "property.connected",
    payload: { connected: true },
    emittedAt: new Date().toISOString(),
  });

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 25000);

  propertyEvents.on("property:event", sendEvent);

  req.on("close", () => {
    clearInterval(heartbeat);
    propertyEvents.off("property:event", sendEvent);
    res.end();
  });
};

// GET FILTERS METADATA
const getPropertyFilters = async (req, res) => {
    try {
        const cities = await Property.distinct("location.city");
        const types = await Property.distinct("type");
        const amenities = await Property.distinct("amenities");
        
        res.status(200).json({
            success: true,
            data: {
                cities: cities.filter(Boolean).sort(),
                types: types.filter(Boolean).map(t => t.charAt(0).toUpperCase() + t.slice(1)).sort(),
                amenities: amenities.filter(Boolean).sort(),
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Error fetching filters", error: error.message });
    }
};

module.exports = {
    createProperty,
    getAllProperties,
    getPropertyById,
    updateProperty,
    deleteProperty,
    getPropertiesByOwner,
    streamProperties,
    getPropertyFilters
};
  
