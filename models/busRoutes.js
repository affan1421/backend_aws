const mongoose = require("mongoose");
const autoIncrement = require("mongoose-auto-increment");
const { Schema, model } = mongoose;

const busRoutesSchema = new Schema(
  {
    routeName: {
      type: String,
      required: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: "SchoolVehicles",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "busDriver",
      required: [true, "driverId is required"],
    },
    tripNo: {
      type: Number,
      required: true,
      unique: true,
    },
    seatingCapacity: {
      type: Number,
      required: true,
      default: 0,
    },
    availableSeats: {
      type: Number,
      required: true,
      default: 0,
    },
    stops: [
      {
        label: {
          type: String,
          required: true,
        },
        data: {
          stop: {
            type: String,
            required: true,
          },
          oneWay: {
            type: Number,
            required: true,
            default: 0,
          },
          roundTrip: {
            type: Number,
            required: true,
            default: 0,
          },
        },
      },
    ],
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "schools",
      required: [true, "schoolID is required"],
    },
  },
  {
    timestamps: true,
  }
);

const autoIncrementOptions = {
  model: "busRoutes",
  field: "tripNo",
  startAt: 1,
};

busRoutesSchema.plugin(autoIncrement.plugin, autoIncrementOptions);

const busRoutes = model("busRoutes", busRoutesSchema);

module.exports = busRoutes;
