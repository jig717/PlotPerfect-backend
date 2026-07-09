const mongoose = require("mongoose");

const InquirySchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property"
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  message:{
    type:String
  },
  status: {
    type: String,
    default: "pending"
  },
  response: {
    type: String,
    default: ""
  },
  source: { 
    type: String, 
    default: "Other" } 
    
}, { timestamps: true });

module.exports = mongoose.model("Inquiry", InquirySchema);