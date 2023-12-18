const mongoose = require("mongoose");
const ErrorResponse = require("../utils/errorResponse");
const SuccessResponse = require("../utils/successResponse");
const DailyCloseCollection = require("../models/dailyCloseCollection");
const FeeReceipt = require("../models/feeReceipt");
const Expense = require("../models/expense");
const { sendNotification } = require("../socket/socket");

const generateDailyCloseCollection = async (req, res, next) => {
  try {
    const { schoolId, name, bankName, cashAmount, expenseAmount, date, attachments, reason } = req.body;

    // Check if name and bankName are provided
    if (!name || !bankName) {
      return next(new ErrorResponse("Name and bankName are required", 400));
    }

    // Check if cashAmount is not zero
    if (expenseAmount && cashAmount <= 0) {
      return next(new ErrorResponse("Cash Amount cannot be zero or less", 400));
    }

    // Check if expense Amount is not less than zero
    if (expenseAmount && expenseAmount < 0) {
      return next(new ErrorResponse("Expense Amount cannot be less than 0", 400));
    }

    // Parse the date parameter into a Date object
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const income = await FeeReceipt.aggregate([
      {
        $match: {
          $and: [{ createdAt: { $gte: startDate } }, { createdAt: { $lt: endDate } }],
          "school.schoolId": mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $facet: {
          totalPaidAmount: [{ $group: { _id: null, totalAmount: { $sum: "$paidAmount" } } }],
          totalAmountInCash: [
            { $match: { "payment.method": "CASH" } },
            { $group: { _id: null, totalAmount: { $sum: "$paidAmount" } } },
          ],
        },
      },
      {
        $project: {
          totalPaidAmount: {
            $arrayElemAt: ["$totalPaidAmount.totalAmount", 0],
          },
          totalAmountInCash: {
            $arrayElemAt: ["$totalAmountInCash.totalAmount", 0],
          },
          expenseInCash: 1,
        },
      },
    ]);

    const expenseInCash = await Expense.aggregate([
      {
        $match: {
          $and: [{ createdAt: { $gte: startDate } }, { createdAt: { $lt: endDate } }],
          schoolId: mongoose.Types.ObjectId(schoolId),
          paymentMethod: "CASH",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const closedAmounts = await DailyCloseCollection.aggregate([
      {
        $match: {
          $and: [{ date: { $gte: startDate } }, { date: { $lt: endDate } }],
          schoolId: mongoose.Types.ObjectId(schoolId),
          status: { $in: ["APPROVED", "PENDING"] },
        },
      },
      {
        $group: {
          _id: null,
          cashAmount: { $sum: "$cashAmount" },
          expenseAmount: { $sum: "$expenseAmount" },
        },
      },
      { $project: { _id: 0 } },
    ]);

    const response = {
      closedAmounts: {
        cashAmount: closedAmounts?.[0]?.cashAmount || 0,
        expenseAmount: closedAmounts?.[0]?.expenseAmount || 0,
      },
      income: {
        totalPaidAmount: income?.[0]?.totalPaidAmount || 0,
        totalAmountInCash: income?.[0]?.totalAmountInCash || 0,
      },
      expense: {
        expenseInCash: expenseInCash?.[0]?.totalAmount || 0,
      },
      toCloseAmounts: {
        totalAmountInCash: income?.[0]?.totalAmountInCash - (closedAmounts?.[0]?.cashAmount || 0) || 0,
        totalExpenseInCash: expenseInCash?.[0]?.totalAmount - (closedAmounts?.[0]?.expenseAmount || 0) || 0,
      },
    };

    if (response.toCloseAmounts.totalAmountInCash < Number(cashAmount)) {
      return next(new ErrorResponse("Cash amount cannont be grater than total collected cash amount", 400));
    }

    if (response.toCloseAmounts.totalExpenseInCash < Number(expenseAmount)) {
      return next(new ErrorResponse("Expense amount cannont be grater than total collected expense amount", 400));
    }

    // Create a new DailyCloseCollection document
    const newDailyClose = new DailyCloseCollection({
      schoolId,
      name,
      bankName,
      cashAmount,
      expenseAmount,
      date,
      attachments,
      reason,
    });

    await newDailyClose.save();

    const notificationSetup = async () => {
      try {
        // setup notification
        const notificationData = {
          title: `Pending approvement - ${newDailyClose?.name} is depositing today`,
          description: `₹${Number(newDailyClose.expenseAmount).toFixed(2)} as expence and ₹${Number(
            newDailyClose?.cashAmount
          )?.toFixed(2)} as cash in ${newDailyClose?.bankName} Bank`,
          type: "PAYMENT",
          action: "/",
          status: "DEFAULT",
        };

        // sending notifications
        await sendNotification(newDailyClose.schoolId, "MANAGEMENT", notificationData);
      } catch (error) {
        console.log("NOTIFICATION_ERROR", error);
      }
    };

    notificationSetup();

    res.status(200).json(SuccessResponse(newDailyClose, 1, "Daily Close Collection record created successfully"));
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getCollectionDetails = async (req, res, next) => {
  try {
    const { searchQuery, date, page, limit, schoolId } = req.query;

    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 5;
    const skip = (pageNumber - 1) * pageSize;

    const filter = {
      schoolId: mongoose.Types.ObjectId(schoolId),
    };

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      filter.date = { $gte: startDate, $lt: endDate };
    }

    const regexCondition = {
      $or: [{ name: { $regex: searchQuery, $options: "i" } }, { bankName: { $regex: searchQuery, $options: "i" } }],
    };

    const amountQuery = parseFloat(searchQuery);
    if (!isNaN(amountQuery)) {
      regexCondition.$or.push({ cashAmount: amountQuery });
    }

    filter.$and = [regexCondition];

    const collectionDetails = await DailyCloseCollection.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec();

    const totalDocuments = await DailyCloseCollection.countDocuments(filter);

    res.status(200).json({
      data: collectionDetails,
      page: pageNumber,
      limit: pageSize,
      total: totalDocuments,
    });
  } catch (error) {
    console.error(error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const dailyTotalFeeCollection = async (req, res, next) => {
  try {
    const { date, schoolId } = req.query;

    // check date is not invalid
    if (!date || isNaN(Date.parse(date))) {
      return res.status(400).json({ error: "Invalid or missing date parameter." });
    }

    // Parse the date parameter into a Date object
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    const income = await FeeReceipt.aggregate([
      {
        $match: {
          $and: [{ createdAt: { $gte: startDate } }, { createdAt: { $lt: endDate } }],
          status: {
            $in: ["APPROVED", "REQUESTED", "REJECTED"],
          },
          "school.schoolId": mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $facet: {
          totalPaidAmount: [{ $group: { _id: null, totalAmount: { $sum: "$paidAmount" } } }],
          totalAmountInCash: [
            { $match: { "payment.method": "CASH" } },
            { $group: { _id: null, totalAmount: { $sum: "$paidAmount" } } },
          ],
        },
      },
      {
        $project: {
          totalPaidAmount: {
            $arrayElemAt: ["$totalPaidAmount.totalAmount", 0],
          },
          totalAmountInCash: {
            $arrayElemAt: ["$totalAmountInCash.totalAmount", 0],
          },
          expenseInCash: 1,
        },
      },
    ]);

    const expenseInCash = await Expense.aggregate([
      {
        $match: {
          $and: [{ createdAt: { $gte: startDate } }, { createdAt: { $lt: endDate } }],
          schoolId: mongoose.Types.ObjectId(schoolId),
          paymentMethod: "CASH",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const closedAmounts = await DailyCloseCollection.aggregate([
      {
        $match: {
          $and: [{ date: { $gte: startDate } }, { date: { $lt: endDate } }],
          schoolId: mongoose.Types.ObjectId(schoolId),
          status: { $in: ["APPROVED", "PENDING"] },
        },
      },
      {
        $group: {
          _id: null,
          cashAmount: { $sum: "$cashAmount" },
          expenseAmount: { $sum: "$expenseAmount" },
        },
      },
      { $project: { _id: 0 } },
    ]);

    const response = {
      closedAmounts: {
        cashAmount: closedAmounts?.[0]?.cashAmount || 0,
        expenseAmount: closedAmounts?.[0]?.expenseAmount || 0,
      },
      income: {
        totalPaidAmount: income?.[0]?.totalPaidAmount || 0,
        totalAmountInCash: income?.[0]?.totalAmountInCash || 0,
      },
      expense: {
        expenseInCash: expenseInCash?.[0]?.totalAmount || 0,
      },
      toCloseAmounts: {
        totalAmountInCash: income?.[0]?.totalAmountInCash - (closedAmounts?.[0]?.cashAmount || 0) || 0,
        totalExpenseInCash: expenseInCash?.[0]?.totalAmount - (closedAmounts?.[0]?.expenseAmount || 0) || 0,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error(error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const updateCloseCollectionStatus = async (req, res, next) => {
  try {
    const { closeCollecionId, reason, attachments, status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    if (status === "REJECTED" && !reason && !attachments && reason === "" && attachments.length === 0) {
      return res.status(400).json({
        error: "Either Reason or Attachments is required for rejecting",
      });
    }

    const updatedData = await DailyCloseCollection.findByIdAndUpdate(
      closeCollecionId,
      {
        $set: {
          status,
          reason: status === "REJECTED" ? reason : "",
          attachments: status === "REJECTED" ? attachments : [],
        },
      },
      { new: true }
    );

    if (!updatedData) {
      return res.status(500).json({ error: "Something went wrong while updating the document" });
    }

    const notificationSetup = async () => {
      try {
        // setup notification
        const notificationData = {
          title: `${status} - ${updatedData?.name}'s deposit`,
          description: `₹${Number(updatedData.expenseAmount).toFixed(2)} as expence and ₹${Number(
            updatedData?.cashAmount
          )?.toFixed(2)} as cash in ${updatedData?.bankName} Bank`,
          type: "PAYMENT",
          action: "/",
          status: status === "REJECTED" ? "ERROR" : "SUCCESS",
        };

        // sending notifications
        await sendNotification(updatedData.schoolId, "ADMIN", notificationData);
      } catch (error) {
        console.log("NOTIFICATION_ERROR", error);
      }
    };

    notificationSetup();

    res.status(200).json(SuccessResponse(null, 1, "Daily close collection status updated successfully"));
  } catch (error) {
    console.error(error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const updateEditStatus = async (req, res, next) => {
  try {
    const { db } = mongoose.connection;
    const { schoolId, status } = req.query;

    await db.collection("schools").updateOne(
      { _id: mongoose.Types.ObjectId(schoolId) },
      {
        $set: {
          "permissions.finance.allowEdit": status == "true",
        },
      }
    );

    return res.status(200).json(SuccessResponse(null, 1, "Daily close collection edit status updated successfully"));
  } catch (error) {
    console.error(error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getEditStatus = async (req, res, next) => {
  try {
    const { db } = mongoose.connection;
    const { schoolId } = req.query;
    const data = await db.collection("schools").findOne({ _id: mongoose.Types.ObjectId(schoolId) });
    return res
      .status(200)
      .json(
        SuccessResponse(
          { allowEdit: data?.permissions?.finance?.allowEdit == true },
          1,
          "Daily close collection edit status updated successfully"
        )
      );
  } catch (error) {
    console.error(error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

module.exports = {
  generateDailyCloseCollection,
  getCollectionDetails,
  dailyTotalFeeCollection,
  updateCloseCollectionStatus,
  updateEditStatus,
  getEditStatus,
};
