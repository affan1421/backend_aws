const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const studentTransportSchema = new Schema(
  {
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "schools",
      required: [true, "school ID required"],
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "sections",
      required: [true, "school ID required"],
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "students",
      required: [true, "school ID required"],
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "academicyears",
    },
    transportSchedule: {
      type: String,
      enum: ["pickup", "drop", "both"],
      default: "both",
      required: true,
    },
    selectedRouteId: {
      type: Schema.Types.ObjectId,
      ref: "busRoutes",
      required: true,
    },
    stopId: {
      type: Schema.Types.ObjectId,
      ref: "busRoutes",
      required: true,
    },
    feeMonths: {
      type: [String],
      required: true,
    },
    monthlyFees: {
      type: Number,
    },
    feeDetails: [
      {
        monthName: {
          type: String,
          required: true,
        },
        totalAmount: {
          type: Number,
          default: 0,
        },
        paidAmount: {
          type: Number,
          default: 0,
        },
        dueAmount: {
          type: Number,
          default: 0,
        },
        status: {
          type: String,
          enum: ["Late", "Paid", "Due", "Upcoming"],
          default: "Due",
        },
        paymentMethod: {
          type: String,
        },
        receiptId: {
          type: String,
        },
        paymentDate: {
          type: Date,
        },
        createdBy: {
          type: Schema.Types.ObjectId,
        },
        discount: {
          type: Number,
          default: 0,
        },
        concession: {
          type: Number,
          default: 0,
        },
      },
    ],

    tripNumber: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

studentTransportSchema.pre("save", function (next) {
  const months = this.feeMonths;

  const currentMonth = new Date().toLocaleString("en-US", { month: "long" });

  // Populate feeDetails array based on feeMonth
  this.feeDetails = months.map((month) => ({
    monthName: month,
    paidAmount: 0,
    totalAmount: this.monthlyFees,
    dueAmount: this.monthlyFees,
    status: month === currentMonth ? "Due" : "Upcoming",
  }));

  next();
});

const StudentsTransport = model("StudentsTransport", studentTransportSchema);

module.exports = StudentsTransport;
