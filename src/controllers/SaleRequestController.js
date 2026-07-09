const mongoose = require("mongoose");
const SaleRequest = require("../models/SaleRequestModel");
const Property = require("../models/PropertyModel");
const User = require("../models/UserModel");
const Thread = require("../models/ThreadModel");
const Message = require("../models/MessageModel");
const Payment = require("../models/PaymentModel");

const DEFAULT_COMMISSION_RATE = Number(process.env.DEFAULT_AGENT_COMMISSION_RATE || 2);

const objectIdOrNull = (value) => {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return value;
  return null;
};

const sanitizeCommissionRate = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_COMMISSION_RATE;
  }
  return parsed;
};

const calculateCommissionAmount = (salePrice, commissionRate) => {
  const safeSalePrice = Number(salePrice || 0);
  const safeRate = Number(commissionRate || 0);
  if (!Number.isFinite(safeSalePrice) || safeSalePrice <= 0) return 0;
  if (!Number.isFinite(safeRate) || safeRate <= 0) return 0;
  return Number(((safeSalePrice * safeRate) / 100).toFixed(2));
};

const populateSaleRequest = (query) =>
  query
    .populate("property", "title price location.city location.address images status owner")
    .populate("owner", "name email phone role")
    .populate("acceptedBy", "name email phone role")
    .populate("thread", "title status lastMessageAt participants")
    .populate("payment", "amount status paymentMethod paymentType notes createdAt updatedAt recipient initiatedBy paidAt")
    .populate("commissionPayment", "amount status paymentMethod paymentType notes createdAt updatedAt recipient initiatedBy paidAt");

const ensureSaleThread = async ({ saleRequest, owner, agent, property }) => {
  if (saleRequest.thread) {
    return Thread.findById(saleRequest.thread)
      .populate("participants.user", "name email role phone");
  }

  const participants = [
    { user: owner._id, role: owner.role || "owner" },
    { user: agent._id, role: agent.role || "agent" },
  ];

  const thread = await Thread.create({
    type: "owner_agent_sale",
    title: `Owner-agent sale for ${property.title || "property"}`,
    property: property._id,
    participants,
    assignedTo: agent._id,
    createdBy: owner._id,
    status: "open",
    lastMessageAt: new Date(),
  });

  saleRequest.thread = thread._id;
  await saleRequest.save();

  return Thread.findById(thread._id).populate("participants.user", "name email role phone");
};

const createSystemMessage = async ({ threadId, senderId, content }) => {
  if (!threadId || !senderId || !content?.trim()) return null;

  const message = await Message.create({
    thread: threadId,
    sender: senderId,
    content: content.trim(),
    status: "sent",
    readBy: [{ user: senderId, readAt: new Date() }],
  });

  await Thread.findByIdAndUpdate(threadId, { lastMessageAt: new Date(), status: "open" });
  return message;
};

const createSaleRequest = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { propertyId, ownerMessage } = req.body || {};

    if (!objectIdOrNull(propertyId)) {
      return res.status(400).json({ message: "Valid propertyId is required" });
    }

    const property = await Property.findById(propertyId).populate("owner", "name email phone role");
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (String(property.owner?._id || property.owner) !== String(userId)) {
      return res.status(403).json({ message: "Only the property owner can request agent selling support" });
    }

    const saleRequest = await SaleRequest.findOneAndUpdate(
      { property: property._id, owner: userId },
      {
        property: property._id,
        owner: userId,
        ownerMessage: typeof ownerMessage === "string" ? ownerMessage.trim() : "",
        status: "open",
        acceptedBy: null,
        acceptedAt: null,
        soldAt: null,
        soldPrice: null,
        commissionRate: null,
        commissionAmount: 0,
        commissionStatus: "pending",
        commissionCalculatedAt: null,
        commissionEarnedAt: null,
        saleNotes: "",
        thread: null,
        payment: null,
        commissionPayment: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const populated = await populateSaleRequest(SaleRequest.findById(saleRequest._id));

    // Notify all agents about new open sale request
    const Notification = require("../models/NotificationModel");
    const agents = await User.find({ role: "agent" });
    const notificationPromises = agents.map(agent => 
      Notification.create({
        recipient: agent._id,
        type: "PROPERTY",
        sender: req.user.name || "A property owner",
        message: `New Sale Request for "${property.title}"`,
        referenceId: property._id
      })
    );
    await Promise.all(notificationPromises);

    res.status(201).json({ message: "Sell via agent request created", data: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to create sale request", error: error.message });
  }
};

const getOpenSaleRequestsForAgents = async (_req, res) => {
  try {
    const requests = await populateSaleRequest(
      SaleRequest.find({ status: "open" }).sort({ createdAt: -1 })
    );
    res.json({ data: requests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch open sale requests", error: error.message });
  }
};

const getAgentSaleRequests = async (req, res) => {
  try {
    const requests = await populateSaleRequest(
      SaleRequest.find({ acceptedBy: req.user._id }).sort({ updatedAt: -1, createdAt: -1 })
    );
    res.json({ data: requests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch agent sale requests", error: error.message });
  }
};

const getOwnerSaleRequests = async (req, res) => {
  try {
    const requests = await populateSaleRequest(
      SaleRequest.find({ owner: req.user._id }).sort({ updatedAt: -1, createdAt: -1 })
    );
    res.json({ data: requests });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch owner sale requests", error: error.message });
  }
};

const acceptSaleRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    if (!objectIdOrNull(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const saleRequest = await SaleRequest.findById(requestId)
      .populate("property")
      .populate("owner", "name email phone role");

    if (!saleRequest) {
      return res.status(404).json({ message: "Sale request not found" });
    }

    if (saleRequest.status !== "open") {
      return res.status(400).json({ message: "This request is no longer available" });
    }

    const agent = await User.findById(req.user._id).select("name email phone role");
    if (!agent || agent.role !== "agent") {
      return res.status(403).json({ message: "Only agents can accept sale requests" });
    }

    saleRequest.status = "accepted";
    saleRequest.acceptedBy = agent._id;
    saleRequest.acceptedAt = new Date();

    const thread = await ensureSaleThread({
      saleRequest,
      owner: saleRequest.owner,
      agent,
      property: saleRequest.property,
    });

    await createSystemMessage({
      threadId: thread._id,
      senderId: agent._id,
      content: `I have accepted your request to sell "${saleRequest.property?.title || "your property"}". We can coordinate the sale here.`,
    });

    const populated = await populateSaleRequest(SaleRequest.findById(saleRequest._id));

    // Notify owner that request was accepted
    const Notification = require("../models/NotificationModel");
    await Notification.create({
      recipient: saleRequest.owner._id,
      type: "MESSAGE",
      sender: agent.name || "An agent",
      message: `Agent ${agent.name} has accepted your sale request for "${saleRequest.property?.title}"`,
      referenceId: saleRequest.property?._id
    });

    res.json({ message: "Sale request accepted", data: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to accept sale request", error: error.message });
  }
};

const markSaleRequestSold = async (req, res) => {
  try {
    const requestId = req.params.id;
    if (!objectIdOrNull(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const saleRequest = await SaleRequest.findById(requestId)
      .populate("property")
      .populate("owner", "name email phone role")
      .populate("acceptedBy", "name email phone role");

    if (!saleRequest) {
      return res.status(404).json({ message: "Sale request not found" });
    }

    if (String(saleRequest.acceptedBy?._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the assigned agent can mark this request as sold" });
    }

    const soldPrice = Number(req.body?.soldPrice ?? saleRequest.property?.price ?? 0);
    const paymentMethod = String(req.body?.paymentMethod || "netbanking").toLowerCase();
    const saleNotes = typeof req.body?.saleNotes === "string" ? req.body.saleNotes.trim() : "";

    if (!Number.isFinite(soldPrice) || soldPrice <= 0) {
      return res.status(400).json({ message: "Valid soldPrice is required" });
    }

    if (!["card", "upi", "netbanking"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    saleRequest.status = "sold";
    saleRequest.soldAt = new Date();
    saleRequest.soldPrice = soldPrice;
    saleRequest.saleNotes = saleNotes;
    saleRequest.commissionRate = sanitizeCommissionRate(req.body?.commissionRate);
    saleRequest.commissionAmount = calculateCommissionAmount(soldPrice, saleRequest.commissionRate);
    saleRequest.commissionStatus = "pending";
    saleRequest.commissionCalculatedAt = new Date();
    saleRequest.commissionEarnedAt = null;

    let payment = null;
    if (saleRequest.payment) {
      payment = await Payment.findByIdAndUpdate(
        saleRequest.payment,
        {
          user: saleRequest.owner._id,
          recipient: saleRequest.owner._id,
          initiatedBy: req.user._id,
          property: saleRequest.property?._id,
          saleRequest: saleRequest._id,
          amount: soldPrice,
          paymentMethod,
          paymentType: "sale_closure",
          status: "pending",
          notes: saleNotes,
          paidAt: null,
        },
        { new: true }
      );
    } else {
      payment = await Payment.create({
        user: saleRequest.owner._id,
        recipient: saleRequest.owner._id,
        initiatedBy: req.user._id,
        property: saleRequest.property?._id,
        saleRequest: saleRequest._id,
        amount: soldPrice,
        paymentMethod,
        paymentType: "sale_closure",
        status: "pending",
        notes: saleNotes,
        paidAt: null,
      });
      saleRequest.payment = payment._id;
    }

    saleRequest.property.status = "SOLD";
    await saleRequest.property.save();
    await saleRequest.save();

    const thread = await ensureSaleThread({
      saleRequest,
      owner: saleRequest.owner,
      agent: saleRequest.acceptedBy,
      property: saleRequest.property,
    });

    await createSystemMessage({
      threadId: thread._id,
      senderId: req.user._id,
      content: `I marked "${saleRequest.property?.title || "the property"}" as sold for ${soldPrice}. Your payment record is ready, and my commission has been calculated at ${saleRequest.commissionRate}% (${saleRequest.commissionAmount}).`,
    });

    const populated = await populateSaleRequest(SaleRequest.findById(saleRequest._id));

    // Notify owner that property is marked sold
    const Notification = require("../models/NotificationModel");
    await Notification.create({
      recipient: saleRequest.owner._id,
      type: "PROPERTY",
      sender: req.user.name || "Your agent",
      message: `Great news! "${saleRequest.property?.title}" has been marked as sold.`,
      referenceId: saleRequest.property?._id
    });

    res.json({ message: "Sale marked as sold", data: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark sale as sold", error: error.message });
  }
};

const updateSaleRequestPayment = async (req, res) => {
  try {
    const requestId = req.params.id;
    if (!objectIdOrNull(requestId)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    const saleRequest = await SaleRequest.findById(requestId)
      .populate("property")
      .populate("owner", "name email phone role")
      .populate("acceptedBy", "name email phone role");

    if (!saleRequest) {
      return res.status(404).json({ message: "Sale request not found" });
    }

    if (String(saleRequest.owner?._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Only the owner can update payment status" });
    }

    if (!saleRequest.payment) {
      return res.status(400).json({ message: "No payment record exists for this sale request" });
    }

    const status = String(req.body?.status || "").toLowerCase();
    if (!["pending", "completed", "failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    const salePayment = await Payment.findByIdAndUpdate(
      saleRequest.payment,
      {
        status,
        paidAt: status === "completed" ? new Date() : null,
      },
      { new: true }
    );

    if (status === "completed") {
      saleRequest.status = "payment_completed";
      saleRequest.commissionStatus = "earned";
      saleRequest.commissionEarnedAt = new Date();

      const commissionPaymentPayload = {
        user: saleRequest.owner._id,
        recipient: saleRequest.acceptedBy?._id || null,
        initiatedBy: req.user._id,
        property: saleRequest.property?._id,
        saleRequest: saleRequest._id,
        amount: saleRequest.commissionAmount || 0,
        paymentMethod: salePayment?.paymentMethod || "netbanking",
        paymentType: "agent_commission",
        status: "completed",
        notes:
          saleRequest.saleNotes ||
          `Commission earned at ${saleRequest.commissionRate || DEFAULT_COMMISSION_RATE}% for completed owner sale`,
        paidAt: new Date(),
      };

      if (saleRequest.commissionPayment) {
        await Payment.findByIdAndUpdate(saleRequest.commissionPayment, commissionPaymentPayload, { new: true });
      } else if (saleRequest.acceptedBy?._id && Number(saleRequest.commissionAmount || 0) > 0) {
        const commissionPayment = await Payment.create(commissionPaymentPayload);
        saleRequest.commissionPayment = commissionPayment._id;
      }
    } else {
      saleRequest.commissionStatus = "pending";
      saleRequest.commissionEarnedAt = null;
      saleRequest.status = saleRequest.status === "payment_completed" ? "sold" : saleRequest.status;
    }
    await saleRequest.save();

    const thread = await ensureSaleThread({
      saleRequest,
      owner: saleRequest.owner,
      agent: saleRequest.acceptedBy,
      property: saleRequest.property,
    });

    await createSystemMessage({
      threadId: thread._id,
      senderId: req.user._id,
      content:
        status === "completed"
          ? `I have received the payment for "${saleRequest.property?.title || "the property"}". The assigned agent commission of ${saleRequest.commissionAmount || 0} is now marked as earned.`
          : `I updated the payment status to ${status} for "${saleRequest.property?.title || "the property"}".`,
    });

    const populated = await populateSaleRequest(SaleRequest.findById(saleRequest._id));

    // Notify agent that payment was received (commission earned)
    if (status === "completed") {
      const Notification = require("../models/NotificationModel");
      await Notification.create({
        recipient: saleRequest.acceptedBy?._id,
        type: "PROPERTY",
        sender: req.user.name || "Property Owner",
        message: `Payment received for "${saleRequest.property?.title}". Your commission is now earned!`,
        referenceId: saleRequest.property?._id
      });
    }

    res.json({ message: "Payment status updated", data: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update payment status", error: error.message });
  }
};

module.exports = {
  createSaleRequest,
  getOpenSaleRequestsForAgents,
  getAgentSaleRequests,
  getOwnerSaleRequests,
  acceptSaleRequest,
  markSaleRequestSold,
  updateSaleRequestPayment,
};
