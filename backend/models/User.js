import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  
  // Personalization Profile Fields
  personalizationAnswers: { 
    type: mongoose.Schema.Types.Mixed, 
    default: null 
  },
  personalizationPrompt: { 
    type: String, 
    default: null 
  },
  profileCompletedAt: { 
    type: Date, 
    default: null 
  },
}, { timestamps: true });

export default mongoose.model("User", UserSchema);
