const router = require('express').Router();
const { 
    createReview,
    getLatestReviews,
    getReviewsByProperty,
    deleteReview } = require('../controllers/ReviewController');
const { protect } = require('../middlewares/AuthMiddleware');
const { authorizeRoles } = require('../middlewares/RoleMiddleware');

    router.post("/", protect, authorizeRoles("buyer", "owner", "agent", "admin"), createReview);
    router.get("/", getLatestReviews);
    router.get("/:propertyId", getReviewsByProperty);
    router.delete("/:id", protect, deleteReview);

    module.exports = router;
