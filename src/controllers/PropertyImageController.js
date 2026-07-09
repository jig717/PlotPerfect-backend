const Property = require("../models/PropertyModel");
const PropertyImage = require("../models/PropertyImageModel");
const uploadToCloudinary = require("../utilis/UploadeToCloudinary");
const mongoose = require("mongoose");
const { emitPropertyEvent } = require("../utilis/propertyEvents");
const { serializeProperty } = require("../utilis/propertyResponse");

const isCloudinaryConfigured = () =>
  Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );

const uploadImage = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({
        message: "Cloudinary is not configured. Please check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.",
      });
    }

    const files = Array.isArray(req.files) && req.files.length > 0
      ? req.files
      : (req.file ? [req.file] : []);

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const body = req.body || {};
    const propertyId = body.property_id || body.propertyId;
    if (!propertyId) {
      return res.status(400).json({ message: "Missing property_id or propertyId" });
    }

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    // Check if property exists
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const uploadResults = await Promise.all(
      files.map((file) => uploadToCloudinary(file.buffer))
    );
    const imageUrls = uploadResults.map((result) => result.secure_url);
    const uploadedImages = await PropertyImage.insertMany(
      imageUrls.map((imageUrl) => ({
        property_id: propertyId,
        image_url: imageUrl,
      }))
    );

    //  Append the new image URLs to the property's images array
    property.images = [...new Set([...(property.images || []), ...imageUrls])];
    await property.save();

    const refreshedProperty = serializeProperty(property);
    emitPropertyEvent("property.images.updated", {
      propertyId: property._id.toString(),
      property: refreshedProperty,
      images: uploadedImages,
    });

    res.status(201).json({
      message: `${uploadedImages.length} image(s) uploaded`,
      data: uploadedImages,
      property: refreshedProperty,
      propertyImages: refreshedProperty.images,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

const getPropertyImages = async (req, res) => {
  try {
    const { propertyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(propertyId)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const property = await Property.findById(propertyId).populate("owner", "name email phone role");
    if (!property) {
      return res.status(404).json({ message: "Property not found" });
    }

    const images = await PropertyImage.find({ property_id: propertyId }).sort({ createdAt: -1 });
    res.json({
      success: true,
      total: images.length,
      property: serializeProperty(property),
      data: images,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch property images", error: error.message });
  }
};

const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid image id" });
    }

    const image = await PropertyImage.findById(id);
    if (!image) {
      return res.status(404).json({ message: "Image not found" });
    }

    await PropertyImage.findByIdAndDelete(id);

    const property = await Property.findById(image.property_id);
    let serializedProperty = null;
    if (property) {
      property.images = (property.images || []).filter((item) => item !== image.image_url);
      await property.save();
      serializedProperty = serializeProperty(property);
      emitPropertyEvent("property.images.updated", {
        propertyId: property._id.toString(),
        property: serializedProperty,
        deletedImageId: id,
        deletedImageUrl: image.image_url,
      });
    }

    res.json({
      message: "Image deleted",
      property: serializedProperty,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete image", error: error.message });
  }
};

const getImageById = async (req, res) => {
  const { id } = req.params;
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid property id" });
    }

    const images = await PropertyImage.find({ property_id: id });
    if (!images || images.length === 0) {
      return res.status(404).json({ message: "No images found for this property" });
    }
    res.json(images);
  } catch (error) {
    console.error("Error in getImageById:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { uploadImage, getPropertyImages, deleteImage, getImageById };
