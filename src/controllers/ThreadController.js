const mongoose = require("mongoose");
const Thread = require("../models/ThreadModel");
const Message = require("../models/MessageModel");
const Property = require("../models/PropertyModel");
const Inquiry = require("../models/InquiryModel");

const normalizeThread = (thread) => {
  if (!thread) return null;
  return thread;
};

const getRefId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value._id) return value._id.toString();
  if (typeof value.toString === "function") return value.toString();
  return null;
};

const isParticipant = (thread, userId) =>
  thread.participants.some((participant) => getRefId(participant.user) === userId);

const getAccessibleThread = async (threadId, user) => {
  const thread = await Thread.findById(threadId)
    .populate("property", "title location.city location.address images price owner")
    .populate("inquiry")
    .populate("participants.user", "name email role")
    .populate("assignedTo", "name email role")
    .populate("createdBy", "name email role");

  if (!thread) return { status: 404, payload: { message: "Thread not found" } };

  if (user.role !== "admin" && user.role !== "support" && !isParticipant(thread, user._id)) {
    return { status: 403, payload: { message: "Forbidden" } };
  }

  return { thread };
};

const createThread = async (req, res) => {
  try {
    const { type = "property_inquiry", property: rawPropertyId, title, initialMessage } = req.body;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!["buyer", "agent", "owner", "support", "admin"].includes(userRole)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    let property = null;
    let participantIds = [userId];
    let participants = [{ user: userId, role: userRole }];
    let threadTitle = title;

    if (type === "property_inquiry") {
      if (!rawPropertyId || !mongoose.Types.ObjectId.isValid(rawPropertyId)) {
        return res.status(400).json({ message: "Valid property is required" });
      }

      property = await Property.findById(rawPropertyId).populate("owner", "name email role");
      if (!property) {
        return res.status(404).json({ message: "Property not found" });
      }

      if (!property.owner?._id) {
        return res.status(400).json({ message: "Property owner is missing" });
      }

      const ownerId = property.owner._id.toString();
      participantIds.push(ownerId);
      participants.push({ user: ownerId, role: property.owner.role || "owner" });
      threadTitle = threadTitle || `Inquiry about ${property.title || "property"}`;
    } else {
      threadTitle = threadTitle || "Support conversation";
    }

    const uniqueParticipants = participants.filter(
      (participant, index, list) =>
        list.findIndex((item) => item.user.toString() === participant.user.toString()) === index
    );

    const thread = await Thread.create({
      type,
      title: threadTitle,
      property: property?._id || null,
      participants: uniqueParticipants,
      assignedTo: type === "support" ? null : property?.owner?._id || null,
      createdBy: userId,
      status: "open",
      lastMessageAt: new Date(),
    });

    if (initialMessage?.trim()) {
      await Message.create({
        thread: thread._id,
        sender: userId,
        content: initialMessage.trim(),
        status: "sent",
        readBy: [{ user: userId, readAt: new Date() }],
      });
    }

    const hydratedThread = await Thread.findById(thread._id)
      .populate("property", "title location.city location.address images price owner")
      .populate("participants.user", "name email role")
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email role");

    res.status(201).json({ message: "Thread created", data: normalizeThread(hydratedThread) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyThreads = async (req, res) => {
  try {
    const { status, type, q } = req.query;
    const userId = req.user._id;
    const userRole = req.user.role;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    if (!["admin", "support"].includes(userRole)) {
      filter["participants.user"] = userId;
    }

    if (q?.trim()) {
      filter.title = { $regex: q.trim(), $options: "i" };
    }

    const threads = await Thread.find(filter)
      .populate("property", "title location.city location.address images price owner")
      .populate("participants.user", "name email role")
      .populate("assignedTo", "name email role")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    res.json({ data: threads.map(normalizeThread) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getThreadById = async (req, res) => {
  try {
    const result = await getAccessibleThread(req.params.id, req.user);
    if (!result.thread) {
      return res.status(result.status).json(result.payload);
    }

    res.json({ data: normalizeThread(result.thread) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getThreadMessages = async (req, res) => {
  try {
    const result = await getAccessibleThread(req.params.id, req.user);
    if (!result.thread) {
      return res.status(result.status).json(result.payload);
    }

    await Message.updateMany(
      {
        thread: req.params.id,
        sender: { $ne: req.user._id },
        status: "sent",
      },
      {
        $set: { status: "delivered" },
      }
    );

    const messages = await Message.find({ thread: req.params.id })
      .populate("sender", "name email role")
      .sort({ createdAt: 1 });

    res.json({ data: messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const result = await getAccessibleThread(req.params.id, req.user);
    if (!result.thread) {
      return res.status(result.status).json(result.payload);
    }

    if (result.thread.status === "closed" || result.thread.status === "archived") {
      return res.status(400).json({ message: "Thread is not open for replies" });
    }

    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 5) : [];

    if (!content && attachments.length === 0) {
      return res.status(400).json({ message: "Message content or attachments are required" });
    }

    const message = await Message.create({
      thread: result.thread._id,
      sender: req.user._id,
      content,
      attachments,
      status: "sent",
      readBy: [{ user: req.user._id, readAt: new Date() }],
    });

    result.thread.lastMessageAt = new Date();
    result.thread.status = result.thread.status === "pending" ? "open" : result.thread.status;

    result.thread.participants = result.thread.participants.map((participant) => ({
      ...participant.toObject(),
      lastReadAt:
        getRefId(participant.user) === req.user._id
          ? new Date()
          : participant.lastReadAt,
    }));

    await result.thread.save();

    const hydratedMessage = await Message.findById(message._id).populate("sender", "name email role");

    const recipientIds = result.thread.participants
      .filter((p) => p.user && p.user.toString() !== req.user._id.toString())
      .map((p) => p.user);

    if (recipientIds.length > 0) {
      const Notification = require("../models/NotificationModel");
      const notifications = recipientIds.map((recipientId) => ({
        recipient: recipientId,
        type: 'MESSAGE',
        sender: req.user.name || req.user.email || 'A user',
        message: `New message in thread: ${result.thread.title}`,
        referenceId: result.thread._id
      }));
      await Notification.insertMany(notifications);
    }

    res.status(201).json({ message: "Message sent", data: hydratedMessage });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markThreadRead = async (req, res) => {
  try {
    const result = await getAccessibleThread(req.params.id, req.user);
    if (!result.thread) {
      return res.status(result.status).json(result.payload);
    }

    const now = new Date();
    result.thread.participants = result.thread.participants.map((participant) => {
      const participantId = getRefId(participant.user);
      if (participantId === req.user._id) {
        return { ...participant.toObject(), lastReadAt: now };
      }
      return participant;
    });
    await result.thread.save();

    await Message.updateMany(
      {
        thread: result.thread._id,
        "readBy.user": { $ne: req.user._id },
      },
      {
        $push: {
          readBy: { user: req.user._id, readAt: now },
        },
        $set: { status: "read" },
      }
    );

    res.json({ message: "Thread marked as read" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateThread = async (req, res) => {
  try {
    const result = await getAccessibleThread(req.params.id, req.user);
    if (!result.thread) {
      return res.status(result.status).json(result.payload);
    }

    const { status, assignedTo } = req.body;
    const userRole = req.user.role;

    if (status) {
      const canManageStatus =
        ["admin", "support"].includes(userRole) ||
        getRefId(result.thread.createdBy) === req.user._id ||
        isParticipant(result.thread, req.user._id);

      if (!canManageStatus) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (!["open", "pending", "closed", "archived"].includes(status)) {
        return res.status(400).json({ message: "Invalid thread status" });
      }

      result.thread.status = status;
    }

    if (assignedTo !== undefined) {
      if (!["admin", "support"].includes(userRole)) {
        return res.status(403).json({ message: "Only admin/support can assign threads" });
      }

      result.thread.assignedTo = assignedTo || null;
    }

    await result.thread.save();
    res.json({ message: "Thread updated", data: normalizeThread(result.thread) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getThreadByInquiryId = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    let thread = await Thread.findOne({ inquiry: req.params.inquiryId })
      .populate("property", "title location.city location.address images price owner")
      .populate("participants.user", "name email role")
      .populate("assignedTo", "name email role")
      .populate("createdBy", "name email role");

    if (!thread) {
      const inquiry = await Inquiry.findById(req.params.inquiryId)
        .populate("user", "role")
        .populate({
          path: "property",
          populate: { path: "owner", select: "name email role" },
        });

      if (!inquiry) {
        return res.status(404).json({ message: "Inquiry not found" });
      }

      if (!inquiry.property?._id || !inquiry.user?._id) {
        return res.status(400).json({ message: "Inquiry is missing property or buyer data" });
      }

      const createdThread = await ensureInquiryThread({
        inquiry,
        senderId: getRefId(inquiry.user),
        senderRole: inquiry.user.role || "buyer",
        property: inquiry.property,
        initialMessage: inquiry.message,
        responseMessage: inquiry.response,
      });

      thread = await Thread.findById(createdThread._id)
        .populate("property", "title location.city location.address images price owner")
        .populate("participants.user", "name email role")
        .populate("assignedTo", "name email role")
        .populate("createdBy", "name email role");
    }

    if (!thread) {
      return res.status(404).json({ message: "Thread not found" });
    }

    if (
      !["admin", "support"].includes(req.user.role) &&
      !thread.participants.some((participant) => getRefId(participant.user) === req.user._id)
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json({ data: thread });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const ensureInquiryThread = async ({ inquiry, senderId, senderRole, property, initialMessage, responseMessage }) => {
  let thread = await Thread.findOne({ inquiry: inquiry._id });
  if (!thread) {
    const ownerRole = property?.owner?.role || "owner";
    const participants = [
      { user: senderId, role: senderRole },
      { user: property.owner._id || property.owner, role: ownerRole },
    ].filter(
      (participant, index, list) =>
        list.findIndex((item) => item.user.toString() === participant.user.toString()) === index
    );

    thread = await Thread.create({
      type: "property_inquiry",
      title: `Inquiry about ${property.title || "property"}`,
      property: property._id,
      inquiry: inquiry._id,
      participants,
      assignedTo: property.owner._id || property.owner,
      createdBy: senderId,
      status: "open",
      lastMessageAt: new Date(),
    });

    if (initialMessage?.trim()) {
      await Message.create({
        thread: thread._id,
        sender: senderId,
        content: initialMessage.trim(),
        status: "sent",
        readBy: [{ user: senderId, readAt: new Date() }],
      });
    }
  }

  if (responseMessage?.trim()) {
    const exists = await Message.findOne({
      thread: thread._id,
      sender: senderId,
      content: responseMessage.trim(),
    });

    if (!exists) {
      await Message.create({
        thread: thread._id,
        sender: senderId,
        content: responseMessage.trim(),
        status: "sent",
        readBy: [{ user: senderId, readAt: new Date() }],
      });
      thread.lastMessageAt = new Date();
      await thread.save();
    }
  }

  return thread;
};

module.exports = {
  createThread,
  getMyThreads,
  getThreadById,
  getThreadMessages,
  sendMessage,
  markThreadRead,
  updateThread,
  getThreadByInquiryId,
  ensureInquiryThread,
};
