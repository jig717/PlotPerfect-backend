const Review = require('../models/ReviewModel');
const User = require('../models/UserModel');
const mongoose = require("mongoose");

// CREATE REVIEW
const createReview = async (req, res) => {
    try {
        const { 
            property, 
            rating,
            comment,
            reviewerName,
            reviewerRole } = req.body;
        const user = req.user?._id;

        if (!user || !property || !rating || !comment) {
            return res.status(400).json({
                message: "Missing required fields: property, rating and comment are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(property)) {
            return res.status(400).json({
                message: "Invalid property id"
            });
        }

        const numericRating = Number(rating);
        if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
            return res.status(400).json({
                message: "Rating must be between 1 and 5"
            });
        }

        let resolvedReviewerName = (reviewerName || "").trim();
        let resolvedReviewerRole = (reviewerRole || "").trim();

        if (user && (!resolvedReviewerName || !resolvedReviewerRole)) {
            const reviewer = await User.findById(user).select("name role");
            if (reviewer) {
                if (!resolvedReviewerName) resolvedReviewerName = reviewer.name || "";
                if (!resolvedReviewerRole) resolvedReviewerRole = reviewer.role || "";
            }
        }

        const review = await Review.create({
            user,
            property,
            rating: numericRating,
            comment: String(comment).trim(),
            reviewerName: resolvedReviewerName,
            reviewerRole: resolvedReviewerRole
        });
        res.status(201).json({
            message: "Review added successfully",
            data: review
        });

    } catch (error) {
        res.status(500).json({
            message: "Error while creating review",
            error: error.message
        });
    }
};

// GET LATEST REVIEWS (HOME TESTIMONIALS)
const getLatestReviews = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);

        const reviews = await Review
            .find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("user", "name role")
            .populate("property", "title location");

        res.status(200).json({
            message: "Latest reviews fetched successfully",
            total: reviews.length,
            data: reviews
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while fetching latest reviews",
            error: error.message
        });
    }
};

// GET REVIEWS BY PROPERTY
const getReviewsByProperty = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.propertyId)) {
            return res.status(400).json({
                message: "Invalid property id"
            });
        }

        const reviews = await Review
            .find({ property: req.params.propertyId })
            .populate("user", "name email")
            .populate("property", "title price location");

        res.status(200).json({
            message: "Reviews fetched successfully",
            total: reviews.length,
            data: reviews
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while fetching reviews",
            error: error.message
        });
    }
};

// DELETE REVIEW
const deleteReview = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                message: "Invalid review id"
            });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({
                message: "Review not found"
            });
        }

        const canDelete =
            String(review.user) === String(req.user?._id) ||
            req.user?.role === "admin" ||
            req.user?.role === "support";

        if (!canDelete) {
            return res.status(403).json({
                message: "Access denied"
            });
        }

        await review.deleteOne();
        res.status(200).json({
            message: "Review deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Error while deleting review",
            error: error.message
        });
    }
};
module.exports = {
    createReview,
    getLatestReviews,
    getReviewsByProperty,
    deleteReview
};
