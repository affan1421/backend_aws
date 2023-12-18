const mongoose = require("mongoose");
const moment = require("moment");

const XLSX = require("xlsx");
const excel = require("excel4node");
const PreviousBalance = require("../models/previousFeesBalance");
const Donations = require("../models/donation");
const DonorModel = require("../models/donor");
const FeeInstallment = require("../models/feeInstallment");
const studentTransport = require("../models/studentsTransport.js");
const {
  getStartDate,
  getEndDate,
  getPrevStartDate,
  getPrevEndDate,
} = require("../helpers/dateFormat");

const FeeStructure = require("../models/feeStructure");
const FeeReceipt = require("../models/feeReceipt.js");
const AcademicYear = require("../models/academicYear");

const School = mongoose.connection.db.collection("schools");
const Student = mongoose.connection.db.collection("students");

const catchAsync = require("../utils/catchAsync");
const ErrorResponse = require("../utils/errorResponse");
const SuccessResponse = require("../utils/successResponse");
const getSections = require("../helpers/section");

const getDateRange = (dateRange, startDate, endDate) => {
  let dateObj;
  let prevDateObj;

  switch (dateRange) {
    case "daily":
      dateObj = {
        $gte: getStartDate(startDate, "day"),
        $lte: getEndDate(endDate, "day"),
      };
      prevDateObj = {
        $gte: getPrevStartDate(startDate, "day", "days"),
        $lte: getPrevEndDate(endDate, "day", "days"),
      };
      break;

    case "weekly":
      dateObj = {
        $gte: getStartDate(startDate, "week"),
        $lte: getEndDate(endDate, "week"),
      };
      prevDateObj = {
        $gte: getPrevStartDate(startDate, "week", "weeks"),
        $lte: getPrevEndDate(endDate, "week", "weeks"),
      };
      break;

    case "monthly":
      dateObj = {
        $gte: getStartDate(startDate, "month"),
        $lte: getEndDate(endDate, "month"),
      };
      prevDateObj = {
        $gte: getPrevStartDate(startDate, "month", "months"),
        $lte: getPrevEndDate(endDate, "month", "months"),
      };
      break;

    default:
      dateObj = {
        $gte: getStartDate(startDate),
        $lte: getEndDate(endDate),
      };
      break;
  }

  return { dateObj, prevDateObj };
};

const getIncomeAggregation = (schoolId, dateObj, current, previous) => [
  {
    $match: {
      "school.schoolId": mongoose.Types.ObjectId(schoolId),
      status: {
        $in: ["APPROVED", "REQUESTED", "REJECTED"],
      },
    },
  },
  {
    $facet: {
      totalCollected: [
        {
          $match: {
            receiptType: "ACADEMIC",
            issueDate: dateObj,
          },
        },
        {
          $unwind: {
            path: "$items",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$items.feeTypeId",
            totalAmount: {
              $sum: "$items.paidAmount",
            },
          },
        },
        {
          $lookup: {
            from: "feetypes",
            let: {
              feeTypeId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$_id", "$$feeTypeId"],
                  },
                },
              },
              {
                $project: {
                  feeType: 1,
                },
              },
            ],
            as: "_id",
          },
        },
        {
          $project: {
            _id: 0,
            amount: "$totalAmount",
            feeTypeId: {
              $first: "$_id",
            },
          },
        },
      ],
      miscCollected: [
        {
          $match: {
            receiptType: {
              $in: ["MISCELLANEOUS", "PREVIOUS_BALANCE", "APPLICATION"],
            },
            issueDate: dateObj,
          },
        },
        {
          $unwind: {
            path: "$items",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$items.feeTypeId",
            totalAmount: {
              $sum: "$paidAmount",
            },
          },
        },
        {
          $lookup: {
            from: "feetypes",
            let: {
              feeTypeId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$_id", "$$feeTypeId"],
                  },
                },
              },
              {
                $project: {
                  feeType: 1,
                },
              },
            ],
            as: "_id",
          },
        },
        {
          $project: {
            _id: 0,
            amount: "$totalAmount",
            feeTypeId: {
              $first: "$_id",
            },
          },
        },
      ],
      totalIncomeCollected: [
        {
          $match: {
            issueDate: dateObj,
          },
        },
        ...current,
      ],
      ...(previous ? { prevIncomeCollected: previous } : {}),
    },
  },
];

exports.GetTransactions = catchAsync(async (req, res, next) => {
  let {
    page = 0,
    limit = 10,
    schoolId = null,
    sectionId = null,
    receiptType = "ACADEMIC",
  } = req.query;

  if (limit > 50) {
    return next(new ErrorResponse("Page limit should not exceed 50", 400));
  }

  if (!schoolId) {
    return next(new ErrorResponse("Schoolid is required", 400));
  }

  const matchQuery = {
    status: { $in: ["APPROVED", "REQUESTED", "REJECTED"] },
  };

  if (schoolId) {
    matchQuery["school.schoolId"] = mongoose.Types.ObjectId(schoolId);
  }

  if (sectionId) {
    matchQuery["student.section.sectionId"] = mongoose.Types.ObjectId(sectionId);
  }

  if (receiptType) {
    matchQuery.receiptType = receiptType;
  }

  const foundAcademicYear = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  })
    .select("_id")
    .lean();

  if (foundAcademicYear) {
    matchQuery["academicYear.academicYearId"] = foundAcademicYear._id;
  }
  page = +page;
  limit = +limit;

  const foundTransactions = await FeeReceipt.aggregate([
    {
      $match: matchQuery,
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $skip: page * limit,
    },
    {
      $limit: limit,
    },

    {
      $lookup: {
        from: "students",
        let: { studentId: "$student.studentId" },
        as: "studentId",
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
              _id: 1,
              name: 1,
              profile_image: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        _id: 1,
        studentId: {
          $first: "$studentId",
        },
        paidAmount: 1,
        dueAmount: 1,
        totalAmount: 1,
        date: "$issueDate",
      },
    },
  ]);

  return res.status(200).json(SuccessResponse(foundTransactions, foundTransactions.length));
});

exports.SectionWiseTransaction = catchAsync(async (req, res, next) => {
  const { schoolId, status = "Paid" } = req.query;

  const matchObj = {
    status,
  };

  if (schoolId) {
    matchObj.schoolId = mongoose.Types.ObjectId(schoolId);
  }

  const foundTransactions = await FeeInstallment.aggregate([
    {
      $match: matchObj,
    },
    {
      $group: {
        _id: "$sectionId",
        totalAmount: {
          $sum: "$totalAmount",
        },
        netAmount: {
          $sum: "$netAmount",
        },
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$_id",
        },
        as: "sec",
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
              name: "$className",
              sectionId: "$_id",
              sectionName: "$name",
              classId: "$class_id",
              className: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        totalAmount: 1,
        classSec: {
          $first: "$sec",
        },
      },
    },
  ]);

  matchObj.status = "Due";
  const dueStudentCount = await FeeInstallment.countDocuments(matchObj);

  return res
    .status(200)
    .json(
      SuccessResponse({ sections: foundTransactions, dueStudentCount }, foundTransactions.length)
    );
});

// exports.update = catchAsync(async (req, res, next) => {
//   const { id } = req.params;
//   const { amount } = req.body;

//   // update the installment
//   const installment = await FeeInstallment.findOne({ _id: id });

//   const { paidAmount, totalDiscountAmount } = installment;

//   if (!installment) {
//     return next(new ErrorResponse("Installment not found", 404));
//   }

//   const update = {
//     $set: {
//       totalAmount: amount,
//       netAmount: amount - totalDiscountAmount,
//     },
//   };
//   if (paidAmount && paidAmount > amount) {
//     return next(new ErrorResponse("Paid Amount Is Greater Than Total Amount", 400));
//   }
//   if (paidAmount > 0) {
//     update.$set.status = "Due";
//   }

//   const updatedInstallment = await FeeInstallment.updateOne({ _id: id }, update);

//   if (updatedInstallment.nModified === 0) {
//     return next(new ErrorResponse("Installment not updated", 400));
//   }

//   res.status(200).json(SuccessResponse(updatedInstallment, 1, "Updated Successfully"));
// });

exports.update = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { amount, paymentMethod } = req.body; // Assuming paymentMethod is provided in the request body

  // Update the installment
  const installment = await FeeInstallment.findOne({ _id: id });

  const { paidAmount, totalDiscountAmount } = installment;

  if (!installment) {
    return next(new ErrorResponse("Installment not found", 404));
  }

  const update = {
    $set: {
      totalAmount: amount,
      netAmount: amount - totalDiscountAmount,
    },
  };

  if (paidAmount && paidAmount > amount) {
    return next(new ErrorResponse("Paid Amount Is Greater Than Total Amount", 400));
  }

  if (paidAmount > 0) {
    update.$set.status = paymentMethod !== "CASH" ? "Pending" : "Due";
  }

  const updatedInstallment = await FeeInstallment.updateOne({ _id: id }, update);

  if (updatedInstallment.nModified === 0) {
    return next(new ErrorResponse("Installment not updated", 400));
  }

  res.status(200).json(SuccessResponse(updatedInstallment, 1, "Updated Successfully"));
});

exports.StudentsList = catchAsync(async (req, res, next) => {
  const {
    page = 0,
    limit = 10,
    schoolId = null,
    classId = null,
    sectionId = null,
    search = null,
  } = req.query;

  if (limit > 50) {
    return next(new ErrorResponse("Page limit should not excede 50", 400));
  }

  const matchQuery = {
    deleted: false,
    profileStatus: "APPROVED",
  };

  if (schoolId) {
    matchQuery.school_id = mongoose.Types.ObjectId(schoolId);
  }
  if (classId) {
    matchQuery.class = mongoose.Types.ObjectId(classId);
  }
  if (sectionId) {
    matchQuery.section = mongoose.Types.ObjectId(sectionId);
  }
  if (search) {
    matchQuery.$text = { $search: search };
  }

  const aggregate = [
    {
      $match: matchQuery,
    },
    {
      $facet: {
        data: [
          {
            $skip: limit * page,
          },
          {
            $limit: parseInt(limit),
          },
          {
            $lookup: {
              from: "sections",
              let: {
                sectionId: "$section",
              },
              as: "className",
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
            },
          },
          {
            $lookup: {
              from: "feeinstallments",
              let: {
                studentId: "$_id",
              },
              as: "feeinstallments",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        {
                          $eq: ["$studentId", "$$studentId"],
                        },
                        {
                          $eq: ["$deleted", false],
                        },
                      ],
                    },
                  },
                },
                {
                  $group: {
                    _id: null,
                    paidAmount: {
                      $sum: "$paidAmount",
                    },
                    netAmount: {
                      $sum: "$netAmount",
                    },
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: "previousfeesbalances",
              let: {
                studentId: "$_id",
              },
              as: "previousfees",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$studentId", "$$studentId"],
                    },
                  },
                },
                {
                  $project: {
                    dueAmount: 1,
                  },
                },
              ],
            },
          },
          {
            $lookup: {
              from: "parents",
              let: {
                parentId: "$parent_id",
              },
              as: "parentId",
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
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              className: {
                $first: "$className.className",
              },
              parentName: {
                $first: "$parentId.name",
              },
              pendingAmount: {
                $add: [
                  {
                    $ifNull: [
                      {
                        $first: "$previousfees.dueAmount",
                      },
                      0,
                    ],
                  },
                  {
                    $subtract: [
                      { $first: "$feeinstallments.netAmount" },
                      { $first: "$feeinstallments.paidAmount" },
                    ],
                  },
                ],
              },
              admission_no: 1,
              hasfeeStructure: {
                $cond: [
                  {
                    $gt: [{ $size: "$feeinstallments" }, 0],
                  },
                  true,
                  false,
                ],
              },
            },
          },
        ],
        count: [{ $count: "count" }],
      },
    },
  ];

  const [{ data, count }] = await Student.aggregate(aggregate).toArray();
  if (!count.length) {
    return next(new ErrorResponse("No Data Found", 404));
  }
  return res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});

exports.StudentSearch = catchAsync(async (req, res, next) => {
  const { search, page, limit, schoolId } = req.query;
  let path = "username";
  const limitInt = limit ? parseInt(limit) : 10;
  const skip = page ? parseInt(page - 1) * limitInt : 0;
  if (!search) {
    return res.status(400).json(new ErrorResponse("PLease enter search value", 400));
  }
  if (Number.isNaN(+search)) {
    path = "name";
  }
  const queryObj = {
    index: "studentBasicInfo",
    compound: {
      must: [
        {
          autocomplete: {
            query: search,
            path,
          },
        },
      ],
    },
    count: {
      type: "total",
    },
  };

  const searchResult = await Student.aggregate([
    {
      $search: queryObj,
    },
    {
      $skip: Number(skip),
    },
    {
      $limit: Number(limit),
    },
    {
      $lookup: {
        from: "classes",
        localField: "class",
        foreignField: "_id",
        as: "class",
      },
    },
    {
      $lookup: {
        from: "sections",
        localField: "section",
        foreignField: "_id",
        as: "section",
      },
    },
    {
      $lookup: {
        from: "parents",
        localField: "parent_id",
        foreignField: "_id",
        as: "parent",
      },
    },
    {
      $match: {
        feeCategoryIds: { $exists: true, $ne: [] },
        school_id: mongoose.Types.ObjectId(schoolId),
      },
    },
    {
      $project: {
        name: 1,
        class: {
          $concat: { $first: "$class.name" },
        },
        parentName: {
          $first: "$parent.name",
        },
        username: 1,
        count: "$meta.count.total",
        profile_image: 1,
      },
    },
  ]).toArray();
  res.status(200).json(SuccessResponse(searchResult));
});

exports.getStudentFeeStructure = catchAsync(async (req, res, next) => {
  const { categoryId = null, studentId = null } = req.query;

  if (!categoryId || !studentId) {
    return next(new ErrorResponse("Please Provide All Inputs", 400));
  }

  const pipeline = [
    {
      $match: {
        _id: mongoose.Types.ObjectId(studentId),
        deleted: false,
        profileStatus: "APPROVED",
      },
    },
    {
      $lookup: {
        from: "sections",
        let: { sectionId: "$section" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$sectionId"] },
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
      $lookup: {
        from: "parents",
        let: { parentId: "$parent_id", studname: "$name" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$parentId"] },
            },
          },
          {
            $project: {
              name: {
                $ifNull: ["$name", { $concat: ["$$studname", " (Parent)"] }],
              },
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $project: {
        studentName: "$name",
        parentName: { $first: "$parent.name" },
        class: { $first: "$section.className" },
        admission_no: 1,
      },
    },
  ];

  const foundStudent = await Student.aggregate(pipeline).toArray();

  if (foundStudent.length < 1) {
    return next(new ErrorResponse("Student Not Found", 404));
  }

  const response = foundStudent[0];

  const feeDetailsPromise = FeeInstallment.find({ categoryId, studentId })
    .populate("feeTypeId", "feeType")
    .select({
      feeTypeId: 1,
      rowId: 1,
      date: 1,
      paidDate: 1,
      paidAmount: 1,
      totalAmount: 1,
      totalDiscountAmount: 1,
      netAmount: 1,
      status: 1,
      concessionAmount: 1,
    })
    .lean();

  const previousBalancePromise = PreviousBalance.findOne({ studentId });

  const studentTransportPromise = studentTransport.findOne({ studentId });

  const [feeDetails, isPreviousExist, isStudentTransportExist] = await Promise.all([
    feeDetailsPromise,
    previousBalancePromise,
    studentTransportPromise,
  ]);

  response.feeDetails = feeDetails;
  if (isPreviousExist) response.previousBalance = isPreviousExist;
  if (isStudentTransportExist) response.studentTransport = isStudentTransportExist;

  return res.status(200).json(SuccessResponse(response, 1, "Fetched Successfully"));
});

exports.studentReport = catchAsync(async (req, res, next) => {
  const { categoryId, studentId } = req.query;

  if (!categoryId || !studentId) {
    return next(new ErrorResponse("Please Provide All Inputs", 422));
  }

  const feeInstallmentsPipeline = [
    {
      $match: {
        studentId: mongoose.Types.ObjectId(studentId),
      },
    },
    {
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              total: {
                $sum: "$netAmount",
              },
              paid: {
                $sum: "$paidAmount",
              },
            },
          },
          {
            $project: {
              _id: 0,
              total: 1,
              paid: 1,
              pending: {
                $subtract: ["$total", "$paid"],
              },
            },
          },
        ],
        discounts: [
          {
            $unwind: "$discounts",
          },
          {
            $group: {
              _id: "$discounts",
            },
          },
          {
            $lookup: {
              from: "discountcategories",
              localField: "_id.discountId",
              foreignField: "_id",
              as: "discountDetails",
            },
          },
          {
            $unwind: "$discountDetails",
          },
          {
            $project: {
              id: "$_id.discountId",
              name: "$discountDetails.name",
              status: "$_id.status",
              discountAmount: "$_id.discountAmount",
            },
          },
        ],
        feeInstallments: [
          {
            $match: {
              categoryId: mongoose.Types.ObjectId(categoryId),
            },
          },
          {
            $lookup: {
              from: "feetypes",
              localField: "feeTypeId",
              foreignField: "_id",
              as: "feeType",
            },
          },
          {
            $unwind: "$feeType",
          },
          {
            $project: {
              name: "$feeType.feeType",
              date: 1,
              totalAmount: 1,
              totalDiscountAmount: 1,
              paidAmount: 1,
              netAmount: 1,
              status: 1,
            },
          },
        ],
      },
    },
    {
      $match: {
        $or: [{ "stats.0": { $exists: true } }, { "feeInstallments.0": { $exists: true } }],
      },
    },
    {
      $project: {
        _id: 0,
        stats: { $arrayElemAt: ["$stats", 0] },
        discounts: 1,
        feeInstallments: 1,
      },
    },
  ];

  const miscFeePipeline = [
    {
      $match: {
        "student.studentId": mongoose.Types.ObjectId(studentId),
        receiptType: "MISCELLANEOUS",
      },
    },
    {
      $unwind: "$items",
    },
    {
      $lookup: {
        from: "feetypes",
        localField: "items.feeTypeId",
        foreignField: "_id",
        as: "feetype",
      },
    },
    {
      $unwind: "$feetype",
    },
    {
      $project: {
        _id: 0,
        amount: "$items.netAmount",
        feetype: "$feetype.feeType",
      },
    },
  ];

  const previousBalancesPipeline = [
    {
      $match: {
        studentId: mongoose.Types.ObjectId(studentId),
        isEnrolled: true,
      },
    },
    {
      $project: {
        total: "$totalAmount",
        paid: "$paidAmount",
        due: "$dueAmount",
      },
    },
  ];

  const studentPipeline = [
    {
      $match: {
        _id: mongoose.Types.ObjectId(studentId),
        deleted: false,
        profileStatus: "APPROVED",
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$section",
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
      $lookup: {
        from: "parents",
        let: {
          parentId: "$parent_id",
          studname: "$name",
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
              name: {
                $ifNull: [
                  "$name",
                  {
                    $concat: ["$$studname", " (Parent)"],
                  },
                ],
              },
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $project: {
        studentName: "$name",
        username: 1,
        profile_image: 1,
        parentName: {
          $first: "$parent.name",
        },
        class: {
          $first: "$section.className",
        },
      },
    },
  ];

  async function aggregateWithPipeline(collection, pipeline) {
    try {
      return await collection.aggregate(pipeline);
    } catch (error) {
      return next(new ErrorResponse("Error", 400));
    }
  }

  async function findStudentDetails() {
    const foundStudent = await Student.aggregate(studentPipeline).toArray();
    if (!foundStudent.length) {
      return next(new ErrorResponse("Student Not Found", 404));
    }
    const response = foundStudent[0];
    return response;
  }

  const [feeInstallments, miscFees, previousBalances, studentDetails] = await Promise.all([
    aggregateWithPipeline(FeeInstallment, feeInstallmentsPipeline),
    aggregateWithPipeline(FeeReceipt, miscFeePipeline),
    aggregateWithPipeline(PreviousBalance, previousBalancesPipeline),
    findStudentDetails(),
  ]);

  const data = {
    stats: feeInstallments[0].stats,
    feeInstallments: feeInstallments[0].feeInstallments,
    discounts: feeInstallments[0].discounts,
    miscFees,
    previousBalance: previousBalances,
    studentDetails,
  };

  return res.status(200).json(SuccessResponse(data, 1, "Fetched Successfully"));
});

exports.StudentFeeExcel = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params;
  // const regex = /^.*new.*$/i;
  const studentList = [];
  const feeStructureMap = {};

  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });

  const sectionList = await getSections(schoolId);

  // Find all the feestructures of this academic year
  const feeStructures = await FeeStructure.find({
    academicYearId,
    schoolId,
  }).lean();

  // Find all the feeinstallments of this academic year
  for (const feeStructure of feeStructures) {
    let termDate = null;
    let feeInstallments = null;
    const { _id, feeDetails, totalAmount } = feeStructure;
    feeStructureMap[_id] = totalAmount;
    // const isNewAdmission = regex.test(feeStructureName);
    const aggregate = [
      {
        $match: {
          feeStructureId: mongoose.Types.ObjectId(_id),
          deleted: false,
        },
      },
      {
        $project: {
          studentId: 1,
          netAmount: 1,
          paidAmount: 1,
          balanceAmount: {
            $subtract: ["$netAmount", "$paidAmount"],
          },
          sectionId: 1,
          feeStructureId: 1,
        },
      },
      {
        $lookup: {
          from: "students",
          let: {
            stud: "$studentId",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$_id", "$$stud"],
                },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                parent_id: 1,
                username: 1,
              },
            },
          ],
          as: "studentId",
        },
      },
      {
        $unwind: {
          path: "$studentId",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "parents",
          let: {
            parentId: "$studentId.parent_id",
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
                _id: 1,
                name: 1,
              },
            },
          ],
          as: "parent",
        },
      },
      {
        $unwind: {
          path: "$parent",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
    termDate = feeDetails[0].scheduledDates[0].date;
    aggregate[0].$match.date = new Date(termDate);
    feeInstallments = await FeeInstallment.aggregate(aggregate);

    studentList.push(...feeInstallments);
  }
  // Find the previous balances from previousfeesbalance collection and make object
  const previousBalance = await PreviousBalance.find({
    schoolId,
    isEnrolled: true,
  }).lean();

  const finalStudentMap = previousBalance.reduce((acc, curr) => {
    acc[curr.studentId] = {
      balanceAmount: curr.dueAmount,
      netAmount: curr.totalAmount,
      paidAmount: curr.paidAmount,
    };
    return acc;
  }, {});

  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Student Fees Excel");
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
    "Parent Name",
    "Phone Number",
    "Class",
    "Total Fees",
    "Term Fee",
    "Paid Fee",
    "Balance Fee",
    "Total Balance (Previous Year)",
    "Paid Fees (Previous Year)",
    "Balance (Previous Year)",
  ];

  header.forEach((item, index) => {
    worksheet
      .cell(1, index + 1)
      .string(item)
      .style(style);
  });

  studentList.forEach((installment, index) => {
    const { studentId, parent, sectionId, paidAmount, netAmount, balanceAmount, feeStructureId } =
      installment;
    const feeTotalAmount = feeStructureMap[feeStructureId.toString()] ?? 0;
    const {
      balanceAmount: studPrevBal = 0,
      netAmount: studPrevNet = 0,
      paidAmount: studPrevPaid = 0,
    } = finalStudentMap[studentId._id.toString()] ?? {};
    const className = sectionList[sectionId.toString()]?.className || "";
    worksheet.cell(index + 2, 1).string(studentId.name);
    worksheet.cell(index + 2, 2).string(parent?.name || `${studentId.name} (Parent)`);
    worksheet.cell(index + 2, 3).string(studentId.username);
    worksheet.cell(index + 2, 4).string(className);
    worksheet.cell(index + 2, 5).number(feeTotalAmount);
    worksheet.cell(index + 2, 6).number(netAmount);
    worksheet.cell(index + 2, 7).number(paidAmount);
    worksheet.cell(index + 2, 8).number(balanceAmount);
    worksheet.cell(index + 2, 9).number(studPrevNet);
    worksheet.cell(index + 2, 10).number(studPrevPaid);
    worksheet.cell(index + 2, 11).number(studPrevBal);
  });

  // workbook.write(`${schoolName}.xlsx`);
  let data = await workbook.writeToBuffer();
  data = data.toJSON().data;

  res.status(200).json(SuccessResponse(data, data.length, "Fetched Successfully"));
});

exports.NewAdmissionExcel = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params;
  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });

  const sectionList = await getSections(schoolId);
  // Find the feeStructure of this academic year and regex for new admission
  let feeStructures = await FeeStructure.find({
    academicYearId,
    schoolId,
    feeStructureName: /^.*new.*$/i,
  }).lean();

  feeStructures = feeStructures.map((feeStructure) => mongoose.Types.ObjectId(feeStructure._id));

  // Find all the feeinstallments of this academic year and feeStructure
  const studentList = await FeeInstallment.aggregate([
    {
      $match: {
        feeStructureId: {
          $in: feeStructures,
        },
      },
    },

    {
      $group: {
        _id: "$studentId",
      },
    },
    {
      $lookup: {
        from: "students",
        let: {
          stud: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$stud"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              parent_id: 1,
              username: 1,
              section: 1,
            },
          },
        ],
        as: "studentId",
      },
    },
    {
      $unwind: "$studentId",
    },
    {
      $lookup: {
        from: "parents",
        let: {
          parentId: "$studentId.parent_id",
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
              _id: 1,
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
  ]);

  const { schoolName } = await School.findOne({
    _id: mongoose.Types.ObjectId(schoolId),
  });

  const workbook = new excel.Workbook();

  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("New Admission Students");
  const style = workbook.createStyle({
    font: {
      bold: true,
      color: "#000000",
      size: 12,
    },
    numberFormat: "$#,##0.00; ($#,##0.00); -",
  });
  worksheet.cell(1, 1).string("Student Name").style(style);
  worksheet.cell(1, 2).string("Parent Name").style(style);
  worksheet.cell(1, 3).string("Phone Number").style(style);
  worksheet.cell(1, 4).string("Class").style(style);

  studentList.forEach((student, index) => {
    const { name, username, section } = student.studentId;
    const { name: parentName } = student.parent;
    const className = sectionList[section.toString()]?.className || "";
    worksheet.cell(index + 2, 1).string(name);
    worksheet.cell(index + 2, 2).string(parentName ?? `${name} (Parent)`);
    worksheet.cell(index + 2, 3).string(username);
    worksheet.cell(index + 2, 4).string(className);
  });

  // workbook.write(`${schoolName} - New Admissions.xlsx`);
  let data = await workbook.writeToBuffer();
  data = data.toJSON().data;

  res.status(200).json(SuccessResponse(data, data.length, "Fetched Successfully"));
});

exports.UnmappedStudentExcel = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params;
  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });

  const { schoolName } = await School.findOne(
    {
      _id: mongoose.Types.ObjectId(schoolId),
    },
    { schoolName: 1 }
  );
  const unmappedStudentList = await Student.aggregate([
    {
      $match: {
        school_id: mongoose.Types.ObjectId(schoolId),
        deleted: false,
        feeCategoryIds: {
          $exists: false,
        },
        profileStatus: "APPROVED",
      },
    },
    {
      $lookup: {
        from: "parents",
        let: {
          parentId: "$parent_id",
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
              _id: 1,
              name: 1,
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$section",
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
        as: "section",
      },
    },
    {
      $project: {
        name: 1,
        username: 1,
        parentName: {
          $first: "$parent.name",
        },
        section: {
          $first: "$section.className",
        },
      },
    },
  ]).toArray();
  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Student Fees Excel");
  const style = workbook.createStyle({
    font: {
      bold: true,
      color: "#000000",
      size: 12,
    },
    numberFormat: "$#,##0.00; ($#,##0.00); -",
  });
  worksheet.cell(1, 1).string("Student Name").style(style);
  worksheet.cell(1, 2).string("Parent Name").style(style);
  worksheet.cell(1, 3).string("Phone Number").style(style);
  worksheet.cell(1, 4).string("Class").style(style);

  unmappedStudentList.forEach((student, index) => {
    const { name, parentName, username, section } = student;
    worksheet.cell(index + 2, 1).string(name);
    worksheet.cell(index + 2, 2).string(parentName);
    worksheet.cell(index + 2, 3).string(username);
    worksheet.cell(index + 2, 4).string(section);
  });

  // workbook.write(`${schoolName}-unmapped.xlsx`);
  let data = await workbook.writeToBuffer();
  data = data.toJSON().data;

  res.status(200).json(SuccessResponse(data, data.length, "Fetched Successfully"));
});

exports.MakePayment = catchAsync(async (req, res, next) => {
  const {
    feeDetails,
    studentId,
    collectedFee,
    comment,
    totalFeeAmount,
    dueAmount,
    paymentMethod,
    bankName,
    chequeDate,
    chequeNumber,
    transactionDate,
    transactionId,
    status = null,
    donorId = null,
    upiId,
    payerName,
    ddNumber,
    ddDate,
    feeCategoryName,
    feeCategoryId,
    receiptType,
    createdBy,
  } = req.body;

  if (!createdBy) return next(new ErrorResponse("Please Provide Created By", 422));

  let modifiedStatus = status;
  // if (paymentMethod !== "CASH") {
  //   modifiedStatus = "PENDING";
  // }

  if (!status) return next(new ErrorResponse("Please Provide Status", 422));

  const issueDate = req.body.issueDate ? moment(req.body.issueDate, "DD/MM/YYYY") : new Date();
  const bulkWriteOps = [];
  const foundStudent = await Student.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(studentId),
        deleted: false,
        profileStatus: "APPROVED",
      },
    },
    {
      $lookup: {
        from: "schools",
        let: {
          schoolId: "$school_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$schoolId"],
              },
            },
          },
          {
            $project: {
              name: "$schoolName",
              address: {
                $concat: [
                  "$address",
                  " ",
                  {
                    $toString: "$pincode",
                  },
                ],
              },
            },
          },
        ],
        as: "school",
      },
    },
    {
      $lookup: {
        from: "classes",
        let: {
          classId: "$class",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$classId"],
              },
            },
          },
          {
            $project: {
              name: 1,
            },
          },
        ],
        as: "class",
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          sectionId: "$section",
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
              name: 1,
            },
          },
        ],
        as: "section",
      },
    },
    {
      $lookup: {
        from: "parents",
        let: {
          parentId: "$parent_id",
          studname: "$name",
          username: "$username",
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
              name: {
                $ifNull: [
                  "$name",
                  {
                    $concat: ["$$studname", " (Parent)"],
                  },
                ],
              },
              username: {
                $ifNull: [
                  "$username",
                  {
                    $concat: ["$$username", ""],
                  },
                ],
              },
            },
          },
        ],
        as: "parent",
      },
    },
    {
      $lookup: {
        from: "academicyears",
        let: {
          schoolId: "$school_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$schoolId", "$$schoolId"],
                  },
                  {
                    $eq: ["$isActive", true],
                  },
                ],
              },
            },
          },
          {
            $project: {
              name: 1,
            },
          },
        ],
        as: "academicYear",
      },
    },
    {
      $project: {
        studentId: "$_id",
        username: 1,
        studentName: "$name",
        admission_no: 1,
        classId: {
          $first: "$class._id",
        },
        className: {
          $first: "$class.name",
        },
        sectionId: {
          $first: "$section._id",
        },
        sectionName: {
          $first: "$section.name",
        },
        schoolId: "$school_id",
        schoolName: {
          $first: "$school.name",
        },
        schoolAddress: {
          $first: "$school.address",
        },
        parentName: {
          $first: "$parent.name",
        },
        parentId: "$parent_id",
        parentMobile: {
          $first: "$parent.username",
        },
        academicYear: {
          $first: "$academicYear.name",
        },
        academicYearId: {
          $first: "$academicYear._id",
        },
      },
    },
  ]).toArray();

  if (donorId) {
    // update the student object in donor collection
    await DonorModel.updateOne(
      {
        _id: mongoose.Types.ObjectId(donorId),
      },
      {
        $inc: {
          totalAmount: collectedFee,
        },
      }
    );
    await Donations.create({
      amount: collectedFee,
      date: new Date(),
      donorId,
      paymentType: paymentMethod,
      studentId,
      sectionId: foundStudent[0].sectionId,
    });
  }

  const {
    studentName = "",
    username = "",
    classId = "",
    className = "",
    sectionId = "",
    sectionName = "",
    parentName,
    admission_no = "",
    parentMobile,
    parentId,
    academicYear = "",
    academicYearId = "",
    schoolName = "",
    schoolAddress = "",
    schoolId = "",
  } = foundStudent[0];

  const currentDate = moment();
  const date = currentDate.format("DDMMYY");
  const shortCategory = feeCategoryName.slice(0, 2);

  let newCount = "00001";
  const lastReceipt = await FeeReceipt.findOne({
    "school.schoolId": schoolId,
  })
    .sort({ createdAt: -1 })
    .lean();
  if (lastReceipt && lastReceipt.receiptId) {
    newCount = lastReceipt.receiptId
      .slice(-5)
      .replace(/\d+/, (n) => String(Number(n) + 1).padStart(n.length, "0"));
  }

  const receiptId = `${shortCategory.toUpperCase()}${date}${newCount}`;

  const items = [];
  let currentPaidAmount = 0;
  for (const item of feeDetails) {
    currentPaidAmount += item.paidAmount;

    if (status === "APPROVED") {
      const foundInstallment = await FeeInstallment.findOne({
        _id: mongoose.Types.ObjectId(item._id),
      }).lean();

      const tempDueAmount =
        foundInstallment.netAmount - (item.paidAmount + foundInstallment.paidAmount);

      if (tempDueAmount < 0) {
        return next(new ErrorResponse(`Overpayment for ${item.feeTypeId.feeType} detected.`, 400));
      }

      const updateData = {
        paidDate: issueDate,
        paidAmount: item.paidAmount + foundInstallment.paidAmount,
      };

      if (tempDueAmount === 0) {
        updateData.status = foundInstallment.status == "Due" ? "Late" : "Paid";
      }

      // make bulkwrite query
      bulkWriteOps.push({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $set: updateData,
          },
        },
      });
    }

    items.push({
      installmentId: item._id,
      feeTypeId: item.feeTypeId._id,
      netAmount: item.netAmount,
      paidAmount: item.paidAmount,
    });
  }

  const receiptPayload = {
    student: {
      name: studentName,
      studentId,
      admission_no,
      class: {
        name: className,
        classId,
      },
      section: {
        name: sectionName,
        sectionId,
      },
    },
    comment,
    receiptType,
    receiptId,
    category: {
      name: feeCategoryName,
      feeCategoryId,
    },
    parent: {
      name: parentName ?? `${studentName} (Parent)`,
      mobile: parentMobile ?? username,
      parentId,
    },
    academicYear: {
      name: academicYear,
      academicYearId,
    },
    school: {
      name: schoolName,
      address: schoolAddress,
      schoolId,
    },
    paidAmount: currentPaidAmount,
    totalAmount: totalFeeAmount,
    dueAmount: dueAmount - currentPaidAmount,
    academicPaidAmount: currentPaidAmount,
    payment: {
      method: paymentMethod,
      bankName,
      chequeDate, // dd/mm/yyyy
      chequeNumber,
      transactionDate, // dd/mm/yyyy
      transactionId,
      upiId,
      payerName,
      ddNumber,
      ddDate, // dd/mm/yyyy
    },
    issueDate,
    items,
    createdBy,
    status: modifiedStatus,
    approvedBy: paymentMethod === "CASH" || status === "APPROVED" ? createdBy : null,
  };

  const createdReceipt = await FeeReceipt.create(receiptPayload);

  if (!createdReceipt) {
    return next(new ErrorResponse("Receipt Not Generated", 500));
  }
  if (bulkWriteOps.length) {
    await FeeInstallment.bulkWrite(bulkWriteOps);
  }
  return res.status(201).json(
    SuccessResponse(
      {
        ...JSON.parse(JSON.stringify(createdReceipt)),
        items: feeDetails,
      },
      1,
      "Payment Successful"
    )
  );
});

exports.IncomeDashboard = async (req, res, next) => {
  try {
    const { schoolId, dateRange = null, startDate = null, endDate = null } = req.query;

    if (!dateRange && (!startDate || !endDate))
      return next(new ErrorResponse("Date Range Is Required", 422));

    const incomeData = {
      miscellaneous: [],
    };

    const { dateObj, prevDateObj } = getDateRange(dateRange, startDate, endDate);

    const tempAggregation =
      dateRange === "daily"
        ? [
            {
              $group: {
                _id: null,
                totalAmount: {
                  $sum: "$paidAmount",
                },
                // push only the issueDate and paidAmount
                incomeList: {
                  $push: {
                    issueDate: "$issueDate",
                    paidAmount: "$paidAmount",
                  },
                },
              },
            },
          ]
        : [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$issueDate",
                  },
                },
                totalAmount: {
                  $sum: "$paidAmount",
                },
              },
            },
            {
              $sort: {
                _id: 1,
              },
            },
            {
              $group: {
                _id: null,
                totalAmount: {
                  $sum: "$totalAmount",
                },
                incomeList: {
                  $push: {
                    issueDate: "$_id",
                    paidAmount: "$totalAmount",
                  },
                },
              },
            },
          ];
    const previous = [
      {
        $match: {
          issueDate: prevDateObj,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: "$paidAmount",
          },
        },
      },
    ];
    const miscAggregate = getIncomeAggregation(
      schoolId,
      dateObj,
      tempAggregation,
      dateRange ? previous : null
    );

    const [{ miscCollected, totalIncomeCollected, prevIncomeCollected = [], totalCollected }] =
      await FeeReceipt.aggregate(miscAggregate);

    if (miscCollected.length) {
      incomeData.miscellaneous = {
        totalAmount: miscCollected.reduce((acc, curr) => acc + curr.amount, 0),
        miscList: miscCollected,
      };
    }
    if (totalCollected.length) {
      incomeData.totalCollected = {
        totalAmount: totalCollected.reduce((acc, curr) => acc + curr.amount, 0),
        feeList: totalCollected,
      };
    }
    const prevAmount = prevIncomeCollected[0]?.totalAmount || 0;
    const currentPaidAmount = totalIncomeCollected[0]?.totalAmount || 0;
    incomeData.totalIncome = {
      amount: currentPaidAmount,
      incomeList: totalIncomeCollected[0]?.incomeList || [],
      // find the average percentage of income
      percentage: prevAmount > 0 ? ((currentPaidAmount - prevAmount) / prevAmount) * 100 : 0,
    };
    res.status(200).json(SuccessResponse(incomeData, 1, "Fetched SuccessFully"));
  } catch (error) {
    console.log(error.stack);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

exports.AddPreviousFee = async (req, res, next) => {
  // accept file from request
  try {
    const { schoolId } = req.params;
    const { file } = req.files;
    const workbook = XLSX.read(file.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet);

    const newArray = rows.filter((r) => r["BALANCE FEES"] > 0);

    const foundStructure = await FeeStructure.find({
      schoolId,
    });
    for (const fs of foundStructure) {
      const { _id } = fs.feeDetails[0];
      for (const stud of newArray) {
        const dueFees = stud["BALANCE FEES"];
        const foundInstallment = await FeeInstallment.findOne({
          rowId: mongoose.Types.ObjectId(_id),
          studentId: mongoose.Types.ObjectId(stud.STUDENTID),
        });
        if (foundInstallment) {
          await FeeInstallment.updateOne(
            {
              rowId: mongoose.Types.ObjectId(_id),
              studentId: mongoose.Types.ObjectId(stud.STUDENTID),
            },
            {
              $set: {
                totalAmount: dueFees,
                netAmount: dueFees,
              },
            }
          );
        }
      }
    }
    await FeeInstallment.updateMany(
      {
        totalAmount: 0,
        schoolId: mongoose.Types.ObjectId(schoolId),
      },
      {
        $set: {
          status: "Paid",
        },
      }
    );
    res.status(200).json(SuccessResponse(null, newArray.length, "Updated Successfully"));
  } catch (error) {
    console.log(error.stack);
  }
};

exports.reportBySchedules = async (req, res, next) => {
  const { scheduleId = null, scheduleDates = [], withDisc = false } = req.body;
  let school_id = null;

  if (!req.user?.school_id) {
    return next(new ErrorResponse("Not Authorized", 500));
  }
  school_id = req.user.school_id;

  // For fee performance
  // Full Paid - On Time, Late
  // Partial Paid - On Time, Late
  // Not Paid
  // We cant show on time / late for multiple schedules, cause 1 can be on time and other can be late and viceversa.
  const sectionList = await getSections(school_id);

  const sortAndGroup = [
    {
      $sort: {
        totalAmount: -1,
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: {
          $sum: "$totalAmount",
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
  ];

  const match = {
    schoolId: mongoose.Types.ObjectId(school_id),
    deleted: false,
  };

  if (scheduleId) match.scheduleTypeId = mongoose.Types.ObjectId(scheduleId);

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

  const amountProp = withDisc ? "$netAmount" : "$totalAmount";

  const aggregate = [
    {
      $facet: {
        totalReceivables: [
          {
            $match: match,
          },
          {
            $group: {
              _id: "$sectionId",
              totalAmount: {
                $sum: amountProp,
              },
            },
          },
          ...sortAndGroup,
        ],
        totalDues: [
          {
            $match: match,
          },
          {
            $addFields: {
              dueAmount: {
                $subtract: [amountProp, "$paidAmount"],
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
          ...sortAndGroup,
        ],
        totalCollected: [
          {
            $match: match,
          },
          {
            $group: {
              _id: "$sectionId",
              totalAmount: {
                $sum: "$paidAmount",
              },
            },
          },
          ...sortAndGroup,
        ],
        feePerformance: [
          {
            $match: match,
          },
          {
            $group: {
              _id: "$schoolId",
              paidCount: {
                $sum: {
                  $cond: [
                    {
                      $eq: ["$status", "Paid"],
                    },
                    1,
                    0,
                  ],
                },
              },
              lateCount: {
                $sum: {
                  $cond: [
                    {
                      $eq: ["$status", "Late"],
                    },
                    1,
                    0,
                  ],
                },
              },
              dueCount: {
                $sum: {
                  $cond: [
                    {
                      $eq: ["$status", "Due"],
                    },
                    1,
                    0,
                  ],
                },
              },
              upcomingCount: {
                $sum: {
                  $cond: [
                    {
                      $eq: ["$status", "Upcoming"],
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

  const [feesReport] = await FeeInstallment.aggregate(aggregate);

  const { totalReceivables, totalDues, totalCollected, feePerformance } = feesReport;

  const setDefaultValues = (data) => {
    const defaultData = {
      totalAmount: 0,
      maxClass: { amount: 0, sectionId: null },
      minClass: { amount: 0, sectionId: null },
    };
    return { ...defaultData, ...data };
  };

  const updateSectionInfo = (sectionObj, info) => {
    const section = sectionObj[info.sectionId];
    return section
      ? {
          amount: info.amount,
          sectionId: {
            _id: section._id,
            sectionName: section.name,
            className: section.className,
          },
        }
      : null;
  };

  const setDefaultValuesAndUpdateSectionInfo = (data, sectionObj) => {
    const defaultData = setDefaultValues(data);
    const maxClass = updateSectionInfo(sectionObj, defaultData.maxClass);
    const minClass = updateSectionInfo(sectionObj, defaultData.minClass);
    return {
      totalAmount: defaultData.totalAmount,
      maxClass: maxClass || defaultData.maxClass,
      minClass: minClass || defaultData.minClass,
    };
  };

  const totalReceivable = setDefaultValuesAndUpdateSectionInfo(totalReceivables[0], sectionList);

  const totalPending = setDefaultValuesAndUpdateSectionInfo(totalDues[0], sectionList);

  const totalCollectedData = setDefaultValuesAndUpdateSectionInfo(totalCollected[0], sectionList);

  const response = {
    totalReceivable,
    totalPending,
    totalCollectedData,
  };

  response.feePerformance = feePerformance[0] ?? {
    paidCount: 0,
    lateCount: 0,
    dueCount: 0,
    upcomingCount: 0,
  };

  res.status(200).json(SuccessResponse(response, 1, "Fetched SuccessFully"));
};
