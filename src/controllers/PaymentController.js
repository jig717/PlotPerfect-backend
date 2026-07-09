const mongoose = require("mongoose");
const Payment = require("../models/PaymentModel");
const Property = require("../models/PropertyModel");
const User = require("../models/UserModel");
const sendMail = require("../utilis/MailUtili");
const {
  getRazorpayConfig,
  razorpayRequest,
  verifyRazorpaySignature,
} = require("../utilis/RazorpayUtil");

const ALLOWED_METHODS = ["card", "upi", "netbanking"];
const FULL_PAYMENT_ALLOWED_PURPOSES = ["rent", "pg"];
const FULL_PAYMENT_ALLOWED_TYPES = ["plot", "commercial", "pg"];
const PAYMENT_TYPE_LABELS = {
  advance_token: "Advance Payment / Token",
  full_property_payment: "Full Property Payment",
  sale_closure: "Sale Closure",
  agent_commission: "Agent Commission",
};

const populatePayment = (query) =>
  query
    .populate("property", "title price location.city location.address images owner")
    .populate("recipient", "name email phone role")
    .populate("initiatedBy", "name email phone role")
    .populate("saleRequest", "status soldPrice soldAt acceptedAt")
    .populate("user", "name email phone role");

const normalizePaymentMethod = (paymentMethod) => {
  const normalizedMethod = String(paymentMethod || "").toLowerCase();
  if (ALLOWED_METHODS.includes(normalizedMethod)) return normalizedMethod;
  return "upi";
};

const formatCurrency = (amount, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const formatPaymentDate = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : new Date();
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const normalizePropertyStatus = (value) => String(value || "").trim().toUpperCase();
const normalizePurpose = (value) => String(value || "").trim().toLowerCase();
const normalizePropertyType = (value) => String(value || "").trim().toLowerCase();

const buildReceipt = (prefix, propertyId) =>
  `${prefix}_${String(propertyId).slice(-6)}_${Date.now()}`.slice(0, 40);

const appendNote = (...parts) =>
  parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" | ");

const resolveFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.WEBSITE_URL || "http://localhost:5173";

const mapGatewayErrorStatus = (error) => {
  const status = Number(error?.status || 0);
  if (!status) return 500;
  if (status === 429) return 429;
  if (status >= 400 && status < 500) return 400;
  return 502;
};

const buildGatewayErrorBody = (fallbackMessage, error) => ({
  message:
    error?.payload?.error?.description ||
    error?.payload?.message ||
    error?.message ||
    fallbackMessage,
  error: error?.payload || error?.message || fallbackMessage,
});

const getPaymentTypeLabel = (paymentType) =>
  PAYMENT_TYPE_LABELS[paymentType] || "Property Payment";

const isPropertyUnavailable = (property) => {
  const propertyStatus = normalizePropertyStatus(property?.status);
  return ["BOOKED", "SOLD", "RENTED"].includes(propertyStatus);
};

const isEligibleForFullPayment = (property) => {
  const purpose = normalizePurpose(property?.purpose);
  const type = normalizePropertyType(property?.type || property?.propertyType);
  return (
    FULL_PAYMENT_ALLOWED_PURPOSES.includes(purpose) ||
    FULL_PAYMENT_ALLOWED_TYPES.includes(type)
  );
};

const resolveFullPaymentStatus = (property) => {
  const purpose = normalizePurpose(property?.purpose);
  if (purpose === "rent" || purpose === "pg") {
    return "RENTED";
  }
  return "SOLD";
};

const buildInvoiceReplacements = ({ payment, buyer, owner, property }) => {
  const bookingStatus = normalizePropertyStatus(property?.status || "BOOKED");
  const fallbackStatusMessage =
    bookingStatus === "RENTED"
      ? "This payment has been recorded successfully and the property is now marked as rented."
      : bookingStatus === "SOLD"
      ? "This payment has been recorded successfully and the property is now marked as sold."
      : "This payment has been recorded successfully and the property is now marked as booked.";

  return {
    invoiceNumber: payment?.receipt || payment?._id?.toString() || "NA",
    paymentDate: formatPaymentDate(payment?.paidAt || payment?.updatedAt || new Date()),
    propertyTitle: property?.title || "Property",
    amount: formatCurrency(payment?.amount, payment?.currency || "INR"),
    bookingStatus,
    paymentType: getPaymentTypeLabel(payment?.paymentType),
    paymentMethod: String(payment?.paymentMethod || "online").toUpperCase(),
    orderId: payment?.razorpayOrderId || "NA",
    paymentId: payment?.razorpayPaymentId || "NA",
    buyerName: buyer?.name || "Buyer",
    buyerEmail: buyer?.email || "NA",
    ownerName: owner?.name || "Owner",
    ownerEmail: owner?.email || "NA",
    notesLine: payment?.notes ? `Notes: ${payment.notes}` : fallbackStatusMessage,
  };
};

const loadPaymentParties = async (payment) => {
  const propertyId = payment?.property?._id || payment?.property;
  const buyerId = payment?.user?._id || payment?.user;

  const [property, buyer] = await Promise.all([
    propertyId ? Property.findById(propertyId).populate("owner", "name email phone role") : null,
    buyerId ? User.findById(buyerId).select("name email phone role") : null,
  ]);

  return {
    property,
    buyer,
    owner: property?.owner || null,
  };
};

const sendPaymentConfirmationEmails = async ({ payment, buyer, owner, property }) => {
  const commonReplacements = {
    propertyTitle: property?.title || "Property",
    amount: formatCurrency(payment?.amount, payment?.currency || "INR"),
    paymentType: getPaymentTypeLabel(payment?.paymentType),
    paymentMethod: String(payment?.paymentMethod || "online").toUpperCase(),
    paymentDate: formatPaymentDate(payment?.paidAt || payment?.updatedAt || new Date()),
    orderId: payment?.razorpayOrderId || "NA",
    paymentId: payment?.razorpayPaymentId || "NA",
    buyerName: buyer?.name || "Buyer",
    ownerName: owner?.name || "Owner",
    notes: payment?.notes || "NA",
    dashboardUrl: resolveFrontendUrl(),
  };

  const jobs = [];

  if (buyer?.email) {
    jobs.push(
      sendMail(buyer.email, "PlotPerfect payment confirmation", "paymentConfirmation.html", {
        ...commonReplacements,
        recipientName: buyer.name || "Customer",
      })
    );
  }

  if (owner?.email) {
    jobs.push(
      sendMail(owner.email, "PlotPerfect buyer payment received", "paymentConfirmation.html", {
        ...commonReplacements,
        recipientName: owner.name || "Owner",
      })
    );
  }

  if (jobs.length === 0) {
    return "failed";
  }

  const results = await Promise.allSettled(jobs);
  const successCount = results.filter((result) => result.status === "fulfilled").length;

  if (successCount === results.length) return "sent";
  if (successCount > 0) return "partial";
  return "failed";
};

const sendPaymentInvoiceEmails = async ({ payment, buyer, owner, property }) => {
  const replacements = buildInvoiceReplacements({ payment, buyer, owner, property });

  const jobs = [];

  if (buyer?.email) {
    jobs.push(sendMail(buyer.email, "PlotPerfect invoice for your property payment", "paymentInvoice.html", replacements));
  }

  if (owner?.email) {
    jobs.push(sendMail(owner.email, "PlotPerfect invoice for received property payment", "paymentInvoice.html", replacements));
  }

  if (jobs.length === 0) return "failed";

  const results = await Promise.allSettled(jobs);
  const successCount = results.filter((result) => result.status === "fulfilled").length;
  if (successCount === results.length) return "sent";
  if (successCount > 0) return "partial";
  return "failed";
};

const createPayment = async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json({
      message: "Payment created successfully",
      data: payment,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while creating payment",
      error: error.message,
    });
  }
};

const createAdvanceTokenOrder = async (req, res) => {
  try {
    const buyerId = req.user?._id;
    const { propertyId, amount, paymentMethod, notes } = req.body || {};

    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Valid propertyId is required" });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const maxAdvanceAmount = 100000;
    if (numericAmount > maxAdvanceAmount) {
      return res.status(400).json({ message: `Advance amount cannot exceed ${maxAdvanceAmount}` });
    }

    const normalizedMethod = normalizePaymentMethod(paymentMethod);
    const property = await Property.findById(propertyId).populate("owner", "name email phone role");

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyStatus = normalizePropertyStatus(property.status);
    if (isPropertyUnavailable(property)) {
      return res.status(400).json({
        message: `This property is already ${propertyStatus.toLowerCase()}`,
        details: {
          purpose: normalizePurpose(property?.purpose),
          type: normalizePropertyType(property?.type || property?.propertyType),
          status: propertyStatus,
          price: Number(property?.price || 0),
        },
      });
    }

    if (String(property.purpose || "").toLowerCase() !== "sale") {
      return res.status(400).json({ message: "Advance payment/token is available only for sale properties" });
    }

    const buyer = await User.findById(buyerId).select("name email phone role");
    if (!buyer) {
      return res.status(404).json({ message: "Buyer not found" });
    }

    const amountInPaise = Math.round(numericAmount * 100);
    const receipt = buildReceipt("adv", propertyId);
    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: {
        amount: amountInPaise,
        currency: "INR",
        receipt,
        notes: {
          propertyId: String(property._id),
          buyerId: String(buyer._id),
          propertyTitle: property.title || "Property",
        },
      },
    });

    const createdPayment = await Payment.create({
      user: buyerId,
      property: property._id,
      recipient: property.owner?._id || property.owner || null,
      initiatedBy: buyerId,
      amount: numericAmount,
      paymentMethod: normalizedMethod,
      paymentType: "advance_token",
      status: "pending",
      currency: order.currency || "INR",
      receipt: order.receipt || receipt,
      razorpayOrderId: order.id,
      gatewayStatus: order.status || "created",
      notes: typeof notes === "string" ? notes.trim() : "",
      gatewayResponse: order,
      emailStatus: "pending",
    });

    const payment = await populatePayment(Payment.findById(createdPayment._id));
    const { keyId } = getRazorpayConfig();

    res.status(201).json({
      message: "Razorpay order created successfully",
      data: {
        payment,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency || "INR",
          receipt: order.receipt || receipt,
        },
        razorpayKeyId: keyId,
        buyer: {
          name: buyer.name || "",
          email: buyer.email || "",
          phone: buyer.phone || "",
        },
        property: {
          title: property.title || "Property",
        },
      },
    });
  } catch (error) {
    console.error("Advance token order creation failed:", error?.payload || error);
    res
      .status(mapGatewayErrorStatus(error))
      .json(buildGatewayErrorBody("Error while creating Razorpay order", error));
  }
};

const createFullPaymentOrder = async (req, res) => {
  try {
    const buyerId = req.user?._id;
    const { propertyId, paymentMethod, notes } = req.body || {};

    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Valid propertyId is required" });
    }

    const normalizedMethod = normalizePaymentMethod(paymentMethod);
    const property = await Property.findById(propertyId).populate("owner", "name email phone role");

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyStatus = normalizePropertyStatus(property.status);
    if (isPropertyUnavailable(property)) {
      return res.status(400).json({ message: `This property is already ${propertyStatus.toLowerCase()}` });
    }

    if (!isEligibleForFullPayment(property)) {
      return res.status(400).json({
        message: "Full payment is available only for rent, PG, commercial, and plot properties",
        details: {
          purpose: normalizePurpose(property?.purpose),
          type: normalizePropertyType(property?.type || property?.propertyType),
          status: propertyStatus,
        },
      });
    }

    const numericAmount = Number(property.price);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message: "Property price is not available for full payment",
        details: {
          purpose: normalizePurpose(property?.purpose),
          type: normalizePropertyType(property?.type || property?.propertyType),
          status: propertyStatus,
          price: Number(property?.price || 0),
        },
      });
    }

    const buyer = await User.findById(buyerId).select("name email phone role");
    if (!buyer) {
      return res.status(404).json({ message: "Buyer not found" });
    }

    const amountInPaise = Math.round(numericAmount * 100);
    const receipt = buildReceipt("full", propertyId);
    const order = await razorpayRequest("/orders", {
      method: "POST",
      body: {
        amount: amountInPaise,
        currency: "INR",
        receipt,
        notes: {
          propertyId: String(property._id),
          buyerId: String(buyer._id),
          propertyTitle: property.title || "Property",
          paymentType: "full_property_payment",
        },
      },
    });

    const createdPayment = await Payment.create({
      user: buyerId,
      property: property._id,
      recipient: property.owner?._id || property.owner || null,
      initiatedBy: buyerId,
      amount: numericAmount,
      paymentMethod: normalizedMethod,
      paymentType: "full_property_payment",
      status: "pending",
      currency: order.currency || "INR",
      receipt: order.receipt || receipt,
      razorpayOrderId: order.id,
      gatewayStatus: order.status || "created",
      notes: appendNote(
        `Full payment for ${normalizePurpose(property.purpose) || normalizePropertyType(property.type) || "property"}`,
        typeof notes === "string" ? notes.trim() : ""
      ),
      gatewayResponse: order,
      emailStatus: "pending",
    });

    const payment = await populatePayment(Payment.findById(createdPayment._id));
    const { keyId } = getRazorpayConfig();

    console.log(`[PaymentController] Successfully created Razorpay order for Property: ${propertyId}`, {
      orderId: order.id,
      amount: order.amount,
      keyId: keyId ? `${keyId.substring(0, 8)}...` : "MISSING"
    });

    res.status(201).json({
      message: "Razorpay full-payment order created successfully",
      data: {
        payment,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency || "INR",
          receipt: order.receipt || receipt,
        },
        razorpayKeyId: keyId,
        buyer: {
          name: buyer.name || "",
          email: buyer.email || "",
          phone: buyer.phone || "",
        },
        property: {
          title: property.title || "Property",
          amount: numericAmount,
          statusOnSuccess: resolveFullPaymentStatus(property),
        },
      },
    });
  } catch (error) {
    console.error("Full payment order creation failed:", error?.payload || error);
    res
      .status(mapGatewayErrorStatus(error))
      .json(buildGatewayErrorBody("Error while creating Razorpay full-payment order", error));
  }
};

const verifyAdvanceTokenPayment = async (req, res) => {
  try {
    const buyerId = req.user?._id;
    const {
      propertyId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      amount,
      notes,
    } = req.body || {};

    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Valid propertyId is required" });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing Razorpay payment details" });
    }

    const isSignatureValid = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isSignatureValid) {
      return res.status(400).json({ message: "Invalid Razorpay payment signature" });
    }

    const payment = await Payment.findOne({
      razorpayOrderId,
      user: buyerId,
      property: propertyId,
      paymentType: "advance_token",
    });

    if (!payment) {
      return res.status(404).json({ message: "Pending payment record not found" });
    }

    const paymentDetails = await razorpayRequest(`/payments/${razorpayPaymentId}`);
    if (paymentDetails?.order_id !== razorpayOrderId) {
      return res.status(400).json({ message: "Payment does not belong to this order" });
    }

    const amountInPaise = Math.round(Number(payment.amount || amount || 0) * 100);
    let finalPaymentDetails = paymentDetails;

    if (paymentDetails.status === "authorized") {
      finalPaymentDetails = await razorpayRequest(`/payments/${razorpayPaymentId}/capture`, {
        method: "POST",
        body: {
          amount: amountInPaise,
          currency: payment.currency || "INR",
        },
      });
    }

    if (!["captured", "authorized"].includes(finalPaymentDetails?.status)) {
      payment.status = "failed";
      payment.gatewayStatus = finalPaymentDetails?.status || "failed";
      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      payment.gatewayResponse = finalPaymentDetails;
      await payment.save();

      return res.status(400).json({
        message: "Razorpay payment is not completed",
        data: finalPaymentDetails,
      });
    }

    const property = await Property.findById(propertyId).populate("owner", "name email phone role");
    const buyer = await User.findById(buyerId).select("name email phone role");
    const owner = property?.owner || null;

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const propertyStatus = normalizePropertyStatus(property.status);
    if (["SOLD", "RENTED"].includes(propertyStatus)) {
      return res.status(400).json({ message: `This property is already ${propertyStatus.toLowerCase()}` });
    }

    payment.status = "completed";
    payment.gatewayStatus = finalPaymentDetails.status || "captured";
    payment.paymentMethod = normalizePaymentMethod(finalPaymentDetails.method || payment.paymentMethod);
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.gatewayResponse = finalPaymentDetails;
    payment.paidAt = new Date();
    payment.notes = appendNote(payment.notes, notes);

    property.status = "BOOKED";
    property.bookedAt = payment.paidAt;
    property.bookedBy = buyer?._id || null;
    property.bookedPayment = payment._id;
    await property.save();

    const confirmationStatus = await sendPaymentConfirmationEmails({
      payment,
      buyer,
      owner,
      property,
    });

    const Notification = require("../models/NotificationModel");
    if (owner?._id) {
      await Notification.create({
        recipient: owner._id,
        type: "PROPERTY",
        sender: buyer?.name || "A buyer",
        message: `Property "${property.title}" has been booked! Token payment received.`,
        referenceId: property._id,
      });
    }

    const invoiceStatus = await sendPaymentInvoiceEmails({
      payment,
      buyer,
      owner,
      property,
    });

    payment.emailStatus =
      confirmationStatus === "sent" && invoiceStatus === "sent"
        ? "sent"
        : confirmationStatus === "failed" && invoiceStatus === "failed"
        ? "failed"
        : "partial";
    await payment.save();

    const hydratedPayment = await populatePayment(Payment.findById(payment._id));

    res.status(200).json({
      message: "Advance payment/token completed successfully",
      data: hydratedPayment,
    });
  } catch (error) {
    console.error("Advance token payment verification failed:", error?.payload || error);
    res
      .status(mapGatewayErrorStatus(error))
      .json(buildGatewayErrorBody("Error while verifying advance payment/token", error));
  }
};

const verifyFullPayment = async (req, res) => {
  try {
    const buyerId = req.user?._id;
    const { propertyId, razorpayOrderId, razorpayPaymentId, razorpaySignature, notes } = req.body || {};

    if (!buyerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Valid propertyId is required" });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Missing Razorpay payment details" });
    }

    const isSignatureValid = verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isSignatureValid) {
      return res.status(400).json({ message: "Invalid Razorpay payment signature" });
    }

    const payment = await Payment.findOne({
      razorpayOrderId,
      user: buyerId,
      property: propertyId,
      paymentType: "full_property_payment",
    });

    if (!payment) {
      return res.status(404).json({ message: "Pending full-payment record not found" });
    }

    const paymentDetails = await razorpayRequest(`/payments/${razorpayPaymentId}`);
    if (paymentDetails?.order_id !== razorpayOrderId) {
      return res.status(400).json({ message: "Payment does not belong to this order" });
    }

    const amountInPaise = Math.round(Number(payment.amount || 0) * 100);
    let finalPaymentDetails = paymentDetails;

    if (paymentDetails.status === "authorized") {
      finalPaymentDetails = await razorpayRequest(`/payments/${razorpayPaymentId}/capture`, {
        method: "POST",
        body: {
          amount: amountInPaise,
          currency: payment.currency || "INR",
        },
      });
    }

    if (!["captured", "authorized"].includes(finalPaymentDetails?.status)) {
      payment.status = "failed";
      payment.gatewayStatus = finalPaymentDetails?.status || "failed";
      payment.razorpayPaymentId = razorpayPaymentId;
      payment.razorpaySignature = razorpaySignature;
      payment.gatewayResponse = finalPaymentDetails;
      await payment.save();

      return res.status(400).json({
        message: "Razorpay payment is not completed",
        data: finalPaymentDetails,
      });
    }

    const property = await Property.findById(propertyId).populate("owner", "name email phone role");
    const buyer = await User.findById(buyerId).select("name email phone role");
    const owner = property?.owner || null;

    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    if (!isEligibleForFullPayment(property)) {
      return res.status(400).json({
        message: "This property is not eligible for full payment through this flow",
        details: {
          purpose: normalizePurpose(property?.purpose),
          type: normalizePropertyType(property?.type || property?.propertyType),
          status: propertyStatus,
        },
      });
    }

    const propertyStatus = normalizePropertyStatus(property.status);
    if (isPropertyUnavailable(property)) {
      return res.status(400).json({
        message: `This property is already ${propertyStatus.toLowerCase()}`,
        details: {
          purpose: normalizePurpose(property?.purpose),
          type: normalizePropertyType(property?.type || property?.propertyType),
          status: propertyStatus,
          price: Number(property?.price || 0),
        },
      });
    }

    payment.status = "completed";
    payment.gatewayStatus = finalPaymentDetails.status || "captured";
    payment.paymentMethod = normalizePaymentMethod(finalPaymentDetails.method || payment.paymentMethod);
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.gatewayResponse = finalPaymentDetails;
    payment.paidAt = new Date();
    payment.notes = appendNote(payment.notes, notes);

    property.status = resolveFullPaymentStatus(property);
    property.bookedAt = payment.paidAt;
    property.bookedBy = buyer?._id || null;
    property.bookedPayment = payment._id;
    await property.save();

    const confirmationStatus = await sendPaymentConfirmationEmails({
      payment,
      buyer,
      owner,
      property,
    });

    const Notification = require("../models/NotificationModel");
    if (owner?._id) {
      await Notification.create({
        recipient: owner._id,
        type: "PROPERTY",
        sender: buyer?.name || "A buyer",
        message: `Full payment received for "${property.title}"! Property is now ${property.status}.`,
        referenceId: property._id,
      });
    }

    const invoiceStatus = await sendPaymentInvoiceEmails({
      payment,
      buyer,
      owner,
      property,
    });

    payment.emailStatus =
      confirmationStatus === "sent" && invoiceStatus === "sent"
        ? "sent"
        : confirmationStatus === "failed" && invoiceStatus === "failed"
        ? "failed"
        : "partial";
    await payment.save();

    const hydratedPayment = await populatePayment(Payment.findById(payment._id));

    res.status(200).json({
      message: "Full property payment completed successfully",
      data: hydratedPayment,
    });
  } catch (error) {
    console.error("Full payment verification failed:", error?.payload || error);
    res
      .status(mapGatewayErrorStatus(error))
      .json(buildGatewayErrorBody("Error while verifying full payment", error));
  }
};

const downloadPaymentInvoice = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const viewerId = String(req.user?._id || "");
    const viewerRole = String(req.user?.role || "").toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
      return res.status(400).json({ message: "Valid payment id is required" });
    }

    const payment = await populatePayment(Payment.findById(paymentId));
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const allowedUserIds = [
      payment.user?._id || payment.user,
      payment.recipient?._id || payment.recipient,
      payment.initiatedBy?._id || payment.initiatedBy,
    ]
      .filter(Boolean)
      .map((value) => String(value));

    const isPrivileged = ["admin", "support"].includes(viewerRole);
    if (!isPrivileged && !allowedUserIds.includes(viewerId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { property, buyer, owner } = await loadPaymentParties(payment);
    const replacements = buildInvoiceReplacements({ payment, buyer, owner, property });
    const invoiceHtml = sendMail.renderTemplate("paymentInvoice.html", replacements);
    const invoiceName = `plotperfect-invoice-${payment.receipt || payment._id}.html`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${invoiceName}"`);
    return res.status(200).send(invoiceHtml);
  } catch (error) {
    return res.status(500).json({
      message: "Error while downloading invoice",
      error: error.message,
    });
  }
};

const getUserPayments = async (req, res) => {
  try {
    const requestedUserId = req.params.userId;
    const viewerId = req.user?._id;
    const viewerRole = String(req.user?.role || "").toLowerCase();

    if (
      String(viewerId) !== String(requestedUserId) &&
      !["admin", "support"].includes(viewerRole)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const payments = await populatePayment(
      Payment.find({
        $or: [
          { user: requestedUserId },
          { recipient: requestedUserId },
          { initiatedBy: requestedUserId },
        ],
      }).sort({ updatedAt: -1, createdAt: -1 })
    );

    res.status(200).json({
      message: "Payments fetched successfully",
      data: payments,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while fetching payments",
      error: error.message,
    });
  }
};

const getAllPayments = async (_req, res) => {
  try {
    const payments = await populatePayment(
      Payment.find().sort({ updatedAt: -1, createdAt: -1 })
    );

    res.status(200).json({
      message: "All payments fetched successfully",
      data: payments,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while fetching all payments",
      error: error.message,
    });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const payment = await populatePayment(
      Payment.findByIdAndUpdate(
        req.params.id,
        { status: req.body.status, notes: req.body.notes ?? undefined },
        { returnDocument: "after" }
      )
    );

    res.status(200).json({
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error while updating payment",
      error: error.message,
    });
  }
};

module.exports = {
  createPayment,
  createAdvanceTokenOrder,
  createFullPaymentOrder,
  verifyAdvanceTokenPayment,
  verifyFullPayment,
  downloadPaymentInvoice,
  getUserPayments,
  getAllPayments,
  updatePaymentStatus,
};
