const Inquiry = require('../models/InquiryModel');
const Property = require('../models/PropertyModel');
const { ensureInquiryThread } = require('./ThreadController');

// Create a new inquiry
const createInquiry = async (req, res) => {
  try {
    const userId = req.user?._id || req.body.user;
    const { property, message } = req.body;
    if (!userId || !property || !message) {
      return res.status(400).json({ message: "Missing required fields: user, property, message" });
    }

    const propertyDoc = await Property.findById(property).populate("owner", "name email role");
    if (!propertyDoc) {
      return res.status(404).json({ message: "Property not found" });
    }
    if (!propertyDoc.owner?._id) {
      return res.status(400).json({ message: "Property owner is missing" });
    }

    const newInquiry = await Inquiry.create({ user: userId, property, message });

    const thread = await ensureInquiryThread({
      inquiry: newInquiry,
      senderId: userId,
      senderRole: req.user?.role || "buyer",
      property: propertyDoc,
      initialMessage: message,
    });

    const Notification = require('../models/NotificationModel');
    await Notification.create({
      recipient: propertyDoc.owner._id,
      type: 'INQUIRY',
      sender: req.user?.name || req.user?.email || 'A buyer',
      message: `New inquiry on ${propertyDoc.title}`,
      referenceId: newInquiry._id
    });

    res.status(201).json({ message: "Inquiry created successfully", data: newInquiry, threadId: thread._id });
  } catch (error) {
    console.error("Error creating inquiry:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get all inquiries only for admin
const getAllInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find()
      .populate("user", "name email")
      .populate("property", "title price");
    res.status(200).json({
      message: "All inquiries fetched successfully",
      data: inquiries
    });
  } catch (error) {
    res.status(500).json({ message: "Error while fetching inquiries", error: error.message });
  }
};

// Respond to an inquiry
const respondInquiry = async (req, res) => {
  try {
    const { message } = req.body;
    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }
    inquiry.response = message;
    await inquiry.save();

    const propertyDoc = await Property.findById(inquiry.property).populate("owner", "name email role");
    if (propertyDoc?.owner) {
      await ensureInquiryThread({
        inquiry,
        senderId: req.user._id,
        senderRole: req.user.role,
        property: propertyDoc,
        responseMessage: message,
      });
    }

    res.status(200).json({ message: "Response added successfully", data: inquiry });
  } catch (error) {
    res.status(500).json({ message: "Error responding to inquiry", error: error.message });
  }
};

//get inquiries by user
const getInquiriesByUser = async (req, res) => {
  try {
    const inquiries = await Inquiry.find({ user: req.params.userid })
      .populate("user", "name email")
      .populate("property", "title price");
    res.status(200).json({
      message: "Inquiries fetched successfully",
      data: inquiries
    });
  } catch (error) {
    res.status(500).json({
      message: "error while feaching user inquires",
      error: error.message
    })
  }
};

// Delete an inquiry
const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
    if (!inquiry) {
      return res.status(404).json({
        message: "Inquiry not found"
      });
    }
    res.status(200).json({
      message: "Inquiry deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while deleting inquiry",
      error: error.message
    });
  }
};

// GET INQUIRIES FOR AGENT (properties owned by the agent)
const getInquiriesForAgent = async (req, res) => {
  try {
    const agentId = req.user._id;  // from authentication middleware
    // Find properties owned by this agent
    //    const Property = require("../models/PropertyModel");
    const properties = await Property.find({ owner: agentId }).select("_id");
    const propertyIds = properties.map(p => p._id);
    const inquiries = await Inquiry.find({ property: { $in: propertyIds } })
      .populate("user", "name email")
      .populate("property", "title price");
    res.status(200).json({
      message: "Inquiries for agent fetched successfully",
      data: inquiries
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while fetching agent inquiries",
      error: error.message
    });
  }
};

module.exports = {
  createInquiry,
  getAllInquiries,
  getInquiriesByUser,
  deleteInquiry,
  getInquiriesForAgent,
  respondInquiry
};
