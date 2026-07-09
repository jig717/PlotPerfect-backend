const Visit = require("../models/PropertyVisitModel");
const Property = require("../models/PropertyModel");

// ========== EXISTING FUNCTIONS (keep for backward compatibility) ==========
const scheduleVisit = async (req, res) => {
  try {
    const visit = await Visit.create(req.body);
    res.json(visit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getVisits = async (req, res) => {
  try {
    const visits = await Visit.find();
    res.json(visits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateVisitStatus = async (req, res) => {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      req.body,
      { returnDocument: "after" }
    );
    res.json(visit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ========== NEW FUNCTIONS FOR BUYER/AGENT DASHBOARD ==========

// Create a visit (buyer only, with validation)
const createVisit = async (req, res) => {
  try {
    const propertyId = req.body.propertyId || req.body.property || req.body.property_id;
    const scheduledDateValue = req.body.scheduledDate || req.body.scheduled_date;
    const notes = typeof req.body.notes === "string" ? req.body.notes.trim() : req.body.notes;
    const fallbackAgentId = req.body.agentId || req.body.agent_id || req.body.ownerId || req.body.owner_id;
    const buyerId = req.user._id;

    if (!propertyId) {
      return res.status(400).json({ message: "propertyId is required" });
    }

    if (!scheduledDateValue) {
      return res.status(400).json({ message: "scheduledDate is required" });
    }

    let property;
    try {
      property = await Property.findById(propertyId);
    } catch (error) {
      return res.status(400).json({ message: "Invalid property ID" });
    }

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const scheduledDate = new Date(scheduledDateValue);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ message: "Invalid scheduledDate" });
    }

    const User = require("../models/UserModel");
    let agentId = property.owner || fallbackAgentId;

    if (!agentId) {
      // Fallback: Assign to an admin if no owner/agent is found
      const admin = await User.findOne({ role: "admin" });
      if (admin) {
        agentId = admin._id;
      } else {
        return res.status(400).json({ message: "This property is missing an owner or agent assignment, and no administrator was found." });
      }
    }

    const existing = await Visit.findOne({
      property: propertyId,
      buyer: buyerId,
      status: { $in: ["REQUESTED", "CONFIRMED"] },
    });
    if (existing) {
      return res.status(400).json({ message: "You already have a pending or confirmed visit for this property" });
    }

    const minDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (scheduledDate < minDate) {
      return res.status(400).json({ message: "Schedule at least 2 hours in advance" });
    }

    const visit = await Visit.create({
      property: propertyId,
      buyer: buyerId,
      agent: agentId,
      scheduledDate,
      notes,
      status: "REQUESTED",
    });

    await visit.populate("property", "title location.city images price");
    await visit.populate("agent", "name email");

    const Notification = require("../models/NotificationModel");
    await Notification.create({
      recipient: agentId,
      type: "PROPERTY",
      sender: req.user.name || req.user.email || "A buyer",
      message: `New visit request for ${property.title}`,
      referenceId: property._id,
    });

    res.status(201).json({ message: "Visit requested", data: visit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get buyer's visits (with pagination & filters)
const getBuyerVisits = async (req, res) => {
  try {
    const buyerId = req.user._id;
    const { status, limit = 10, page = 1 } = req.query;
    const filter = { buyer: buyerId };
    if (status) filter.status = status;

    const visits = await Visit.find(filter)
      .populate("property", "title location.city images price")
      .populate("agent", "name email")
      .sort({ scheduledDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Visit.countDocuments(filter);
    res.json({ data: visits, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get agent's visits (properties they own)
const getAgentVisits = async (req, res) => {
  try {
        const agentId = req.user._id;
    const { status, limit = 10, page = 1 } = req.query;

    // Find all properties owned by this agent to ensure we show visits even if 
    // the visit record was fallback-assigned to an admin.
    const myProperties = await Property.find({ owner: agentId }).select("_id");
    const myPropertyIds = myProperties.map(p => p._id);

    const filter = {
      $or: [
        { agent: agentId },
        { property: { $in: myPropertyIds } }
      ]
    };
    if (status) filter.status = status;

    const visits = await Visit.find(filter)
      .populate("property", "title location.city images price")
      .populate("buyer", "name email phone")
      .sort({ scheduledDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Visit.countDocuments(filter);
    res.json({ data: visits, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single visit by ID (with authorization)
const getVisitById = async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate("property", "title location.city images price")
      .populate("buyer", "name email phone")
      .populate("agent", "name email");
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const userId = req.user._id;
    const userRole = req.user.role;
    if (
      visit.buyer._id.toString() !== userId &&
      visit.agent._id.toString() !== userId &&
      userRole !== "admin"
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(visit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update visit (date or notes) – only if status REQUESTED
const updateVisit = async (req, res) => {
  try {
    const { scheduledDate, notes } = req.body;
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const userId = req.user._id;
    const userRole = req.user.role;
    if (
      !(visit.buyer.toString() === userId || visit.agent.toString() === userId || userRole === "admin") ||
      visit.status !== "REQUESTED"
    ) {
      return res.status(403).json({ message: "Cannot edit this visit" });
    }

    if (scheduledDate) {
      const minDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      if (new Date(scheduledDate) < minDate) {
        return res.status(400).json({ message: "Reschedule at least 2 hours in advance" });
      }
      visit.scheduledDate = scheduledDate;
    }
    if (notes !== undefined) visit.notes = notes;

    await visit.save();
    res.json({ message: "Visit updated", data: visit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Enhanced status update with role checks (overwrites old one if you replace)
const updateVisitStatusEnhanced = async (req, res) => {
  try {
    const { status } = req.body;
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const userId = req.user._id;
    const userRole = req.user.role;

    if (userRole === "buyer") {
      if (visit.buyer.toString() !== userId) return res.status(403).json({ message: "Forbidden" });
      if (status !== "CANCELLED") return res.status(403).json({ message: "Buyers can only cancel visits" });
    } else if (userRole === "agent" || userRole === "owner") {
      if (visit.agent.toString() !== userId) return res.status(403).json({ message: "Not your property" });
      if (!["CONFIRMED", "CANCELLED", "COMPLETED"].includes(status)) {
        return res.status(400).json({ message: "Invalid status update" });
      }
    } else if (userRole !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    visit.status = status;
    await visit.save();
    res.json({ message: "Status updated", data: visit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  // Old (backward compatible)
  scheduleVisit,
  getVisits,
  updateVisitStatus: updateVisitStatusEnhanced, // replace old with enhanced
  // New
  createVisit,
  getBuyerVisits,
  getAgentVisits,
  getVisitById,
  updateVisit,
};
