const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    required: true
  },

  rating: {
    type:Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true,
    trim: true
  },
  reviewerName: {
    type: String,
    trim: true,
    default: ""
  },
  reviewerRole: {
    type: String,
    trim: true,
    default: ""
  }
},
{timestamps:true});

module.exports = mongoose.model("Review", reviewSchema);
