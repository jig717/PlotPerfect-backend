const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },

  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  reason: {
    type: String
  },

  status: {
    type: String,
    enum: ["pending", "reviewed"],
    default: "pending"
  }
},{timestamps:true})

module.exports = mongoose.model("Report", reportSchema);