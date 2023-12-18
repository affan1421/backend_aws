const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const vehicleSchema = new Schema(
  {
    registrationNumber: {
      type: String,
      required: true,
    },
    assignedVehicleNumber: {
      type: Number,
      unique: true,
      required: true,
    },
    seatingCapacity: {
      type: Number,
      required: true,
    },
    taxValid: {
      type: Date,
      required: true,
    },
    fcValid: {
      type: Date,
      required: true,
    },
    vehicleMode: {
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

const SchoolVehicles = model("SchoolVehicles", vehicleSchema);

module.exports = SchoolVehicles;
