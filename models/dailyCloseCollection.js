const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const dailyCloseSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "Schools",
      required: [true, "School ID is required"],
    },
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    bankName: {
      type: String,
      required: [true, "Bank name is required"],
    },
    cashAmount: {
      type: Number,
      default: 0,
    },
    expenseAmount: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      required: [true, "Choose a Date"],
    },
    attachments: {
      type: [String],
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    reason: {
      type: String,
    },
  },
  { timestamps: true }
);

const DailyCloseCollection = model("DailyCloseCollection", dailyCloseSchema);

module.exports = DailyCloseCollection;
