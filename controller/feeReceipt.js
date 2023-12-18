const mongoose = require("mongoose");
const moment = require("moment");
const excel = require("excel4node");
const FeeReceipt = require("../models/feeReceipt");
const FeeType = require("../models/feeType");
const SuccessResponse = require("../utils/successResponse");
const DiscountCategory = require("../models/discountCategory");
const FeeInstallment = require("../models/feeInstallment");
const PreviousBalance = require("../models/previousFeesBalance");
const Expense = require("../models/expense");
const { getStartDate, getEndDate } = require("../helpers/dateFormat");

const Student = mongoose.connection.db.collection("students");
const catchAsync = require("../utils/catchAsync");
const ErrorResponse = require("../utils/errorResponse");
const AcademicYear = require("../models/academicYear");
const { sendNotification } = require("../socket/socket");

const getWorkSheet = (worksheet, receiptDetails, methodMap) =>
  new Promise((resolve, reject) => {
    try {
      let rowIndex = 2; // Start from row 2
      receiptDetails.forEach((receipt, index) => {
        worksheet.cell(index + 2, 1).string(receipt.student);
        worksheet.cell(index + 2, 2).string(`${receipt.class} - ${receipt.section}`);
        worksheet.cell(index + 2, 3).string(receipt.description.join(","));
        worksheet.cell(index + 2, 4).string(receipt.receiptId);
        worksheet.cell(index + 2, 5).string(receipt.No);
        // 20-05-2023
        worksheet.cell(index + 2, 6).string(moment(receipt.issueDate).format("DD-MM-YYYY"));
        worksheet.cell(index + 2, 7).string(receipt.method);
        worksheet.cell(index + 2, 8).number(receipt.amount);

        methodMap.set(receipt.method, (methodMap.get(receipt.method) || 0) + receipt.amount);

        rowIndex += 1;
      });

      // add total row
      let totalRow = rowIndex + 1;
      methodMap.forEach((value, key) => {
        worksheet.cell(totalRow, 6).string(key);
        worksheet.cell(totalRow, 7).number(value);
        totalRow += 1;
      });

      // Grant Total
      worksheet.cell(totalRow, 6).string("Grant Total");
      worksheet
        .cell(totalRow, 7)
        .number(Array.from(methodMap.values()).reduce((acc, curr) => acc + curr, 0));

      resolve();
    } catch (error) {
      reject(error);
    }
  });

const getIncomeAggregation = (dateObj, school_id, tempAggregation) => [
  {
    $match: {
      "school.schoolId": mongoose.Types.ObjectId(school_id),
      status: {
        $in: ["APPROVED", "REQUESTED", "REJECTED"],
      },
      issueDate: dateObj,
    },
  },
  {
    $facet: {
      miscCollected: [
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
          $addFields: {
            _id: {
              $first: "$_id.feeType",
            },
          },
        },
      ],
      totalIncomeCollected: tempAggregation,
      paymentTypeData: [
        {
          $group: {
            _id: "$payment.method",
            totalAmount: {
              $sum: "$paidAmount",
            },
          },
        },
      ],
    },
  },
  {
    $project: {
      miscCollected: "$miscCollected",
      totalIncomeCollected: {
        $first: "$totalIncomeCollected",
      },
      paymentTypeData: "$paymentTypeData",
    },
  },
];

const getExpenseAggregation = (dateObj, school_id, tempExpAggregation) => [
  {
    $match: {
      schoolId: mongoose.Types.ObjectId(school_id),
      expenseDate: dateObj,
    },
  },
  {
    $facet: {
      // totalExpense: [
      // 	{
      // 		$group: {
      // 			_id: '$expenseType',
      // 			totalExpAmount: {
      // 				$sum: '$amount',
      // 			},
      // 			schoolId: {
      // 				$first: '$schoolId',
      // 			},
      // 		},
      // 	},
      // 	{
      // 		$lookup: {
      // 			from: 'expensetypes',
      // 			let: {
      // 				expTypeId: '$_id',
      // 			},
      // 			pipeline: [
      // 				{
      // 					$match: {
      // 						$expr: {
      // 							$eq: ['$_id', '$$expTypeId'],
      // 						},
      // 					},
      // 				},
      // 				{
      // 					$project: {
      // 						name: 1,
      // 					},
      // 				},
      // 			],
      // 			as: '_id',
      // 		},
      // 	},
      // 	{
      // 		$group: {
      // 			_id: '$schoolId',
      // 			totalAmount: {
      // 				$sum: '$totalExpAmount',
      // 			},
      // 			maxExpType: {
      // 				$max: {
      // 					totalExpAmount: '$totalExpAmount',
      // 					expenseType: {
      // 						$first: '$_id',
      // 					},
      // 				},
      // 			},
      // 			minExpType: {
      // 				$min: {
      // 					totalExpAmount: '$totalExpAmount',
      // 					expenseType: {
      // 						$first: '$_id',
      // 					},
      // 				},
      // 			},
      // 		},
      // 	},
      // ],
      expenseTypeData: [
        {
          $group: {
            _id: "$expenseType",
            totalExpAmount: {
              $sum: "$amount",
            },
            schoolId: {
              $first: "$schoolId",
            },
          },
        },
        {
          $lookup: {
            from: "expensetypes",
            let: {
              expTypeId: "$_id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$_id", "$$expTypeId"],
                  },
                },
              },
              {
                $project: {
                  name: 1,
                },
              },
            ],
            as: "_id",
          },
        },
        // _id[0].name
        {
          $addFields: {
            _id: {
              $first: "$_id._id",
            },
            expenseTypeName: {
              $first: "$_id.name",
            },
          },
        },
      ],
      totalExpenseCurrent: tempExpAggregation,
    },
  },
];

const getStudentData = async (schoolId) => {
  const [studentData] = await Student.aggregate([
    {
      $match: {
        school_id: mongoose.Types.ObjectId(schoolId),
        deleted: false,
        profileStatus: "APPROVED",
      },
    },
    {
      $group: {
        _id: "$school_id",
        totalCount: {
          $sum: 1,
        },
        boysCount: {
          $sum: {
            $cond: [
              {
                $in: ["$gender", ["Male", "M", "MALE"]],
              },
              1,
              0,
            ],
          },
        },
        girlsCount: {
          $sum: {
            $cond: [
              {
                $in: ["$gender", ["Female", "F", "FEMALE"]],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).toArray();
  return (
    studentData ?? {
      totalCount: 0,
      boysCount: 0,
      girlsCount: 0,
    }
  );
};

const getExpenseData = async (schoolId, dateObj, tempExpAggregation) => {
  const totalExpenseAggregation = getExpenseAggregation(dateObj, schoolId, tempExpAggregation);
  const expenseData = await Expense.aggregate(totalExpenseAggregation);
  return expenseData;
};

const getIncomeData = async (schoolId, dateObj, tempIncAggregation) => {
  const totalIncomeAggregation = getIncomeAggregation(dateObj, schoolId, tempIncAggregation);
  const incomeData = await FeeReceipt.aggregate(totalIncomeAggregation);
  return incomeData;
};

const getDiscountData = async (schoolId) => {
  const discountCategories = await DiscountCategory.find({
    schoolId: mongoose.Types.ObjectId(schoolId),
    totalStudents: {
      $gt: 0,
    },
  }).lean();

  // calculate the total discount amount
  const totalDiscountAmount = discountCategories.reduce(
    (acc, curr) => acc + (curr.totalBudget - curr.budgetRemaining),
    0
  );

  // DISCOUNT DATA
  const [discountReport] = await FeeInstallment.aggregate([
    {
      $match: {
        schoolId: mongoose.Types.ObjectId(schoolId),
        totalDiscountAmount: {
          $gt: 0,
        },
      },
    },
    {
      $group: {
        _id: "$sectionId",
        totalDiscountAmount: {
          $sum: "$totalDiscountAmount",
        },
      },
    },
    {
      $sort: {
        totalDiscountAmount: -1,
      },
    },
    {
      $group: {
        _id: null,
        maxClass: {
          $first: {
            sectionId: "$_id",
            totalDiscountAmount: "$totalDiscountAmount",
          },
        },
        minClass: {
          $last: {
            sectionId: "$_id",
            totalDiscountAmount: "$totalDiscountAmount",
          },
        },
      },
    },
    {
      $lookup: {
        from: "sections",
        let: {
          maxId: "$maxClass.sectionId",
          minId: "$minClass.sectionId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: ["$_id", ["$$maxId", "$$minId"]],
              },
            },
          },
          {
            $project: {
              className: 1,
            },
          },
        ],
        as: "sections",
      },
    },
    {
      $project: {
        maxClass: {
          sectionId: {
            $first: "$sections",
          },
          amount: "$maxClass.totalDiscountAmount",
        },
        minClass: {
          sectionId: {
            $last: "$sections",
          },
          amount: "$minClass.totalDiscountAmount",
        },
      },
    },
  ]);

  return {
    totalDiscountAmount,
    discountReport,
  };
};

const getDateRange = (dateRange, startDate, endDate) => {
  switch (dateRange) {
    case "daily":
      return {
        $gte: getStartDate(startDate, "day"),
        $lte: getEndDate(endDate, "day"),
      };
    case "weekly":
      return {
        $gte: getStartDate(startDate, "week"),
        $lte: getEndDate(endDate, "week"),
      };
    case "monthly":
      return {
        $gte: getStartDate(startDate, "month"),
        $lte: getEndDate(endDate, "month"),
      };
    default:
      return {
        $gte: getStartDate(startDate),
        $lte: getEndDate(endDate),
      };
  }
};

const handleError = (next, message, status = 422) => next(new ErrorResponse(message, status));

// const updateInstallment = async (installmentId, paidAmount) => {
//   const installment = await FeeInstallment.findOne({
//     _id: installmentId,
//   }).lean();

//   if (!installment) {
//     return null;
//   }

//   const { paidAmount: insPaidAmount, netAmount, status: insStatus } = installment;
//   const dueAmount = netAmount - insPaidAmount;

//   if (paidAmount > dueAmount) {
//     return null;
//   }

//   const newStatus =
//     // eslint-disable-next-line no-nested-ternary
//     dueAmount - paidAmount === 0 ? (insStatus === "Upcoming" ? "Paid" : "Late") : insStatus;

//   return {
//     filter: { _id: installmentId },
//     update: {
//       $set: {
//         status: newStatus,
//         paidAmount: insPaidAmount + paidAmount,
//         paidDate: new Date(),
//       },
//     },
//   };
// };

const updateInstallment = async (installmentId, paidAmount, paymentMethod) => {
  const installment = await FeeInstallment.findOne({
    _id: installmentId,
  }).lean();

  if (!installment) {
    return null;
  }

  const { paidAmount: insPaidAmount, netAmount, status: insStatus } = installment;
  const dueAmount = netAmount - insPaidAmount;

  if (paidAmount > dueAmount) {
    return null;
  }

  const newStatus =
    dueAmount - paidAmount === 0
      ? insStatus === "Upcoming"
        ? "Paid"
        : "Late"
      : paymentMethod !== "cash"
      ? "Pending"
      : insStatus;

  return {
    filter: { _id: installmentId },
    update: {
      $set: {
        status: newStatus,
        paidAmount: insPaidAmount + paidAmount,
        paidDate: new Date(),
      },
    },
  };
};

const updatePreviousBalance = async (id, paidAmount) => {
  const prevBalance = await PreviousBalance.findOne({ receiptIds: id }).lean();

  if (!prevBalance) {
    return null;
  }

  const {
    paidAmount: prevPaidAmount,
    dueAmount,
    status: prevStatus,
    _id: prevBalanceId,
  } = prevBalance;

  if (paidAmount > dueAmount) {
    return null;
  }

  const newStatus = dueAmount - paidAmount === 0 ? "Paid" : prevStatus;

  return {
    filter: { _id: prevBalanceId },
    update: {
      $set: {
        status: newStatus,
        paidAmount: prevPaidAmount + paidAmount,
        dueAmount: dueAmount - paidAmount,
        lastPaidDate: new Date(),
      },
    },
  };
};

// Filter BY 'student.class.classId' and 'payment.method
const getFeeReceipt = catchAsync(async (req, res, next) => {
  let { schoolId, classId, paymentMode, receiptType, page = 0, limit = 5 } = req.query;
  page = +page;
  limit = +limit;
  const payload = {};
  // find the active academic year

  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });
  payload["academicYear.academicYearId"] = mongoose.Types.ObjectId(academicYearId);
  if (schoolId) {
    payload["school.schoolId"] = mongoose.Types.ObjectId(schoolId);
  }
  if (classId) {
    payload["student.class.classId"] = mongoose.Types.ObjectId(classId);
  }
  if (paymentMode) {
    payload["payment.method"] = paymentMode;
  }
  if (receiptType) {
    payload.receiptType = receiptType;
  }

  const aggregate = [
    {
      $match: payload,
    },
    {
      $facet: {
        data: [
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
            $unwind: {
              path: "$items",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "feetypes",
              let: {
                feeTypeId: "$items.feeTypeId",
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
                    _id: 1,
                    feeType: 1,
                  },
                },
              ],
              as: "items.feeTypeId",
            },
          },
          {
            $group: {
              _id: "$_id",
              items: {
                $push: {
                  feeTypeId: {
                    $first: "$items.feeTypeId",
                  },
                  installmentId: "$items.installmentId",
                  netAmount: "$items.netAmount",
                  paidAmount: "$items.paidAmount",
                },
              },
              root: { $first: "$$ROOT" },
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: ["$root", { items: "$items" }],
              },
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
        ],
        count: [{ $count: "count" }],
      },
    },
  ];

  const [{ data, count }] = await FeeReceipt.aggregate(aggregate);

  if (count.length === 0) {
    return next(new ErrorResponse("No Fee Receipts Found", 404));
  }
  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});

const receiptByStudentId = catchAsync(async (req, res, next) => {
  const { school_id } = req.user;
  const {
    date,
    status,
    paymentMethod,
    categoryId,
    studentId = null,
    username,
    sectionId,
    isPrev = false,
  } = req.body;

  if (!studentId && !username) {
    return next(new ErrorResponse("Please Provide All Fields", 422));
  }

  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId: school_id,
  });

  const payload = {
    "academicYear.academicYearId": mongoose.Types.ObjectId(academicYearId),
  };

  if (studentId) {
    payload["student.studentId"] = mongoose.Types.ObjectId(studentId);
  } else {
    payload["student.username"] = username;
    payload["student.section.sectionId"] = mongoose.Types.ObjectId(sectionId);
  }

  if (isPrev && isPrev === "true") {
    payload.receiptType = "PREVIOUS";
  }
  if (date) {
    payload.issueDate = {
      $gte: moment(date, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(date, "DD/MM/YYYY").endOf("day").toDate(),
    };
  }
  if (status) payload.status = status;
  if (paymentMethod) payload["payment.method"] = paymentMethod;
  if (categoryId) payload["category.feeCategoryId"] = mongoose.Types.ObjectId(categoryId);

  const projection = {
    amount: "$paidAmount",
    receiptId: 1,
    comment: 1,
    issueDate: 1,
    paymentMode: "$payment.method",
    status: 1,
    reasons: 1,
    reason: {
      $let: {
        vars: {
          items: {
            $filter: {
              input: "$reasons",
              as: "item",
              cond: {
                $eq: ["$$item.status", "$status"],
              },
            },
          },
        },
        in: {
          $last: "$$items.reason",
        },
      },
    },
  };

  const feeReceipts = await FeeReceipt.find(payload, projection).sort({ createdAt: -1 }).lean();
  if (feeReceipts.length === 0) {
    return next(new ErrorResponse("No Fee Receipts Found", 404));
  }
  res.status(200).json(SuccessResponse(feeReceipts, feeReceipts.length, "Fetched Successfully"));
});

const getFeeReceiptSummary = catchAsync(async (req, res, next) => {
  let {
    schoolId,
    sectionId,
    paymentMode,
    receiptType,
    status,
    date, // single day
    startDate, // range
    endDate, // range
    page = 0,
    limit = 5,
    search,
  } = req.query;
  page = +page;
  limit = +limit;
  const payload = {
    status: {
      $in: ["APPROVED", "REQUESTED", "REJECTED"],
    },
  };
  // find the active academic year

  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });
  payload["academicYear.academicYearId"] = mongoose.Types.ObjectId(academicYearId);
  if (schoolId) {
    payload["school.schoolId"] = mongoose.Types.ObjectId(schoolId);
  }
  if (sectionId) {
    payload["student.section.sectionId"] = mongoose.Types.ObjectId(sectionId);
  }
  if (paymentMode) {
    payload["payment.method"] = paymentMode;
  }
  if (receiptType) {
    payload.receiptType = receiptType;
  }
  if (status) payload.status = status;
  if (date) {
    const fromDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
    const tillDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
    payload.issueDate = { $gte: fromDate, $lte: tillDate };
  }
  if (startDate && endDate) {
    payload.issueDate = {
      $gte: moment(startDate, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(endDate, "DD/MM/YYYY").endOf("day").toDate(),
    };
  }

  if (search) {
    payload.$or = [
      { "student.name": { $regex: `${search}`, $options: "i" } },
      { receiptId: { $regex: `${search}`, $options: "i" } },
    ];
    // payload.$text = { $search: search };
  }

  const aggregation = [
    {
      $match: payload,
    },
    {
      $facet: {
        data: [
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
              let: {
                studId: "$student.studentId",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$_id", "$$studId"],
                    },
                  },
                },
                {
                  $project: {
                    admission_no: 1,
                  },
                },
              ],
              as: "admission",
            },
          },
          {
            $project: {
              name: "$student.name",
              admission_no: {
                $first: "$admission.admission_no",
              },
              className: {
                $concat: ["$student.class.name", " - ", "$student.section.name"],
              },
              parentName: "$parent.name",
              amount: "$paidAmount",
              items: 1,
              payment: 1,
              receiptId: 1,
              comment: 1,
              issueDate: 1,
              paymentMode: "$payment.method",
              reason: {
                $let: {
                  vars: {
                    items: {
                      $filter: {
                        input: "$reasons",
                        as: "item",
                        cond: {
                          $eq: ["$$item.status", "$status"],
                        },
                      },
                    },
                  },
                  in: {
                    $last: "$$items.reason",
                  },
                },
              },
              status: 1,
            },
          },
          {
            $unwind: {
              path: "$items",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "feetypes",
              let: {
                feeTypeId: "$items.feeTypeId",
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
                    _id: 1,
                    feeType: 1,
                  },
                },
              ],
              as: "items.feeTypeId",
            },
          },
          {
            $group: {
              _id: "$_id",
              items: {
                $addToSet: {
                  $first: "$items.feeTypeId.feeType",
                },
              },
              root: {
                $first: "$$ROOT",
              },
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: [
                  "$root",
                  {
                    items: "$items",
                  },
                ],
              },
            },
          },
          {
            $sort: {
              createdAt: -1,
            },
          },
        ],
        filterSummary: [
          {
            $group: {
              _id: null,
              docsCount: {
                $sum: 1,
              },
              totalAmount: {
                $sum: "$paidAmount",
              },
            },
          },
        ],
      },
    },
  ];

  const [feeReceipts] = await FeeReceipt.aggregate(aggregation);
  const { data, filterSummary } = feeReceipts;

  if (data.length === 0) {
    return next(new ErrorResponse("No Fee Receipts Found", 404));
  }
  res
    .status(200)
    .json(
      SuccessResponse(
        { data, totalAmount: filterSummary[0].totalAmount },
        filterSummary[0].docsCount,
        "Fetched Successfully"
      )
    );
});

const createReceipt = async (req, res, next) => {
  const {
    receiptType,
    studentId,
    totalFeeAmount,
    paymentMethod,
    comment = "",
    bankName,
    chequeDate,
    chequeNumber,
    transactionDate,
    transactionId,
    upiId,
    status = null,
    payerName,
    ddNumber,
    ddDate,
    issueDate = new Date(),
    feeTypeId,
    createdBy,
  } = req.body;

  if (!studentId || !totalFeeAmount || !paymentMethod || !feeTypeId || !createdBy || !status) {
    return next(new ErrorResponse("All Fields Are Mandatory", 422));
  }

  // find fee type by id
  const foundFeeType = await FeeType.findOne({ _id: feeTypeId }, { feeType: 1 }).lean();

  const foundStudent = await Student.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(studentId),
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
        classId: "$class",
        admission_no: 1,
        className: {
          $first: "$section.className",
        },
        section: {
          $first: "$section",
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

  const {
    studentName = "",
    username = "",
    className = "",
    classId = "",
    section = "",
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

  const className1 = className ? className.split("-")[0].trim() : "";

  const currentDate = moment();
  const date = currentDate.format("DDMMYY");

  let newCount = "00001";
  const lastReceipt = await FeeReceipt.findOne({
    "school.schoolId": schoolId,
  })
    .sort({ createdAt: -1 })
    .lean();

  if (lastReceipt) {
    if (lastReceipt.receiptId) {
      newCount = lastReceipt.receiptId
        .slice(-5)
        .replace(/\d+/, (n) => String(Number(n) + 1).padStart(n.length, "0"));
    }
  }
  const receiptId = `MI${date}${newCount}`; // MI21092100001

  const items = [
    {
      feeTypeId,
      netAmount: totalFeeAmount,
      paidAmount: totalFeeAmount,
    },
  ];

  const receiptPayload = {
    student: {
      name: studentName,
      studentId,
      admission_no,
      class: {
        name: className1,
        classId,
      },
      section: {
        name: section.name,
        sectionId: section._id,
      },
    },
    comment,
    receiptType,
    receiptId,
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
    paidAmount: totalFeeAmount,
    totalAmount: totalFeeAmount,
    dueAmount: 0,
    payment: {
      method: paymentMethod,
      bankName,
      chequeDate,
      chequeNumber,
      transactionDate,
      transactionId,
      upiId,
      payerName,
      ddNumber,
      ddDate,
    },
    issueDate,
    items,
    createdBy,
    status,
    approvedBy: paymentMethod === "CASH" || status === "APPROVED" ? createdBy : null,
  };

  const createdReceipt = await FeeReceipt.create(receiptPayload);

  const notificationSetup = async () => {
    try {
      // setup notification
      const notificationData = {
        title: `Receipt created - ${Number(receiptPayload.paidAmount).toFixed(2)}Rs`,
        description: `Paid in ${paymentMethod}`,
        type: "RECEIPT",
        action: "/receipts",
        status: "DEFAULT",
      };

      // sending notifications
      await sendNotification(receiptPayload.school.schoolId, "MANAGEMENT", notificationData);
    } catch (error) {
      console.log("NOTIFICATION_ERROR", error);
    }
  };

  notificationSetup();

  res.status(201).json(
    SuccessResponse(
      {
        ...JSON.parse(JSON.stringify(createdReceipt)),
        items: [
          {
            ...items[0],
            feeTypeId: foundFeeType,
          },
        ],
      },
      1,
      "Created Successfully"
    )
  );
};

const getFeeReceiptById = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const feeReceipt = await FeeReceipt.findById(id).populate("items.feeTypeId", "feeType").lean();

  for (const item of feeReceipt.items) {
    if (item.installmentId) {
      const ins = await FeeInstallment.findOne({
        _id: item.installmentId,
        deleted: false,
      });
      item.date = ins?.date;
    }
  }

  if (!feeReceipt) {
    return next(new ErrorResponse("Fee Receipt Not Found", 404));
  }

  res.status(200).json(SuccessResponse(feeReceipt, 1, "Fetched Successfully"));
});

const getExcel = catchAsync(async (req, res, next) => {
  // Name	Class	Amount	Description	Receipt ID	Date	Payment Mode
  console.log("here getExcel")
  const { schoolId, sectionId, paymentMode, startDate, endDate } = req.query;
  const payload = {
    status: {
      $in: ["APPROVED", "REQUESTED", "REJECTED"],
    },
  };
  // find the active academic year

  const { _id: academicYearId } = await AcademicYear.findOne({
    isActive: true,
    schoolId,
  });
  payload["academicYear.academicYearId"] = mongoose.Types.ObjectId(academicYearId);
  if (schoolId) {
    payload["school.schoolId"] = mongoose.Types.ObjectId(schoolId);
  }
  if (sectionId) {
    payload["student.section.sectionId"] = mongoose.Types.ObjectId(sectionId);
  }
  if (paymentMode) {
    payload["payment.method"] = paymentMode;
  }
  if (startDate && endDate) {
    payload.issueDate = {
      $gte: moment(startDate, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(endDate, "DD/MM/YYYY").endOf("day").toDate(),
    };
  }
  const methodMap = new Map();
  const receiptDetails = await FeeReceipt.aggregate([
    {
      $match: payload,
    },
    {
      $unwind: {
        path: "$items",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "feetypes",
        localField: "items.feeTypeId",
        foreignField: "_id",
        as: "feetypes",
      },
    },
    {
      $group: {
        _id: "$_id",
        student: {
          $first: "$student.name",
        },
        class: {
          $first: "$student.class.name",
        },
        section: {
          $first: "$student.section.name",
        },
        amount: {
          $first: "$paidAmount",
        },
        description: {
          $addToSet: {
            $first: "$feetypes.feeType",
          },
        },
        receiptId: {
          $first: "$receiptId",
        },
        No: {
          $first: {
            $cond: {
              if: { $gt: ["$payment.chequeNumber", null] },
              then: "$payment.chequeNumber",
              else: "$payment.transactionId"
            }
          },
        },
        issueDate: {
          $first: "$issueDate",
        },
        method: {
          $first: "$payment.method",
        },
      },
    },
    {
      $sort: {
        issueDate: 1,
      },
    },
  ]);
  if (!receiptDetails.length) return next(new ErrorResponse("No Receipts Found", 404));
  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Income Details");

  const header = ["Name", "Class", "Description", "Receipt ID","No", "Date", "Payment Mode", "Amount"];

  header.forEach((item, index) => {
    worksheet.cell(1, index + 1).string(item);
  });

  await getWorkSheet(worksheet, receiptDetails, methodMap);

  // workbook.write('income.xlsx');
  let data = await workbook.writeToBuffer();
  data = data.toJSON().data;

  res.status(200).json(SuccessResponse(data, receiptDetails.length, "Fetched Successfully"));
});

const getDashboardData = async (req, res, next) => {
  try {
    const { school_id } = req.user;
    const { dateRange, startDate, endDate } = req.query;

    if (!dateRange && (!startDate || !endDate)) {
      return next(new ErrorResponse("Date Range Is Required", 422));
    }

    const resObj = {
      totalStudents: await getStudentData(school_id),
    };
    const tempIncAggregation =
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

    const tempExpAggregation =
      dateRange === "daily"
        ? [
            {
              $group: {
                _id: null,
                totalExpAmount: {
                  $sum: "$amount",
                },
                // push only the issueDate and paidAmount
                expenseList: {
                  $push: {
                    expenseDate: "$expenseDate",
                    amount: "$amount",
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
                    date: "$expenseDate",
                  },
                },
                totalExpAmount: {
                  $sum: "$amount",
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
                totalExpAmount: {
                  $sum: "$totalExpAmount",
                },
                expenseList: {
                  $push: {
                    expenseDate: "$_id",
                    amount: "$totalExpAmount",
                  },
                },
              },
            },
          ];

    const dateObj = getDateRange(dateRange, startDate, endDate);

    const [{ miscCollected, totalIncomeCollected, paymentTypeData }] = await getIncomeData(
      school_id,
      dateObj,
      tempIncAggregation
    );

    resObj.paymentMethods = paymentTypeData;
    resObj.financialFlows = { income: miscCollected };

    const [{ totalExpenseCurrent, expenseTypeData }] = await getExpenseData(
      school_id,
      dateObj,
      tempExpAggregation
    );

    // const totalExpenseData = totalExpense[0] || {
    // 	totalAmount: 0,
    // 	maxExpType: { totalExpAmount: 0, expenseType: null },
    // 	minExpType: { totalExpAmount: 0, expenseType: null },
    // };

    resObj.expenseData = {
      // totalExpense: totalExpenseData,
      totalExpenseCurrent: totalExpenseCurrent[0] || {
        totalExpAmount: 0,
        expenseList: [],
      },
    };
    resObj.financialFlows.expense = expenseTypeData;

    const { totalDiscountAmount, discountReport } = await getDiscountData(school_id);

    resObj.totalDiscounts = discountReport
      ? { ...discountReport, totalApprovedAmount: totalDiscountAmount }
      : {
          totalApprovedAmount: 0,
          maxClass: { amount: 0, sectionId: null },
          minClass: { amount: 0, sectionId: null },
        };

    const currentPaidAmount = totalIncomeCollected?.totalAmount || 0;

    resObj.incomeData = {
      amount: currentPaidAmount,
      incomeList: totalIncomeCollected?.incomeList || [],
    };

    res.status(200).json(SuccessResponse(resObj, 1, "Fetched Successfully"));
  } catch (err) {
    console.log(err.stack);
    next(err);
  }
};

const cancelReceipt = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { reason = "", status, today = new Date() } = req.body;

  const reasonObj = { reason, status, date: today };
  const update = { $set: { status } };

  if (status !== "CANCELLED") {
    update.$push = { reasons: reasonObj };
  }

  const updatedReceipt = await FeeReceipt.findOneAndUpdate({ _id: id }, update, { new: true });

  if (!updatedReceipt) {
    return next(new ErrorResponse("Receipt Not Found", 400));
  }

  const {
    receiptType,
    paidAmount: prevPaidAmount,
    student,
    isPreviousBalance,
    items,
  } = updatedReceipt;

  // Need to convert this into switch case

  let installmentIds;
  let installments;
  let PrevUpdate;

  let switchVar = null;

  if (status === "CANCELLED") {
    if (receiptType !== "PREVIOUS_BALANCE") {
      switchVar = isPreviousBalance ? "COMBINED" : "ACADEMIC";
    } else {
      switchVar = "PREVIOUS_BALANCE";
    }
  }

  switch (switchVar) {
    case "ACADEMIC":
      installmentIds = updatedReceipt.items.map(({ installmentId }) => installmentId);
      installments = await FeeInstallment.find({
        _id: { $in: installmentIds },
      });

      for (const installment of installments) {
        const { _id, date, paidAmount } = installment;
        const newPaidAmount =
          paidAmount -
          updatedReceipt.items.find(
            ({ installmentId }) => installmentId.toString() === _id.toString()
          ).paidAmount;
        const newStatus = moment(date).isAfter(moment()) ? "Upcoming" : "Due";
        const newUpdate = {
          $set: { status: newStatus, paidAmount: newPaidAmount },
        };

        if (newPaidAmount === 0) {
          newUpdate.$unset = { paidDate: null };
        }

        await FeeInstallment.findOneAndUpdate({ _id, deleted: false }, newUpdate);
      }
      break;

    case "COMBINED":
      installmentIds = items.map(({ installmentId }) => installmentId);
      installments = await FeeInstallment.find({
        _id: { $in: installmentIds },
      }).lean();

      for (const installment of installments) {
        const { _id, date, paidAmount: insPaidAmount } = installment;
        const newPaidAmount =
          insPaidAmount -
          items.find(({ installmentId }) => installmentId.toString() === _id.toString()).paidAmount;
        const newStatus = moment(date).isAfter(moment()) ? "Upcoming" : "Due";
        const newUpdate = {
          $set: { status: newStatus, paidAmount: newPaidAmount },
        };

        if (newPaidAmount === 0) {
          newUpdate.$unset = { paidDate: null };
        }

        await FeeInstallment.findOneAndUpdate({ _id, deleted: false }, newUpdate);
      }
      // This is the previous balance object
      // eslint-disable-next-line no-case-declarations
      const { paidAmount: insPrevAmount } = items[0];
      PrevUpdate = {
        $inc: {
          paidAmount: -insPrevAmount,
          dueAmount: insPrevAmount,
        },
      };

      if (insPrevAmount) {
        PrevUpdate.$set = { status: "Due" };
      }

      // Pre - Release run the migration script for existing data to add receiptIds
      await PreviousBalance.findOneAndUpdate(
        {
          studentId: student.studentId,
          receiptIds: id,
        },
        PrevUpdate
      );

      break;

    case "PREVIOUS_BALANCE":
      PrevUpdate = {
        $inc: {
          paidAmount: -prevPaidAmount,
          dueAmount: prevPaidAmount,
        },
      };

      if (prevPaidAmount) {
        PrevUpdate.$set = { status: "Due" };
      }

      // Pre - Release run the migration script for existing data
      await PreviousBalance.findOneAndUpdate(
        {
          studentId: student.studentId,
          receiptIds: id,
        },
        PrevUpdate
      );
      break;

    default:
      break;
  }

  res.status(200).json(SuccessResponse(updatedReceipt, 1, "Updated Successfully"));
});

/**
 * @param {String} date // DD/MM/YYYY
 * @param {String} studentId
 * @param {String} paymentMethod // CHEQUE, UPI, ONLINE_TRANSFER, DD, DEBIT_CARD, CREDIT_CARD
 * @param {String} receiptStatus // PENDING, DECLINED
 * @param {String} searchTerm // student name and receipt id
 * @description Get all the pending requests for the given date, studentId, paymentMethod, receiptStatus
 * @returns {Array} // Array of objects
 */

const statusList = ["PENDING", "RESEND", "DECLINED", "APPROVED"];
const GetConfirmations = catchAsync(async (req, res, next) => {
  const {
    date = null,
    studentId,
    paymentMethod,
    sectionId,
    searchTerm = null,
    status = null,
    page = 0,
    limit = 10,
  } = req.body;
  const { school_id } = req.user;

  if (paymentMethod === "CASH")
    return next(new ErrorResponse("Select Online Payment Methods", 422));

  const payload = {
    status: {
      $in: status ? [status] : statusList,
    },
    "school.schoolId": mongoose.Types.ObjectId(school_id),
    "payment.method": paymentMethod || { $ne: "CASH" },
  };

  if (studentId) {
    payload["student.studentId"] = mongoose.Types.ObjectId(studentId);
  }
  if (searchTerm) {
    payload.$or = [
      { "student.name": { $regex: `${searchTerm}`, $options: "i" } },
      { receiptId: { $regex: `${searchTerm}`, $options: "i" } },
    ];
  }

  if (sectionId) payload["student.section.sectionId"] = mongoose.Types.ObjectId(sectionId);

  if (date)
    payload.issueDate = {
      $gte: moment(date, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(date, "DD/MM/YYYY").endOf("day").toDate(),
    };

  const aggregate = [
    {
      $match: payload,
    },
    {
      $facet: {
        data: [
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
            $unwind: {
              path: "$items",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: "feetypes",
              let: {
                feeTypeId: "$items.feeTypeId",
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
                    _id: 1,
                    feeType: 1,
                  },
                },
              ],
              as: "items.feeTypeId",
            },
          },
          {
            $group: {
              _id: "$_id",
              items: {
                $push: {
                  feeTypeId: {
                    $first: "$items.feeTypeId",
                  },
                  installmentId: "$items.installmentId",
                  netAmount: "$items.netAmount",
                  paidAmount: "$items.paidAmount",
                },
              },
              root: {
                $first: "$$ROOT",
              },
            },
          },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: [
                  "$root",
                  {
                    items: "$items",
                  },
                ],
              },
            },
          },
          {
            $project: {
              items: 1,
              payment: 1,
              issueDate: 1,
              receiptId: 1,
              studentName: "$student.name",
              className: {
                $concat: ["$student.class.name", " - ", "$student.section.name"],
              },
              status: 1,
              paidAmount: 1,
              paymentComments: 1,
            },
          },
        ],
        count: [{ $count: "count" }],
      },
    },
  ];

  const receipts = await FeeReceipt.aggregate(aggregate);

  const [{ data, count }] = receipts;

  if (!count.length) return next(new ErrorResponse("No Receipts Found", 404));

  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});

const UpdateConfirmations = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, comment = "", attachments = [] } = req.body;
  const { _id } = req.user;

  if (!status) {
    return handleError(next, "Status is required");
  }

  const match = { _id: id };

  if (status === "APPROVED" || status === "DECLINED") {
    match.status = { $in: ["PENDING", "RESEND"] };
  }

  const bulkOps = [];

  if (status === "APPROVED") {
    const receipt = await FeeReceipt.findById(id).lean();

    if (!receipt) {
      return handleError(next, "Receipt Not Found", 404);
    }

    const { items, receiptType } = receipt;

    if (receiptType === "ACADEMIC") {
      for (const item of items) {
        const { installmentId, paidAmount } = item;
        const update = await updateInstallment(installmentId, paidAmount);

        if (!update) {
          return handleError(
            next,
            `Cannot Approve Receipt. Paid Amount is more than Due Amount.`,
            422
          );
        }

        bulkOps.push({ updateOne: update });
      }

      await FeeInstallment.bulkWrite(bulkOps);
    } else if (receiptType === "PREVIOUS_BALANCE") {
      const { paidAmount } = items[0];
      const update = await updatePreviousBalance(id, paidAmount);

      if (!update) {
        return handleError(
          next,
          "Cannot Approve Receipt. Paid Amount is more than Due Amount",
          422
        );
      }

      const { filter, update: updateObj } = update;

      await PreviousBalance.findOneAndUpdate(filter, updateObj);
    }
  }

  const payload = {
    $set: { status, approvedBy: _id },
    $push: {
      paymentComments: { comment, date: new Date(), status, attachments },
    },
  };

  const updatedReceipt = await FeeReceipt.findOneAndUpdate({ _id: id }, payload);

  if (!updatedReceipt) {
    return handleError(next, "Receipt Not Found", 404);
  }

  res.status(200).json(SuccessResponse(updatedReceipt, 1, "Updated Successfully"));
});

module.exports = {
  getFeeReceipt,
  getFeeReceiptById,
  UpdateConfirmations,
  createReceipt,
  GetConfirmations,
  getFeeReceiptSummary,
  receiptByStudentId,
  getDashboardData,
  getExcel,
  cancelReceipt,
};
