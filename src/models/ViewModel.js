const mongoose = require("mongoose");

const viewSchema = new mongoose.Schema({
  propertyId:{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Property", 
    required: true 
  },
  date: { 
    type: Date, 
    required: true,
     default: Date.now
     },
  views: { 
    type: Number, 
    default: 1
   }
}, { timestamps: true });

viewSchema.index({ propertyId: 1, date: 1 }, 
  { unique: true });

module.exports = mongoose.model("View", viewSchema);