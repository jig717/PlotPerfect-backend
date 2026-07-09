const { authenticate } = require("../middlewares/AuthMiddleware");
const router = require("express").Router();

const { 
    createProperty,
    getAllProperties,
    getPropertyById, 
    updateProperty, 
    deleteProperty,
    getPropertiesByOwner,
    streamProperties,
    getPropertyFilters
} = require("../controllers/PropertyController");
router.post("/", authenticate ,createProperty);
router.get("/filters", getPropertyFilters);
router.get("/all",getAllProperties);
router.get("/stream", streamProperties);
router.get("/owner/:ownerId", authenticate, getPropertiesByOwner);
router.get("/:id",getPropertyById); 
router.put("/:id",updateProperty);
router.delete("/:id", deleteProperty);

module.exports = router;
