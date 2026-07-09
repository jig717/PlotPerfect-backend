const mongoose = require("mongoose");

const propertyImageSchema = new mongoose.Schema({

  property_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },

  image_url: {
    type: String,
    required: true,
    trim: true,
  }

}, { timestamps: true });

module.exports = mongoose.model("PropertyImage", propertyImageSchema);
