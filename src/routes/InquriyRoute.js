const { authenticate } = require("../middlewares/AuthMiddleware");
const { authorizeRoles } = require("../middlewares/RoleMiddleware");

const router = require("express").Router();

const { createInquiry,
        getAllInquiries,
        getInquiriesByUser, 
        deleteInquiry,
        getInquiriesForAgent,
        respondInquiry
    } = require("../controllers/InquriyController");

router.post("/", authenticate, authorizeRoles("buyer", "user"), createInquiry);
router.get("/all", getAllInquiries);
router.get("/user/:userid", getInquiriesByUser);
router.delete("/:id", deleteInquiry);
router.get("/agent", authenticate, authorizeRoles("agent", "owner"), getInquiriesForAgent);
router.patch("/:id/respond", authenticate, authorizeRoles("agent", "owner", "admin", "support"), respondInquiry);
module.exports = router;
