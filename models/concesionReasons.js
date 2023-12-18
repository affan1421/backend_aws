const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const concessionReasonSchema = new Schema(
  {
    reason: {
      type: String,
      required: [true, "Reason is required"],
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'schools'
    }
  },
  { timestamps: true }
);

const concessionReason = model("concessionReasons", concessionReasonSchema);

module.exports = concessionReason;