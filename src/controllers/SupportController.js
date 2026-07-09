const Ticket = require("../models/TicketModel"); 

// Create Ticket
const createTicket = async (req, res) => {
  try {
    const { subject, message, category } = req.body;
    const userId = req.user?._id;

    if (!userId || !subject || !message) {
      return res.status(400).json({
        message: "Missing required fields: subject and message are required",
      });
    }

    const ticket = await Ticket.create({
      user: userId,
      subject,
      message,
      category: category || "Other",
      status: "Open",
    });
    res.status(201).json(ticket);
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get All Tickets (for support/admin)
const getTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Ticket Status
const updateTicketStatus = async (req, res) => {
  try {
    const { status, adminResponse } = req.body;
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status, adminResponse },
      { returnDocument: "after" }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTicket,
  getTickets,
  updateTicketStatus,
};
