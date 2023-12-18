const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const tcReasonSchema = new Schema(
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

const tcReason = model("tcReasons", tcReasonSchema);

module.exports = tcReason;
