const Property = require("../models/PropertyModel");
const Inquiry = require("../models/InquiryModel");
const View = require("../models/ViewModel");
const SaleRequest = require("../models/SaleRequestModel");

const ACTIVE_PROPERTY_STATUSES = new Set(["PENDING", "APPROVED"]);
const COMMISSION_COMPLETE_STATUSES = new Set(["earned", "paid"]);

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const formatMonthKey = (date) =>
  new Date(date).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });

const buildCommissionGraph = (saleRequests = [], months = 6) => {
  const now = new Date();
  const buckets = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const bucketDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${bucketDate.getFullYear()}-${String(bucketDate.getMonth() + 1).padStart(2, "0")}`,
      label: formatMonthKey(bucketDate),
      earnings: 0,
      sales: 0,
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  saleRequests.forEach((saleRequest) => {
    if (!COMMISSION_COMPLETE_STATUSES.has(String(saleRequest.commissionStatus || "").toLowerCase())) {
      return;
    }

    const effectiveDate =
      saleRequest.commissionEarnedAt ||
      saleRequest.soldAt ||
      saleRequest.updatedAt ||
      saleRequest.createdAt;
    const parsedDate = effectiveDate ? new Date(effectiveDate) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return;

    const key = `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`;
    const bucket = bucketMap.get(key);
    if (!bucket) return;

    bucket.earnings += Number(saleRequest.commissionAmount || 0);
    bucket.sales += 1;
  });

  return buckets.map((bucket) => ({
    ...bucket,
    earnings: Number(bucket.earnings.toFixed(2)),
  }));
};

const buildCommissionSummary = (saleRequests = []) => {
  let totalCommissionEarned = 0;
  let totalPendingCommission = 0;
  let completedSales = 0;

  saleRequests.forEach((saleRequest) => {
    const commissionAmount = Number(saleRequest.commissionAmount || 0);
    const commissionStatus = String(saleRequest.commissionStatus || "").toLowerCase();

    if (commissionStatus === "pending") {
      totalPendingCommission += commissionAmount;
    }

    if (COMMISSION_COMPLETE_STATUSES.has(commissionStatus)) {
      totalCommissionEarned += commissionAmount;
      completedSales += 1;
    }
  });

  return {
    totalCommissionEarned: Number(totalCommissionEarned.toFixed(2)),
    totalPendingCommission: Number(totalPendingCommission.toFixed(2)),
    completedSales,
  };
};

const getAgentStats = async (req, res) => {
  try {
    const agentId = req.user._id;
    const properties = await Property.find({ owner: agentId });
    const propertyIds = properties.map((property) => property._id);
    const inquiries = propertyIds.length
      ? await Inquiry.find({ property: { $in: propertyIds } })
      : [];
    const saleRequests = await SaleRequest.find({ acceptedBy: agentId, status: { $in: ["accepted", "sold", "payment_completed"] } });

    const totalViews = properties.reduce((sum, property) => sum + (property.views || 0), 0);
    const totalValue = properties.reduce((sum, property) => sum + (property.price || 0), 0);
    const activeListings = properties.filter((property) => ACTIVE_PROPERTY_STATUSES.has(property.status)).length;
    const totalInquiries = inquiries.length;

    const soldOrRented = properties.filter((property) => property.status === "SOLD" || property.status === "RENTED");
    const conversionRate = properties.length > 0 ? (soldOrRented.length / properties.length) * 100 : 0;

    const inquiriesWithResponse = inquiries.filter((inquiry) => inquiry.response && inquiry.response.length > 0);
    let avgResponseTimeMs = 0;
    if (inquiriesWithResponse.length > 0) {
      const totalResponseTime = inquiriesWithResponse.reduce((sum, inquiry) => {
        const created = new Date(inquiry.createdAt);
        const responded = new Date(inquiry.updatedAt);
        return sum + (responded - created);
      }, 0);
      avgResponseTimeMs = totalResponseTime / inquiriesWithResponse.length;
    }

    const avgResponseHours = `${(avgResponseTimeMs / (1000 * 3600)).toFixed(1)}h`;
    const commissionSummary = buildCommissionSummary(saleRequests);

    res.json({
      totalViews,
      totalValue,
      activeListings,
      totalInquiries,
      conversionRate: Math.round(conversionRate),
      avgResponseTime: avgResponseHours,
      totalCommissionEarned: commissionSummary.totalCommissionEarned,
      totalPendingCommission: commissionSummary.totalPendingCommission,
      completedAgentSales: commissionSummary.completedSales,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching agent stats" });
  }
};

const getDailyViews = async (req, res) => {
  try {
    const agentId = req.user._id;
    const properties = await Property.find({ owner: agentId }).select("_id");
    const propertyIds = properties.map((property) => property._id);

    if (propertyIds.length === 0) {
      return res.json([]);
    }

    const last7Days = startOfDay(new Date());
    last7Days.setDate(last7Days.getDate() - 6);

    const views = await View.aggregate([
      {
        $match: {
          propertyId: { $in: propertyIds },
          date: { $gte: last7Days },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          views: { $sum: "$views" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result = [];
    const today = startOfDay(new Date());
    for (let i = 6; i >= 0; i -= 1) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const dateStr = day.toISOString().slice(0, 10);
      const found = views.find((view) => view._id === dateStr);
      result.push({
        date: dateStr,
        views: found ? found.views : 0,
      });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching daily views" });
  }
};

const getLeadSources = async (req, res) => {
  try {
    const agentId = req.user._id;
    const properties = await Property.find({ owner: agentId }).select("_id");
    const propertyIds = properties.map((property) => property._id);

    if (propertyIds.length === 0) {
      return res.json({});
    }

    const inquiries = await Inquiry.find({ property: { $in: propertyIds } });
    const sourceCounts = {};

    inquiries.forEach((inquiry) => {
      const source = inquiry.source || inquiry.category || "Other";
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    res.json(sourceCounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching lead sources" });
  }
};

const getAgentCommissionAnalytics = async (req, res) => {
  try {
    const agentId = req.user._id;
    const saleRequests = await SaleRequest.find({ acceptedBy: agentId })
      .populate("property", "title price location.city location.address images status")
      .populate("owner", "name email phone role")
      .populate("payment", "amount status paymentMethod paymentType paidAt")
      .sort({ updatedAt: -1, createdAt: -1 });

    const summary = buildCommissionSummary(saleRequests);
    const graph = buildCommissionGraph(saleRequests, 6);
    const totalSalesManaged = saleRequests.length;
    const latestCommissionAt = saleRequests
      .map((saleRequest) => saleRequest.commissionEarnedAt || saleRequest.soldAt || null)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    const sales = saleRequests.map((saleRequest) => ({
      _id: saleRequest._id,
      status: saleRequest.status,
      soldPrice: saleRequest.soldPrice,
      soldAt: saleRequest.soldAt,
      commissionRate: saleRequest.commissionRate,
      commissionAmount: saleRequest.commissionAmount,
      commissionStatus: saleRequest.commissionStatus,
      commissionCalculatedAt: saleRequest.commissionCalculatedAt,
      commissionEarnedAt: saleRequest.commissionEarnedAt,
      property: saleRequest.property,
      owner: saleRequest.owner,
      payment: saleRequest.payment,
      createdAt: saleRequest.createdAt,
      updatedAt: saleRequest.updatedAt,
    }));

    res.json({
      message: "Agent commission analytics fetched successfully",
      data: {
        summary: {
          ...summary,
          totalSalesManaged,
          latestCommissionAt,
        },
        graph,
        sales,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching agent commission analytics" });
  }
};

module.exports = {
  getAgentStats,
  getDailyViews,
  getLeadSources,
  getAgentCommissionAnalytics,
};
