const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const busDriversSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    contactNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    emergencyNumber: {
      type: Number,
      required: true,
    },
    drivingLicense: {
      type: String,
      required: true,
      unique: true,
    },
    aadharNumber: {
      type: Number,
      required: true,
      unique: true,
    },
    bloodGroup: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "schools",
      required: [true, "school ID required"],
    },
    attachments: {
      type: [String],
    },
  },
  {
    timestamps: true,
  }
);

const busDriver = model("busDriver", busDriversSchema);

module.exports = busDriver;
