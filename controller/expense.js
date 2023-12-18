/* eslint-disable no-unused-expressions */
const mongoose = require("mongoose");
const moment = require("moment");
const excel = require("excel4node");
const ExpenseModel = require("../models/expense");
const ExpenseType = require("../models/expenseType");
const ErrorResponse = require("../utils/errorResponse");
const catchAsync = require("../utils/catchAsync");
const SuccessResponse = require("../utils/successResponse");
const redisClient = require("../utils/redisClient");
const { getStartDate, getEndDate, getPrevStartDate, getPrevEndDate } = require("../helpers/dateFormat");
const { sendNotification } = require("../socket/socket");

// Define constants
const CACHE_EXPIRATION_TIME = 60 * 60 * 24; // 1 day in seconds

// Helper function to fetch data from Redis cache or database
const fetchDataFromCacheOrDatabase = async (cacheKey, queryFn) => {
  if (!cacheKey) {
    return await queryFn(); // No cache key, directly query the database
  }

  const cachedData = await redisClient.get(cacheKey);

  if (!cachedData) {
    const data = await queryFn();

    if (data) {
      await redisClient.set(cacheKey, JSON.stringify(data), "EX", CACHE_EXPIRATION_TIME);
    }

    return data;
  }

  return JSON.parse(cachedData);
};

// Helper function to calculate date range
const getDateRange = (startDate, endDate, interval) => {
  const dateObj = {
    $gte: getStartDate(startDate, interval),
    $lte: getEndDate(endDate, interval),
  };
  const prevDateObj = {
    $gte: getPrevStartDate(startDate, interval, `${interval}s`), // Update this for other intervals
    $lte: getPrevEndDate(endDate, interval, `${interval}s`), // Update this for other intervals
  };
  return { dateObj, prevDateObj };
};

// CREATE
exports.create = async (req, res, next) => {
  const {
    reason,
    amount,
    approvedBy,
    paymentMethod,
    expenseType,
    expenseTypeName,
    expenseDate,
    schoolId,
    createdBy,
    transactionDetails,
  } = req.body;

  const date = moment(expenseDate, "DD/MM/YYYY").format("DDMMYY");

  const weekNumber = moment(expenseDate, "DD/MM/YYYY").week();

  if (!paymentMethod || !schoolId || !expenseType || !createdBy) {
    return next(new ErrorResponse("All Fields are Mandatory", 422));
  }

  const foundExpenseType = await ExpenseType.findOne({
    _id: mongoose.Types.ObjectId(expenseType),
  })
    .select("remainingBudget")
    .lean();

  if (!foundExpenseType) {
    return next(new ErrorResponse("Expense type not found", 400));
  }

  if (amount > foundExpenseType.remainingBudget) {
    return next(new ErrorResponse("Amount Exceeds Budget Amount", 400));
  }

  const lastVoucherNumber = await ExpenseModel.findOne({
    schoolId: mongoose.Types.ObjectId(schoolId),
  })
    .sort({ createdAt: -1 })
    .lean();

  let newCount = "00001";

  if (lastVoucherNumber && lastVoucherNumber.voucherNumber) {
    newCount = lastVoucherNumber.voucherNumber
      .slice(-5)
      .replace(/\d+/, (n) => String(Number(n) + 1).padStart(n.length, "0"));
  }
  const voucherNumber = `${expenseTypeName.slice(0, 2).toUpperCase()}${date}${newCount}`;

  // const currentDate = new Date();
  const expenseDateDate = moment(expenseDate, "DD/MM/YYYY").format("YYYY-MM-DD[T]HH:mm:ss.SSS[Z]");

  let newExpense;
  try {
    newExpense = await ExpenseModel.create({
      reason,
      schoolId,
      voucherNumber,
      amount,
      transactionDetails,
      expenseDate: expenseDateDate,
      paymentMethod,
      expenseType,
      approvedBy,
      createdBy,
    });
    newExpense = JSON.parse(JSON.stringify(newExpense));
    const remainingBudget = await ExpenseType.findOneAndUpdate(
      {
        _id: expenseType,
      },
      {
        $inc: { remainingBudget: -parseInt(amount) },
        $addToSet: { expensesHistory: newExpense._id },
      },
      {
        new: true,
      }
    );

    newExpense.remainingBudget = remainingBudget.remainingBudget;
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }

  const [day, month, year] = expenseDate.split("/");

  // Delete cache keys using template literals
  await Promise.all([
    redisClient.del(`dailyExpense/${schoolId}/${year}${month}${day}`),
    redisClient.del(`weeklyExpense/${schoolId}/${weekNumber}`),
    redisClient.del(`monthlyExpense/${schoolId}/${month}`),
  ]);

  const notificationSetup = async () => {
    try {
      // setup notification
      const notificationData = {
        title: `Expence created - ${Number(amount).toFixed(2)}Rs`,
        description: `Created due to ${reason}`,
        type: "PAYMENT",
        action: "/expense",
        status: "DEFAULT",
      };

      // sending notifications
      await sendNotification(schoolId, "MANAGEMENT", notificationData);
    } catch (error) {
      console.log("NOTIFICATION_ERROR", error);
    }
  };

  notificationSetup();

  return res.status(201).json(SuccessResponse(newExpense, 1, "Created Successfully"));
};

// GET
exports.getExpenses = catchAsync(async (req, res, next) => {
  let match = {};
  const limit = parseInt(req.body.limit ?? 10);
  const page = req.body.page ?? 1;
  const skip = parseInt(page - 1) * limit;
  const sortBy = req.body.sortBy ?? "expenseDate";
  const sortOrder = req.body.sortOrder ?? 1;
  const sortObject = {};
  let searchTerm = req.body.searchTerm ?? "";
  sortObject[sortBy] = sortOrder;
  match = {
    schoolId: mongoose.Types.ObjectId(req.body.schoolId),
  };

  if (searchTerm != "") {
    searchTerm = searchTerm.replace(/\(/gi, "\\(").replace(/\)/gi, "\\)");
    match.$or = [
      { expenseType: { $regex: `${searchTerm}`, $options: "i" } },
      { reason: { $regex: `${searchTerm}`, $options: "i" } },
      { amount: { $regex: `${searchTerm}`, $options: "i" } },
      { expenseDate: { $regex: `${searchTerm}`, $options: "i" } },
      { paymentMethod: { $regex: `${searchTerm}`, $options: "i" } },
    ];
  }
  const filterMatch = {};
  if (req.body.filters && req.body.filters.length) {
    await Promise.all(
      req.body.filters.map(async (filter) => {
        // eslint-disable-next-line default-case
        switch (filter.filterOperator) {
          case "greater_than":
            filterMatch[filter.filterName] = {
              $gt: parseFloat(filter.filterValue),
            };
            break;

          case "less_than":
            filterMatch[filter.filterName] = {
              $lt: parseFloat(filter.filterValue),
            };
            break;

          case "equal_to":
            filterMatch[filter.filterName] = {
              $eq: parseFloat(filter.filterValue),
            };
            break;

          case "contains":
            filterMatch[filter.filterName] = {
              $regex: filter.filterValue,
              $options: "i",
            };
            break;

          case "not_equal_to":
            filterMatch[filter.filterName] = {
              $ne: parseFloat(filter.filterValue),
            };
            break;
        }
      })
    );
  }
  const expenseTypes = await ExpenseModel.aggregate([
    {
      $match: match,
    },
    {
      $match: filterMatch,
    },
    {
      $sort: sortObject,
    },
    {
      $facet: {
        data: [
          {
            $skip: skip,
          },
          {
            $limit: limit,
          },
        ],
        pagination: [
          {
            $count: "total",
          },
        ],
      },
    },
  ]);
  const { data, pagination } = expenseTypes[0];

  if (pagination[0]?.total === 0) {
    return next(new ErrorResponse("No Expense Found", 404));
  }
  res.status(200).json(SuccessResponse(data, pagination[0]?.total, "Fetched Successfully"));
});

// READ
exports.read = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const expensetype = await ExpenseModel.findOne({
    _id: id,
  });
  if (expensetype === null) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(expensetype, 1, "Fetched Successfully"));
});

// UPDATE
exports.update = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const expensetype = await ExpenseModel.findOneAndUpdate(
    { _id: id, schoolId: mongoose.Types.ObjectId(req.body.schoolId) },
    req.body
  );
  if (expensetype === null) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(expensetype, 1, "Updated Successfully"));
});

// DELETE
exports.expenseDelete = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const expensetype = await ExpenseModel.findOneAndDelete({
    _id: mongoose.Types.ObjectId(id),
  });
  if (expensetype === null) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(null, 1, "Deleted Successfully"));
});

exports.totalExpenses = catchAsync(async (req, res, next) => {
  const expenseData = await ExpenseModel.aggregate([
    {
      $match: { schoolId: mongoose.Types.ObjectId(req.body.schoolId) },
    },
    {
      $group: {
        _id: "$expenseType",
        data: {
          $push: "$$ROOT",
        },
      },
    },
    {
      $project: {
        _id: 1,
        voucherNumber: 1,
        date: 1,
        paymentMethod: 1,
        totalExpense: {
          $sum: "$data.amount",
        },
      },
    },
    // {
    // 	$group: {
    // 		_id: '$_id',
    // 		data: {
    // 			$push: '$$ROOT',
    // 		},
    // 	},
    // },
    // {
    // 	$project: {
    // 		_id: 1,
    // 		totalExpense: {
    // 			$sum: '$data.totalExpense',
    // 		},
    // 	},
    // },
    {
      $lookup: {
        from: "expensetypes",
        let: {
          expense_id: "$_id",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$expense_id"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              description: 1,
            },
          },
        ],
        as: "_id",
      },
    },
  ]);
  if (expenseData[0] === null) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(expenseData[0], 1, "data fetched Successfully"));
});

exports.expensesList = catchAsync(async (req, res, next) => {
  const {
    schoolId,
    paymentMethod,
    expenseTypeId = null,
    sort,
    date, // single date
    startDate, // date range
    endDate, // date range
    page = 0,
    limit = 10,
    searchTerm,
  } = req.body;
  let match = {};
  if (!schoolId) {
    return next(new ErrorResponse("SchoolId is required", 422));
  }
  match = {
    schoolId: mongoose.Types.ObjectId(req.body.schoolId),
  };
  paymentMethod ? (match.paymentMethod = paymentMethod) : null;

  if (date) {
    const fromDate = moment(date, "DD/MM/YYYY").startOf("day").toDate();
    const tillDate = moment(date, "DD/MM/YYYY").endOf("day").toDate();
    match.expenseDate = { $gte: fromDate, $lte: tillDate };
  }
  if (startDate && endDate) {
    match.expenseDate = {
      $gte: moment(startDate, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(endDate, "DD/MM/YYYY").endOf("day").toDate(),
    };
  }
  if (expenseTypeId) {
    match.expenseType = mongoose.Types.ObjectId(expenseTypeId);
  }

  // check if the search term is having number
  // eslint-disable-next-line no-restricted-globals
  if (searchTerm && !isNaN(searchTerm)) {
    match.amount = +searchTerm;
  } else if (searchTerm) {
    match.$or = [
      { voucherNumber: { $regex: `${searchTerm}`, $options: "i" } },
      { approvedBy: { $regex: `${searchTerm}`, $options: "i" } },
    ];
  }

  const aggregation = [
    {
      $match: match,
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
        from: "expensetypes",
        let: {
          expense_id: "$expenseType",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$expense_id"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              description: 1,
            },
          },
        ],
        as: "expenseType",
      },
    },
    {
      $lookup: {
        from: "schools",
        localField: "schoolId",
        foreignField: "_id",
        as: "school",
      },
    },
    {
      $project: {
        expenseType: {
          $first: "$expenseType",
        },
        reason: 1,
        voucherNumber: 1,
        amount: 1,
        expenseDate: 1,
        paymentMethod: 1,
        schoolId: 1,
        createdBy: 1,
        approvedBy: 1,
        createdAt: 1,
        updatedAt: 1,
        schoolName: {
          $first: "$school.schoolName",
        },
        schoolAddress: {
          $first: "$school.address",
        },
      },
    },
  ];
  if (sort) {
    aggregation[1].$sort = {
      amount: sort,
    };
  }
  const expenseData = await ExpenseModel.aggregate([
    {
      $facet: {
        data: aggregation,
        count: [
          {
            $match: match,
          },
          {
            $count: "count",
          },
        ],
      },
    },
  ]);

  const { data, count } = expenseData[0];
  if (count.length === 0) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});

function getDailyDates(date) {
  let startDate = new Date(date);
  startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1);
  return { startDate, endDate };
}
function getWeekDates(date) {
  let weekStart = new Date(date);
  weekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7);
  let weekEnd = new Date(date);
  weekEnd = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
  return { weekStart, weekEnd };
}
function MonthlyDates(date, prev) {
  let monthStart = new Date(date);
  let monthEnd = new Date(date);
  if (prev) {
    const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
    const prevMonthEnd = new Date(monthEnd.getFullYear(), monthEnd.getMonth() - 1, monthEnd.getDate());
    return { prevMonthStart, prevMonthEnd };
  }
  monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  monthEnd = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1);
  return { monthStart, monthEnd };
}

exports.totalExpenseFilter = catchAsync(async (req, res, next) => {
  const matchFilter = { schoolId: req.body.schoolId };
  const filterType = req.body.filtertype;
  const date = new Date();
  let startDate;
  let endDate;
  if (filterType == "daily") {
    const dates = getDailyDates(date);
    startDate = dates.startDate;
    endDate = dates.endDate;
  } else if (filterType == "weekly") {
    const { weekStart, weekEnd } = getWeekDates(date);
    startDate = weekStart;
    endDate = weekEnd;
  } else if (filterType == "monthly") {
    const prev = false;
    const { monthStart, monthEnd } = MonthlyDates(date, prev);
    startDate = monthStart;
    endDate = monthEnd;
  } else {
    startDate = req.body.startDate;
    endDate = req.body.endDate;
  }

  matchFilter.date = { $gte: startDate, $lte: endDate };

  const expenseData = await ExpenseModel.aggregate([
    {
      $match: matchFilter,
    },
    {
      $group: {
        _id: "$expenseType",
        data: {
          $push: "$$ROOT",
        },
      },
    },
    {
      $project: {
        _id: 1,
        voucherNumber: 1,
        date: 1,
        paymentMethod: 1,
        totalExpense: {
          $sum: "$data.amount",
        },
      },
    },
  ]);
  if (expenseData[0] === null) {
    return next(new ErrorResponse("Expense Not Found", 404));
  }
  res.status(200).json(SuccessResponse(expenseData[0], 1, "Deleted Successfully"));
});

exports.getExcel = catchAsync(async (req, res, next) => {
  const {
    schoolId,
    paymentMethod,
    sort,
    startDate, // date range
    endDate,
  } = req.query;
  let match = {};
  if (!schoolId) {
    return next(new ErrorResponse("schoolId is required", 422));
  }
  match = {
    schoolId: mongoose.Types.ObjectId(schoolId),
  };
  paymentMethod ? (match.paymentMethod = paymentMethod) : null;

  if (startDate && endDate) {
    match.expenseDate = {
      $gte: moment(startDate, "DD/MM/YYYY").startOf("day").toDate(),
      $lte: moment(endDate, "DD/MM/YYYY").endOf("day").toDate(),
    };
  }

  const aggregate = [
    {
      $match: match,
    },
    {
      $sort: {
        expenseDate: -1,
      },
    },
    {
      $lookup: {
        from: "expensetypes",
        localField: "expenseType",
        foreignField: "_id",
        as: "expenseType",
      },
    },
    {
      $addFields: {
        expenseType: {
          $first: "$expenseType.name",
        },
      },
    },
  ];

  if (sort) {
    aggregate[1].$sort = {
      amount: sort === "-1" ? -1 : 1,
    };
  }

  const expenseDetails = await ExpenseModel.aggregate(aggregate);
  const workbook = new excel.Workbook();
  // Add Worksheets to the workbook
  const worksheet = workbook.addWorksheet("Expense Details");
  const style = workbook.createStyle({
    font: {
      bold: true,
      color: "#000000",
      size: 12,
    },
    numberFormat: "$#,##0.00; ($#,##0.00); -",
  });
  worksheet.cell(1, 1).string("Expense Type").style(style);
  worksheet.cell(1, 2).string("Amount").style(style);
  worksheet.cell(1, 3).string("Reason").style(style);
  worksheet.cell(1, 4).string("Voucher Number").style(style);
  worksheet.cell(1, 5).string("Expense Date").style(style);
  worksheet.cell(1, 6).string("Payment Method").style(style);

  expenseDetails.forEach((expense, index) => {
    worksheet.cell(index + 2, 1).string(expense.expenseType);
    worksheet.cell(index + 2, 2).number(expense.amount);

    worksheet.cell(index + 2, 3).string(expense.reason);
    worksheet.cell(index + 2, 4).string(expense.voucherNumber);
    worksheet.cell(index + 2, 5).string(moment(expense.expenseDate).format("DD-MM-YYYY"));
    worksheet.cell(index + 2, 6).string(expense.paymentMethod);
  });

  // workbook.write('expense.xlsx');
  let data = await workbook.writeToBuffer();
  data = data.toJSON().data;

  res.status(200).json(SuccessResponse(data, expenseDetails.length, "Fetched Successfully"));
});

// Define date format constants
const DATE_FORMATS = {
  daily: "DDMMYYYY",
  weekly: "ww",
  monthly: "MM",
};

const RANGE_INTERVALS = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

exports.getNewDashboardData = async (req, res, next) => {
  try {
    const { schoolId, dateRange = null, startDate = null, endDate = null } = req.query;

    let cacheKey = null;
    let dateObj = null;
    let prevDateObj = null;

    // Determine the cache key and date range
    if (dateRange && DATE_FORMATS[dateRange]) {
      const cacheDate = moment().format(DATE_FORMATS[dateRange]);
      cacheKey = `${dateRange}Expense/${schoolId}/${cacheDate}`;
      ({ dateObj, prevDateObj } = getDateRange(startDate, endDate, RANGE_INTERVALS[dateRange]));
    } else {
      dateObj = {
        $gte: getStartDate(startDate),
        $lte: getEndDate(endDate),
      };
    }

    // Fetch data from cache or database
    const expenseData = await fetchDataFromCacheOrDatabase(cacheKey, async () => {
      const totalExpenseAggregation = [
        {
          $match: {
            schoolId: mongoose.Types.ObjectId(schoolId),
            expenseDate: dateObj,
          },
        },
      ];

      if (dateRange === "daily") {
        totalExpenseAggregation.push({
          $group: {
            _id: null,
            totalExpAmount: {
              $sum: "$amount",
            },
            expenseList: {
              $push: {
                expenseDate: "$expenseDate",
                amount: "$amount",
              },
            },
          },
        });
      } else {
        totalExpenseAggregation.push(
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
          }
        );
      }

      const aggregate = [
        {
          $facet: {
            totalExpense: [
              {
                $match: {
                  schoolId: mongoose.Types.ObjectId(schoolId),
                },
              },
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
              {
                $group: {
                  _id: "$schoolId",
                  totalAmount: {
                    $sum: "$totalExpAmount",
                  },
                  maxExpType: {
                    $max: {
                      totalExpAmount: "$totalExpAmount",
                      expenseType: {
                        $first: "$_id",
                      },
                    },
                  },
                  minExpType: {
                    $min: {
                      totalExpAmount: "$totalExpAmount",
                      expenseType: {
                        $first: "$_id",
                      },
                    },
                  },
                },
              },
            ],
            totalExpenseCurrent: totalExpenseAggregation,
          },
        },
      ];
      if (dateRange) {
        aggregate[0].$facet.totalExpensePrev = [
          {
            $match: {
              schoolId: mongoose.Types.ObjectId(schoolId),
              expenseDate: prevDateObj,
            },
          },
          {
            $group: {
              _id: null,
              totalExpAmount: {
                $sum: "$amount",
              },
            },
          },
        ];
      }

      const result = await ExpenseModel.aggregate(aggregate);

      const [{ totalExpense = [], totalExpensePrev = [], totalExpenseCurrent }] = result;

      // Calculate totalExpenseData
      const totalExpenseData = totalExpense[0] || {
        totalAmount: 0,
        maxExpType: {
          totalExpAmount: 0,
          expenseType: null,
        },
        minExpType: {
          totalExpAmount: 0,
          expenseType: null,
        },
      };

      // Calculate totalExpensePrev and totalExpenseAmount
      const totalExpensePrevAmount = totalExpensePrev[0]?.totalExpAmount || 0;
      const totalExpenseCurrentAmount = totalExpenseCurrent[0]?.totalExpAmount || 0;

      // Calculate percentage
      const percentage =
        totalExpensePrevAmount > 0
          ? ((totalExpenseCurrentAmount - totalExpensePrevAmount) / totalExpensePrevAmount) * 100
          : 0;

      // Create finalData object
      const finalData = {
        totalExpense: totalExpenseData,
        totalExpenseCurrent: totalExpenseCurrent[0] || {
          totalExpAmount: 0,
          expenseList: [],
        },
        percentage,
      };

      // Check if expenseData is empty and return an error if it is
      if (!result.length) {
        return null;
      }

      return finalData; // Return the processed data
    });

    if (!expenseData) {
      return next(new ErrorResponse("Expense Not Found", 404));
    }

    res.status(200).json(SuccessResponse(expenseData, 1, "Fetched Successfully"));
  } catch (error) {
    next(error);
  }
};
