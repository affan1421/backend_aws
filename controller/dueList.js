const mongoose = require("mongoose");
const moment = require("moment");
const excel = require("excel4node");
const FeeInstallment = require("../models/feeInstallment");
const CatchAsync = require("../utils/catchAsync");
const ErrorResponse = require("../utils/errorResponse");
const SuccessResponse = require("../utils/successResponse");
const getSections = require("../helpers/section");

const Sections = mongoose.connection.db.collection("sections");
const Students = mongoose.connection.db.collection("students");
/**
 * @desc  Build Payment Status Stages
 * @param {Array} paymentStatus - ['FULL', 'PARTIAL', 'NOT']
 * @param {Array} scheduleDates - ['DD/MM/YYYY']
 * @returns {Array} stages - Array of stages
 */
const buildPaymentStatusStages = (paymentStatus, scheduleDates) => {
  const addFieldStage = {
    $addFields: {
      dueAmount: {
        $subtract: ["$netAmount", "$paidAmount"],
      },
    },
  };

  const groupByStudent = {
    $group: {
      _id: "$studentId",
      recCount: {
        $sum: 1,
      },
      sectionId: {
        $first: "$sectionId",
      },
      totalNetAmount: {
        $sum: "$netAmount",
      },
      paidAmount: {
        $sum: "$paidAmount",
      },
      dueAmount: {
        $sum: "$dueAmount",
      },
    },
  };
  if (!paymentStatus || paymentStatus === "FULL,NOT,PARTIAL") {
    return [addFieldStage, groupByStudent];
  }

  const paymentStages = {
    FULL: [
      { $match: { status: { $in: ["Paid", "Late"] }, paidAmount: { $gt: 0 } } },
      groupByStudent,
      { $match: { recCount: scheduleDates.length } },
    ],
    PARTIAL: [
      addFieldStage,
      groupByStudent,
      {
        $match: {
          $expr: {
            $and: [{ $ne: ["$dueAmount", 0] }, { $lt: ["$dueAmount", "$totalNetAmount"] }],
          },
        },
      },
    ],
    NOT: [addFieldStage, groupByStudent, { $match: { $expr: { $eq: ["$paidAmount", 0] } } }],
    "FULL,PARTIAL": [
      addFieldStage,
      groupByStudent,
      { $match: { $expr: { $ne: ["$paidAmount", 0] } } },
    ],
    "FULL,NOT": [
      addFieldStage,
      groupByStudent,
      {
        $match: {
          $expr: {
            $or: [
              {
                $eq: ["$totalNetAmount", "$paidAmount"],
              },
              {
                $eq: ["$totalNetAmount", "$dueAmount"],
              },
            ],
          },
        },
      },
    ],
    "NOT,PARTIAL": [
      addFieldStage,
      groupByStudent,
      {
        $match: {
          $expr: {
            $lt: ["$paidAmount", "$totalNetAmount"],
          },
        },
      },
    ],
  };

  return paymentStages[paymentStatus] || [];
};

/**
 *
 * @param {Number} page
 * @param {Number} limit
 * @returns  {Array} stages - Array of stages
 */
const buildGeneralStages = (page, limit) => {
  const stages = [
    {
      $lookup: {
        from: "students",
        let: {
          studentId: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$studentId"],
              },
            },
          },
          {
            $project: {
              name: 1,
              parent_id: 1,
              profile_image: 1,
              username: 1,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$sectionId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$sectionId"],
              },
            },
          },
          {
            $project: {
              className: 1,
            },
          },
        ],
        as: "section",
      },
    },
    {
      $unwind: "$section",
    },
    {
      $lookup: {
        from: "parents",
        let: {
          parentId: "$student.parent_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$parentId"],
              },
            },
          },
          {
            $project: {
              name: 1,
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $unwind: "$parent",
    },
    {
      $project: {
        studentName: "$student.name",
        parentName: "$parent.name",
        sectionName: "$section.className",
        profileImage: "$student.profile_image",
        totalNetAmount: 1,
        username: "$student.username",
        paidAmount: 1,
        dueAmount: 1,
      },
    },
  ];
  if (page >= 0 && limit) {
    return [{ $skip: page * limit }, { $limit: limit }, ...stages];
  }
  return stages;
};

/**
 * @desc   Build Aggregation
 * @param {Object} match
 * @param {Array} paymentStatus
 * @param {Array} scheduleDates
 * @param {Number} page - optional
 * @param {Number} limit - optional
 * @returns  {Array} aggregation - Array of aggregation stages
 */
const buildAggregation = (match, paymentStatus, scheduleDates, page, limit) => {
  const aggregation = [
    {
      $match: match,
    },
    ...buildPaymentStatusStages(paymentStatus, scheduleDates),
    ...buildGeneralStages(page, limit),
  ];
  return aggregation;
};

/**
 * @desc    Get Summary
 * @route   POST /api/v1/dueList/summary
 * @param   {Object} req - Request Object (scheduleId, scheduleDates)
 * @description This method is used to get summary of due list
 * @throws  {Error}  If scheduleId or scheduleDates is not provided
 * @response {Object} res - Response Object (totalClassesDue, duesAmount, dueStudents)
 */

const getSummary = CatchAsync(async (req, res, next) => {
  const { categoryId, scheduleId = [], scheduleDates = [] } = req.body;
  const { school_id } = req.user;
  const response = {};

  const sectionList = await getSections(school_id);

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
  };

  if (categoryId) {
    match.categoryId = mongoose.Types.ObjectId(categoryId);
  }

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId.map((id) => mongoose.Types.ObjectId(id)) };
  }

  if (scheduleDates.length) {
    match.$or = scheduleDates.map((date) => {
      const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
      const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
      return {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
    });
  }

  const aggregate = [
    {
      $match: match,
    },
    {
      $facet: {
        classes: [
          {
            $addFields: {
              dueAmount: {
                $subtract: ["$netAmount", "$paidAmount"],
              },
            },
          },
          {
            $match: {
              dueAmount: {
                $gt: 0,
              },
            },
          },
          {
            $group: {
              _id: "$sectionId",
              totalAmount: {
                $sum: "$dueAmount",
              },
            },
          },
          {
            $sort: {
              totalAmount: -1,
            },
          },
          {
            $group: {
              _id: null,
              totalClassesDue: {
                $sum: 1,
              },
              maxClass: {
                $max: {
                  amount: "$totalAmount",
                  sectionId: "$_id",
                },
              },
              minClass: {
                $min: {
                  amount: "$totalAmount",
                  sectionId: "$_id",
                },
              },
            },
          },
        ],
        duesAmount: [
          {
            $addFields: {
              dueAmount: {
                $subtract: ["$netAmount", "$paidAmount"],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalReceivables: {
                $sum: "$netAmount",
              },
              dueAmount: {
                $sum: "$dueAmount",
              },
            },
          },
        ],
        dueStudents: [
          {
            $addFields: {
              dueAmount: {
                $subtract: ["$netAmount", "$paidAmount"],
              },
            },
          },
          {
            $match: {
              dueAmount: {
                $gt: 0,
              },
            },
          },
          {
            $group: {
              _id: "$studentId",
              gender: {
                $first: "$gender",
              },
            },
          },
          {
            $group: {
              _id: null,
              totalStudents: {
                $sum: 1,
              },
              boys: {
                $sum: {
                  $cond: [
                    {
                      $in: ["$gender", ["Male", "MALE", "male"]],
                    },
                    1,
                    0,
                  ],
                },
              },
              girls: {
                $sum: {
                  $cond: [
                    {
                      $in: ["$gender", ["Female", "FEMALE", "female"]],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await FeeInstallment.aggregate(aggregate);

  const { classes, duesAmount, dueStudents } = result;

  if (classes.length) {
    const { maxClass, minClass, totalClassesDue } = classes[0];
    const { sectionId: maxSectionId } = maxClass;
    const { sectionId: minSectionId } = minClass;

    const maxSection = sectionList[maxSectionId];
    const minSection = sectionList[minSectionId];

    response.totalClassesDue = {
      totalClassesDue,
      maxClass: {
        sectionId: maxSection,
        amount: maxClass.amount,
      },
      minClass: {
        sectionId: minSection,
        amount: minClass.amount,
      },
    };
  } else {
    response.totalClassesDue = {
      totalClassesDue: 0,
      maxClass: {
        sectionId: null,
        amount: 0,
      },
      minClass: {
        sectionId: null,
        amount: 0,
      },
    };
  }

  response.duesAmount = duesAmount[0] || {
    totalReceivables: 0,
    dueAmount: 0,
  };

  response.dueStudents = dueStudents[0] || {
    totalStudents: 0,
    boys: 0,
    girls: 0,
  };

  res.status(200).json(SuccessResponse(response, 1, "Fetched SuccessFully"));
});

const getStudentList = CatchAsync(async (req, res, next) => {
  const { scheduleId = [], scheduleDates = [], page = 0, limit = 5, searchTerm = null } = req.body;
  let { paymentStatus = null } = req.body;
  const { paymentStatus: psFilter } = req.body;
  const { school_id } = req.user;

  // add validation when the payment status in array of ['FULL', 'PARTIAL', 'NOT']
  const isInvalidPaymentStatus =
    paymentStatus && paymentStatus.some((item) => !["FULL", "PARTIAL", "NOT"].includes(item));
  if (isInvalidPaymentStatus) {
    return next(new ErrorResponse("Invalid Payment Status", 422));
  }

  paymentStatus = paymentStatus?.slice().sort().join(",");

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
    netAmount: { $gt: 0 },
  };

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId.map((id) => mongoose.Types.ObjectId(id)) };
  }

  if (scheduleDates.length > 0) {
    match.$or = scheduleDates.map((date) => {
      const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
      const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
      return {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
    });
  }

  if (searchTerm) {
    const searchPayload = {
      school: mongoose.Types.ObjectId(school_id),
      name: {
        $regex: searchTerm,
        $options: "i",
      },
      deleted: false,
      profileStatus: "APPROVED",
    };
    const studentIds = await Students.distinct("_id", searchPayload);
    match.studentId = {
      $in: studentIds,
    };
  }

  const aggregate = buildAggregation(match, paymentStatus, scheduleDates, page, limit);

  const countStages = [
    ...aggregate.slice(0, psFilter && psFilter.length < 3 ? 4 : 3),
    { $count: "count" },
  ];

  const finalAggregation = [
    {
      $facet: {
        data: aggregate,
        count: countStages,
      },
    },
  ];

  const [{ data, count }] = await FeeInstallment.aggregate(finalAggregation);

  if (!count.length) {
    return next(new ErrorResponse("No Dues Found", 404));
  }

  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched SuccessFully"));
});

const getStudentListExcel = CatchAsync(async (req, res, next) => {
  const { scheduleId = [], scheduleDates = [], sectionId = null } = req.body;
  let { paymentStatus = null } = req.body;
  const { school_id } = req.user;

  const isInvalidPaymentStatus =
    paymentStatus && paymentStatus.some((item) => !["FULL", "PARTIAL", "NOT"].includes(item));
  if (isInvalidPaymentStatus) {
    return next(new ErrorResponse("Invalid Payment Status", 422));
  }

  paymentStatus = paymentStatus?.slice().sort().join(",");

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
    netAmount: { $gt: 0 },
  };

  // Add $or condition only if scheduleDates array is not empty
  if (scheduleDates.length) {
    match.$or = scheduleDates.map((date) => {
      const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
      const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
      return {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
    });
  }

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId.map((id) => mongoose.Types.ObjectId(id)) };
  }

  if (sectionId) match.sectionId = mongoose.Types.ObjectId(sectionId);

  const aggregate = buildAggregation(match, paymentStatus, scheduleDates);

  const result = await FeeInstallment.aggregate(aggregate);

  if (!result.length) {
    return next(new ErrorResponse("No Dues Found", 404));
  }

  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Students Dues");
  const style = workbook.createStyle({
    font: {
      bold: true,
      color: "#000000",
      size: 12,
    },
    numberFormat: "$#,##0.00; ($#,##0.00); -",
  });

  const header = [
    "Student Name",
    "Admission No",
    "Parent Name",
    "Phone Number",
    "Class",
    "Net Fees",
    "Paid Fees",
    "Balance Fees",
  ];

  header.forEach((item, index) => {
    worksheet
      .cell(1, index + 1)
      .string(item)
      .style(style);
  });

  result.forEach((row, index) => {
    const {
      studentName,
      parentName = "",
      username,
      admission_no = "",
      sectionName = "",
      totalNetAmount,
      paidAmount,
      dueAmount,
    } = row;

    worksheet.cell(index + 2, 1).string(studentName);
    worksheet.cell(index + 2, 2).string(admission_no || "");
    worksheet.cell(index + 2, 3).string(parentName);
    worksheet.cell(index + 2, 4).string(username);
    worksheet.cell(index + 2, 5).string(sectionName);
    worksheet.cell(index + 2, 6).number(totalNetAmount);
    worksheet.cell(index + 2, 7).number(paidAmount);
    worksheet.cell(index + 2, 8).number(dueAmount);
  });

  // workbook.write(`student-List.xlsx`);
  let buffer = await workbook.writeToBuffer();
  buffer = buffer.toJSON().data;

  res.status(200).json(SuccessResponse(buffer, 1, "Fetched SuccessFully"));
});

const getClassList = CatchAsync(async (req, res, next) => {
  const { scheduleId = [], scheduleDates = [], page = 0, limit = 6, searchTerm = null } = req.body;
  const { school_id } = req.user;
  const skip = page * limit;
  let sectionIds = null;

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
  };

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId.map((id) => mongoose.Types.ObjectId(id)) };
  }

  if (scheduleDates.length > 0) {
    match.$or = scheduleDates.map((date) => {
      const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
      const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
      return {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
    });
  }

  if (searchTerm) {
    const searchPayload = {
      school: mongoose.Types.ObjectId(school_id),
      className: {
        $regex: searchTerm,
        $options: "i",
      },
    };
    sectionIds = await Sections.distinct("_id", searchPayload);
    match.sectionId = {
      $in: sectionIds,
    };
  }

  const facetedStages = {
    data: [
      {
        $match: match,
      },
      {
        $addFields: {
          dueAmount: {
            $subtract: ["$netAmount", "$paidAmount"],
          },
        },
      },
      {
        $match: {
          dueAmount: {
            $gt: 0,
          },
        },
      },
      {
        $group: {
          _id: "$studentId",
          sectionId: {
            $first: "$sectionId",
          },
          paidAmount: {
            $sum: "$paidAmount",
          },
          netAmount: {
            $sum: "$netAmount",
          },
          dueAmount: {
            $sum: "$dueAmount",
          },
        },
      },
      {
        $group: {
          _id: "$sectionId",
          dueStudents: {
            $sum: {
              $cond: [
                {
                  $gt: ["$dueAmount", 0],
                },
                1,
                0,
              ],
            },
          },
          totalPaidAmount: {
            $sum: "$paidAmount",
          },
          totalNetAmount: {
            $sum: "$netAmount",
          },
          totalDueAmount: {
            $sum: "$dueAmount",
          },
        },
      },
      {
        $sort: {
          totalDueAmount: -1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: "sections",
          let: {
            sectionId: "$_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$sectionId"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                className: 1,
              },
            },
          ],
          as: "_id",
        },
      },
      {
        $unwind: {
          path: "$_id",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "students",
          let: {
            secId: "$_id._id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ["$section", "$$secId"],
                    },
                    {
                      $eq: ["$deleted", false],
                    },
                    {
                      $eq: ["$profileStatus", "APPROVED"],
                    },
                  ],
                },
              },
            },
            {
              $group: {
                _id: "$section",
                count: {
                  $sum: 1,
                },
              },
            },
          ],
          as: "students",
        },
      },
      {
        $project: {
          _id: 0,
          sectionId: "$_id._id",
          className: "$_id.className",
          totalStudents: {
            $first: "$students.count",
          },
          dueStudents: 1,
          totalPaidAmount: 1,
          totalNetAmount: 1,
          totalDueAmount: 1,
        },
      },
    ],
    count: [
      { $match: match },
      {
        $addFields: {
          dueAmount: {
            $subtract: ["$netAmount", "$paidAmount"],
          },
        },
      },
      {
        $match: {
          dueAmount: {
            $gt: 0,
          },
        },
      },
      {
        $group: {
          _id: "$sectionId",
        },
      },
      { $count: "count" },
    ],
  };

  const [result] = await FeeInstallment.aggregate([
    {
      $facet: facetedStages,
    },
  ]);
  const { data, count } = result;

  if (count.length === 0) {
    return next(new ErrorResponse("No Dues Found", 404));
  }

  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched SuccessFully"));
});

const getClassListExcel = CatchAsync(async (req, res, next) => {
  const { scheduleId = [], scheduleDates = [] } = req.body;
  const { school_id } = req.user;

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
  };

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId.map((id) => mongoose.Types.ObjectId(id)) };
  }

  if (scheduleDates.length > 0) {
    match.$or = scheduleDates.map((date) => {
      const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
      const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
      return {
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      };
    });
  }

  const aggregate = [
    {
      $match: match,
    },
    {
      $addFields: {
        dueAmount: {
          $subtract: ["$netAmount", "$paidAmount"],
        },
      },
    },
    {
      $match: {
        dueAmount: {
          $gt: 0,
        },
      },
    },
    {
      $group: {
        _id: "$studentId",
        sectionId: {
          $first: "$sectionId",
        },
        paidAmount: {
          $sum: "$paidAmount",
        },
        netAmount: {
          $sum: "$netAmount",
        },
        dueAmount: {
          $sum: "$dueAmount",
        },
      },
    },
    {
      $group: {
        _id: "$sectionId",
        dueStudents: {
          $sum: 1,
        },
        totalPaidAmount: {
          $sum: "$paidAmount",
        },
        totalNetAmount: {
          $sum: "$netAmount",
        },
        totalDueAmount: {
          $sum: "$dueAmount",
        },
      },
    },
    {
      $sort: {
        totalDueAmount: -1,
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$sectionId"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              className: 1,
            },
          },
        ],
        as: "_id",
      },
    },
    {
      $unwind: {
        path: "$_id",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "students",
        let: {
          secId: "$_id._id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$section", "$$secId"],
                  },
                  {
                    $eq: ["$deleted", false],
                  },
                  {
                    $eq: ["$profileStatus", "APPROVED"],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: "$section",
              count: {
                $sum: 1,
              },
            },
          },
        ],
        as: "students",
      },
    },
    {
      $project: {
        _id: 0,
        sectionId: "$_id._id",
        className: "$_id.className",
        totalStudents: {
          $first: "$students.count",
        },
        dueStudents: 1,
        totalPaidAmount: 1,
        totalNetAmount: 1,
        totalDueAmount: 1,
      },
    },
  ];

  const result = await FeeInstallment.aggregate(aggregate);

  if (!result.length) return next(new ErrorResponse("No Dues Found", 404));

  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Class Due Excel");

  const style = workbook.createStyle({
    font: {
      bold: true,
      color: "#000000",
      size: 12,
    },
    numberFormat: "$#,##0.00; ($#,##0.00); -",
  });

  worksheet.cell(1, 1).string("Class Name").style(style);
  worksheet.cell(1, 2).string("Total Students").style(style);
  worksheet.cell(1, 3).string("Due Students").style(style);
  worksheet.cell(1, 4).string("Total Fees").style(style);
  worksheet.cell(1, 5).string("Paid Fees").style(style);
  worksheet.cell(1, 6).string("Balance Fees").style(style);

  result.forEach((row, index) => {
    const {
      className = "",
      totalStudents = 0,
      dueStudents = 0,
      totalPaidAmount,
      totalNetAmount,
      totalDueAmount,
    } = row;

    worksheet.cell(index + 2, 1).string(className);
    worksheet.cell(index + 2, 2).number(totalStudents);
    worksheet.cell(index + 2, 3).number(dueStudents);
    worksheet.cell(index + 2, 4).number(totalNetAmount);
    worksheet.cell(index + 2, 5).number(totalPaidAmount);
    worksheet.cell(index + 2, 6).number(totalDueAmount);
  });

  // workbook.write(`Class-List.xlsx`);
  let buffer = await workbook.writeToBuffer();
  buffer = buffer.toJSON().data;

  res.status(200).json(SuccessResponse(buffer, 1, "Fetched SuccessFully"));
});

const getStudentListByClass = CatchAsync(async (req, res, next) => {
  // No pagination, No search
  const { sectionId = null, scheduleDates = [], scheduleId = [] } = req.body;
  const { school_id } = req.user;

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
    sectionId: mongoose.Types.ObjectId(sectionId),
  };

  if (scheduleId.length) {
    match.scheduleTypeId = { $in: scheduleId?.map((id) => mongoose.Types.ObjectId(id)) };
  }

  const orConditions = scheduleDates?.map((date) => {
    const startDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
    const endDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
    return {
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };
  });

  if (orConditions && orConditions.length > 0) {
    match.$or = orConditions;
  }

  const aggregate = [
    {
      $match: match,
    },
    {
      $addFields: {
        dueAmount: {
          $subtract: ["$netAmount", "$paidAmount"],
        },
      },
    },
    {
      $match: {
        dueAmount: {
          $gt: 0,
        },
      },
    },
    {
      $group: {
        _id: "$studentId",
        sectionId: {
          $first: "$sectionId",
        },
        totalNetAmount: {
          $sum: "$netAmount",
        },
        dueAmount: {
          $sum: "$dueAmount",
        },
      },
    },
    {
      $lookup: {
        from: "students",
        let: {
          studentId: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$studentId"],
              },
            },
          },
          {
            $project: {
              name: 1,
              username: 1,
              profile_image: 1,
              admission_no: 1,
              parent_id: 1,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $lookup: {
        from: "parents",
        let: {
          parentId: "$student.parent_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$parentId"],
              },
            },
          },
          {
            $project: {
              name: 1,
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $unwind: "$parent",
    },
    {
      $project: {
        studentName: "$student.name",
        parentName: "$parent.name",
        admission_no: "$student.admission_no",
        username: "$student.username",
        profileImage: "$student.profile_image",
        totalNetAmount: 1,
        dueAmount: 1,
      },
    },
  ];

  const result = await FeeInstallment.aggregate(aggregate);

  if (!result) {
    return next(new ErrorResponse("No Dues Found", 404));
  }

  res.status(200).json(SuccessResponse(result, result.length, "Fetched SuccessFully"));
});

module.exports = {
  getSummary,
  getStudentList,
  getStudentListExcel,
  getClassList,
  getClassListExcel,
  getStudentListByClass,
};
