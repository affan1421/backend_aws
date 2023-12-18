const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const notificationsSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["PAYMENT", "TC", "RECEIPT", "DISCOUNT", "DONATION"],
    },
    seen: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["SUCCESS", "ERROR", "WARNING", "DEFAULT"],
      default: "DEFAULT",
    },
    userRole: {
      type: String,
      enum: ["ADMIN", "MANAGEMENT"],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "schools",
    },
    action: String,
    data: {},
  },
  { timestamps: true }
);

const notifications = model("notifications", notificationsSchema);

module.exports = notifications;
