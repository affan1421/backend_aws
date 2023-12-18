const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const concessionSchema = new Schema(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student ID is required"],
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: "schools",
      required: [true, "School ID is required"],
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "sections",
      required: [true, "Section ID is required"],
    },
    reason: {
      type: Schema.Types.ObjectId,
      ref: "concessionReasons",
      required: [true, "Reason is required"],
    },
    feeCategoryIds: [
      {
        feeInstallmentId: {
          type: Schema.Types.ObjectId,
          ref: "feeInstallments",
          required: [true, "Fee Installment ID is required"],
        },
        concessionAmount: {
          type: Number,
          required: [true, "Concession Amount is required"],
          default: 0,
        },
      },
    ],
    totals: [
      {
        value: String,
        id: Schema.Types.ObjectId,
      },
    ],
    totalConcession: {
      type: Number,
      required: [true, "Total Concession is required"],
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: [true, "Total Amount is required"],
      default: 0,
    },
    paidAmount: {
      type: Number,
      required: [true, "Paid Amount is required"],
      default: 0,
    },
    dueAmount: {
      type: Number,
      required: [true, "Due Amount is required"],
    },
    discountAmount: {
      type: Number,
      default: 0,
      required: [true, "Due Amount is required"],
    },
    comment: String,
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    attachments: {
      type: [String],
    },
  },
  { timestamps: true }
);

const Concession = model("concession", concessionSchema);

module.exports = Concession;
