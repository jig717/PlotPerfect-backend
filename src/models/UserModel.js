  const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { 
    type: String,
     required: true 
    },
  email: { 
    type: String,
     required: true, 
     unique: true 
  },
  phone:{ 
    type: String 
  },
  password: {
  type: String,
  required: true,
  select: false
},
  role: {
    type: String,
    enum: ["admin", "agent", "owner", "buyer","support"],
    default: "buyer"  
  },
  profileImage:{
    type:String,    
    default:""
  }
}, { timestamps: true });     

module.exports = mongoose.model("User", UserSchema);