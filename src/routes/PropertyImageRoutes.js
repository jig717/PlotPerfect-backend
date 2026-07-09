const { authenticate } = require("../middlewares/AuthMiddleware");
const upload = require("../middlewares/UploadMiddleware");
const express = require("express");
const router = express.Router();

const {
  uploadImage,
  getPropertyImages,
  deleteImage,
  getImageById
} = require("../controllers/PropertyImageController");

router.post("/", authenticate, upload.any(), uploadImage);
router.get("/:propertyId", getPropertyImages);
router.delete("/:id", deleteImage);
router.get("/image/:id", getImageById);

module.exports = router;
