const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema({
  title:{
    type: String
  },
  description:{
    type: String
  },

  type: {
    type: String,
    enum: ["apartment", "house", "villa", "plot", "commercial", "pg", "farmhouse", "Farmhouse"]
  },

  purpose: {
    type: String,
    enum: ["sale", "rent", "pg"]
  },

  price:{
    type:Number
  },
  area: {
    type:String
  },
  bedrooms: {
    type:Number
  },
  bathrooms: {
    type:Number
  },
  guestCapacity: {
    type:Number
  },
  location: {
    city: String,
    state: String,
    address: String
  },

  images:[{
    type: String,
    default :""
  }], 
  amenities: [{
    type: String,
    trim: true,
  }],
  floorPlans: [{
    title: {
      type: String,
      trim: true,
    },
    label: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    carpetArea: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
    },
    possession: {
      type: String,
      trim: true,
    },
    launchStatus: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
      trim: true,
    },
    imageAlt: {
      type: String,
      trim: true,
    },
    beds: {
      type: Number,
    },
    baths: {
      type: Number,
    },
  }],

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  bookedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  bookedPayment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment",
    default: null
  },
  bookedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
   enum: ["PENDING", "APPROVED", "BOOKED", "SOLD", "RENTED"],
    default: "PENDING"
  },
  views: { 
    type: Number, 
    default: 0
   },
},{timestamps:true});

module.exports = mongoose.model("Property", propertySchema);
