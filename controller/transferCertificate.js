const mongoose = require("mongoose");
const express = require("express");

const studentsCollection = mongoose.connection.db.collection("students");
const sectionsCollection = mongoose.connection.db.collection("sections");

const StudentTransfer = require("../models/transferCertificate");
const FeeStructure = require("../models/feeInstallment");
const ErrorResponse = require("../utils/errorResponse");
const tcReasonModal = require("../models/tcReasons");

const SuccessResponse = require("../utils/successResponse");
const { sendNotification } = require("../socket/socket");

async function createStudentTransfer(req, res, next) {
  try {
    const {
      studentId,
      schoolId,
      classId,
      tcType,
      reason,
      comment,
      transferringSchool,
      attachments,
    } = req.body;

    // Check if a student transfer record with the same studentId already exists
    const existingTransfer = await StudentTransfer.findOne({
      studentId,
    }).exec();

    if (existingTransfer) {
      return res.status(400).json({
        success: false,
        message: "A transfer record for this student already exists",
      });
    }

    const feeData = await FeeStructure.aggregate([
      {
        $match: { studentId: mongoose.Types.ObjectId(studentId) },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
        },
      },
    ]).exec();

    console.log(feeData, "feedata");

    const totalFees = feeData.length > 0 ? feeData[0].totalAmount : 0;
    const paidFees = feeData.length > 0 ? feeData[0].paidAmount : 0;
    const pendingFees = totalFees - paidFees;

    if (tcType === "AVAIL-TC" && (!attachments || attachments.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Attachments are required when tcType is AVAIL-TC",
      });
    }

    if (tcType === "ALUMINI-TC" && pendingFees > 0) {
      return res.status(400).json({
        success: false,
        message: "TC cannot be generated due to pending fees",
      });
    }

    const newStudentTransfer = new StudentTransfer({
      studentId,
      schoolId,
      classId,
      tcType,
      reason,
      comment,
      transferringSchool,
      attachments,
    });

    await newStudentTransfer.save();

    const notificationSetup = async () => {
      try {
        // get student data to add to notification
        const student = (
          await mongoose.connection.db
            .collection("students")
            .aggregate([
              { $match: { _id: mongoose.Types.ObjectId(newStudentTransfer.studentId) } },
              {
                $lookup: {
                  from: "studenttransfers",
                  localField: "_id",
                  foreignField: "studentId",
                  as: "tcStatus",
                },
              },
              {
                $lookup: {
                  from: "tcreasons",
                  localField: "tcStatus.reason",
                  foreignField: "_id",
                  as: "reason",
                },
              },
              { $addFields: { tcStatus: { $arrayElemAt: ["$tcStatus.status", 0] } } },
              { $addFields: { reason: { $arrayElemAt: ["$reason.reason", 0] } } },
            ])
            .toArray()
        )?.[0];

        // setup notification
        const notificationData = {
          title: `${student?.name}'s TC ${transfer.status}`,
          description: `Created due to ${student.reason}`,
          type: "TC",
          action: "/transfer-certificates",
          status:
            transfer.status == "REJECTED"
              ? "WARNING"
              : transfer.status == "APPROVED"
              ? "SUCCESS"
              : "DEFAULT",
        };

        // sending notifications
        await sendNotification(transfer.schoolId, "MANAGEMENT", notificationData);
      } catch (error) {
        console.log("NOTIFICATION_ERROR", error);
      }
    };

    notificationSetup();

    res
      .status(200)
      .json(SuccessResponse(newStudentTransfer, 1, "Student transfer record created successfully"));
  } catch (error) {
    console.error("Error creating student transfer record:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

/**
 * This function aggregates and give users list based on search query, With pagination
 * #### INPUTS PARAMS
 * * school = schoolId of students
 * * searchQuery = user name
 * * page = Page number
 * * limit = Limit of data for each page
 * * classId (Optional) = class id of user
 * @param {express.Request} req - Express request object
 * @param {express.Response} res - Express response object
 * @param {express.NextFunction} next - Express NextFunction
 * @returns Users data with pagination
 *
 */
async function searchStudentsWithPagination(req, res, next) {
  try {
    // sets default values
    const defaultPageLimit = 10;
    const defaultPageNumber = 1;

    // collecting nessory data
    const requestData = {
      searchQuery: req.query?.searchQuery?.trim(),
      classId: req.query?.classId?.trim()?.split("_")?.[0],
      className: req.query?.classId?.trim()?.split("_")?.[1],
      page: parseInt(req.query?.page?.trim()) || defaultPageNumber,
      limit: parseInt(req.query?.limit?.trim()) || defaultPageLimit,
      school: req.query?.school?.trim(),
    };

    // creating additonal nessory data
    const regexToSearchStudentName = new RegExp(requestData.searchQuery, "i");
    const pageNumber = requestData.page;
    const pageSize = requestData.limit; // we put it 10 as default
    const skip = (pageNumber - 1) * pageSize;

    const initialFilterQuery = {
      deleted: false,
      school_id: mongoose.Types.ObjectId(requestData.school),
      name: regexToSearchStudentName,
    };

    const filterStudentsByClassName = {};

    if (requestData.classId && requestData.classId != "default") {
      filterStudentsByClassName.class = requestData.className;
      initialFilterQuery.class = mongoose.Types.ObjectId(requestData.classId);
    }

    const result = await studentsCollection
      .aggregate([
        { $match: initialFilterQuery },
        {
          $facet: {
            // First facet: Calculate the totalDocs count
            totalDocs: [
              {
                $group: {
                  _id: null,
                  totalDocs: { $sum: 1 },
                },
              },
              { $project: { _id: 0 } },
            ],
            // Second facet: Fetch student data along with fees
            students: [
              {
                $lookup: {
                  from: "sections",
                  localField: "section",
                  foreignField: "_id",
                  as: "class",
                },
              },
              { $addFields: { class: { $arrayElemAt: ["$class", 0] } } },
              {
                $lookup: {
                  from: "feeinstallments",
                  let: { studentId: "$_id" },
                  as: "fees",
                  pipeline: [
                    {
                      $match: {
                        studentId: "$$studentId",
                      },
                    },
                    {
                      $group: {
                        _id: "totalAmount",
                        totalAmount: { $sum: "$totalAmount" },
                        paidAmount: { $sum: "$paidAmount" },
                      },
                    },
                    { $project: { _id: 0 } },
                  ],
                },
              },
              { $addFields: { fees: { $arrayElemAt: ["$fees", 0] } } },
              {
                $project: {
                  _id: 1,
                  name: 1,
                  class: "$class.className",
                  classId: "$class.class_id",
                  fees: 1,
                },
              },
              { $match: filterStudentsByClassName }, //
              { $skip: skip },
              { $limit: pageSize },
            ],
          },
        },
        { $unwind: "$students" },
        { $addFields: { totalDocs: { $arrayElemAt: ["$totalDocs", 0] } } },
        {
          $project: {
            _id: "$students._id",
            totalDocs: "$totalDocs.totalDocs",
            name: "$students.name",
            className: "$students.class",
            fees: "$students.fees",
            classId: "$students.classId",
          },
        },
      ])
      .toArray();

    res.status(200).json(SuccessResponse(result, 1, "Student details fetch successfully"));
  } catch (error) {
    console.error("Error Student details fetch:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

async function changeStatus(req, res, next) {
  try {
    const transferId = req.params.id;
    const { status } = req.query;

    if (!transferId || !status) {
      return res.status(400).json({ message: "Transfer Id and status are required" });
    }

    const transfer = await StudentTransfer.findById(transferId);

    if (!transfer) {
      return res.status(404).json({ message: "Transfer certificate not found" });
    }

    // Update transfer status
    transfer.status = status;
    await transfer.save();

    const notificationSetup = async () => {
      try {
        // get student data to add to notification
        const student = (
          await mongoose.connection.db
            .collection("students")
            .aggregate([
              { $match: { _id: mongoose.Types.ObjectId(transfer.studentId) } },
              {
                $lookup: {
                  from: "studenttransfers",
                  localField: "_id",
                  foreignField: "studentId",
                  as: "tcStatus",
                },
              },
              {
                $lookup: {
                  from: "tcreasons",
                  localField: "tcStatus.reason",
                  foreignField: "_id",
                  as: "reason",
                },
              },
              { $addFields: { tcStatus: { $arrayElemAt: ["$tcStatus.status", 0] } } },
              { $addFields: { reason: { $arrayElemAt: ["$reason.reason", 0] } } },
            ])
            .toArray()
        )?.[0];

        // setup notification
        const notificationData = {
          title: `${student?.name}'s TC ${transfer.status}`,
          description: `Created due to ${student.reason}`,
          type: "TC",
          action: "/transfer-certificates",
          status:
            transfer.status == "REJECTED"
              ? "WARNING"
              : transfer.status == "APPROVED"
              ? "SUCCESS"
              : "DEFAULT",
        };

        // sending notifications
        await sendNotification(transfer.schoolId, "ADMIN", notificationData);
      } catch (error) {
        console.log("NOTIFICATION_ERROR", error);
      }
    };

    notificationSetup();

    res
      .status(200)
      .json(SuccessResponse(null, 1, "Transfer certificate status updated successfully"));
  } catch (error) {
    console.error("Error on update status:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

async function getStudentIdByName(name) {
  const regexName = new RegExp(name, "i");
  const student = await studentsCollection.find({ name: regexName }).toArray();
  if (student.length === 0) {
    return null;
  }
  return student;
}

async function getTc(req, res, next) {
  try {
    const { searchQuery, classes, tcType, tcStatus } = req.query;
    const query = {};
    let stdIds = null;
    if (searchQuery) {
      stdIds = await getStudentIdByName(searchQuery);
    }
    if (stdIds) {
      query.studentId = { $in: stdIds };
    }
    if (classes) {
      query.classId = mongoose.Types.ObjectId(classes);
    }

    if (tcType) {
      query.tcType = tcType;
    }

    if (tcStatus) {
      query.status = tcStatus;
    }

    const result = await StudentTransfer.find(query).exec();

    res
      .status(200)
      .json(SuccessResponse(result, 1, "Transfer certificate status updated successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

async function getTcDetails(req, res, next) {
  try {
    const schoolId = req.params.id;
    const tcsCount = await StudentTransfer.countDocuments();

    const tsData = await StudentTransfer.aggregate([
      {
        $match: {
          schoolId: mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $facet: {
          // First Facet : get different types of tc's and its count
          countsByType: [
            {
              $group: {
                _id: "$tcType",
                total: { $sum: 1 },
                pending: {
                  $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
                },
                approved: {
                  $sum: { $cond: [{ $eq: ["$status", "APPROVED"] }, 1, 0] },
                },
                rejected: {
                  $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] },
                },
              },
            },
            {
              $group: {
                _id: null,
                typeResult: {
                  $push: {
                    tcType: "$_id",
                    total: "$total",
                    pending: "$pending",
                    approved: "$approved",
                    rejected: "$rejected",
                  },
                },
              },
            },
            { $project: { _id: 0, typeResult: 1 } },
          ],
          // Second Facet : get different types of reasons and its count
          reasons: [
            {
              $lookup: {
                from: "tcreasons",
                localField: "reason",
                foreignField: "_id",
                as: "reason",
              },
            },
            { $addFields: { reason: { $arrayElemAt: ["$reason.reason", 0] } } },
            { $group: { _id: "$reason", count: { $sum: 1 } } },
            {
              $group: {
                _id: null,
                reasonResult: {
                  $push: { reason: "$_id", count: "$count" },
                },
              },
            },
            { $project: { _id: 0, reasonResult: 1 } },
          ],
          // Third Facet : get different types of classes and its count
          class: [
            {
              $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "associatedStudent",
              },
            },
            { $unwind: "$associatedStudent" },
            {
              $lookup: {
                from: "sections",
                localField: "associatedStudent.section",
                foreignField: "_id",
                as: "associatedSection",
              },
            },
            { $unwind: "$associatedSection" },
            {
              $group: {
                _id: "$associatedSection.className",
                count: { $sum: 1 },
              },
            },
            {
              $group: {
                _id: null,
                classResult: {
                  $addToSet: {
                    className: "$_id",
                    count: "$count",
                  },
                },
              },
            },
            { $project: { _id: 0, classResult: 1 } },
          ],
          // unique class count
          classCount: [
            {
              $group: {
                _id: "$classId",
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
            { $project: { _id: 0, count: 1 } },
          ],

          // unique reason count
          reasonsCount: [
            { $group: { _id: "$reason" } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                count: 1,
              },
            },
          ],
        },
      },
    ]);

    const countsByType = tsData[0].countsByType[0];
    const reasonsData = tsData[0].reasons[0];
    const classData = tsData[0].class[0];
    const reasonCount = tsData[0].reasonsCount[0]?.count || 0;
    const classCount = tsData[0].classCount[0]?.count || 0;

    res.status(200).json(
      SuccessResponse(
        {
          countsByType,
          reasonsData,
          classData,
          tcsCount,
          classCount,
          reasonCount,
        },
        1,
        "Student transfer record send successfully"
      )
    );
  } catch (error) {
    console.error("Error creating student transfer record:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

async function getClasses(req, res, next) {
  try {
    const classList = await sectionsCollection
      .aggregate([
        {
          $project: {
            class_id: 1,
            className: 1,
          },
        },
      ])
      .toArray();

    if (classList.length === 0) {
      return res.status(404).json({ message: "No classes found" });
    }

    res.status(200).json(SuccessResponse(classList, 1, "Classes details fetch successfully"));
  } catch (error) {
    console.error("Error fetching classes list:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

async function getTcStudentsDetails(req, res, next) {
  try {
    const { searchQuery, tcType, status, classId, page, limit, hideMessage, studentTcId } =
      req.query;

    const { schoolId } = req.body;

    // Ensure searchQuery is not empty before creating the regex
    const regexName = searchQuery ? new RegExp(searchQuery, "i") : /.*/;
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * pageSize;

    const query = {};

    const classMatchQuery = {
      $match: {},
    };

    if (status) {
      query.status = status;
    }

    if (tcType) {
      query.tcType = tcType;
    }

    if (classId && classId?.trim() != "default") {
      classMatchQuery.$match = { classes: classId?.trim().split("_")?.[1] };
      query.classId = mongoose.Types.ObjectId(classId?.trim().split("_")?.[0]);
    }

    if (studentTcId) {
      query._id = mongoose.Types.ObjectId(studentTcId);
    }

    const result = await StudentTransfer.aggregate([
      { $match: query },
      { $sort: { createdAt: 1, updatedAt: 1 } },
      {
        $facet: {
          totalDocs: [{ $group: { _id: null, totalDocs: { $sum: 1 } } }, { $project: { _id: 0 } }],
          students: [
            {
              $lookup: {
                from: "students",
                localField: "studentId",
                foreignField: "_id",
                as: "studentslist",
              },
            },
            { $unwind: "$studentslist" },
            { $match: { "studentslist.name": regexName } },
            { $sort: { "studentslist.name": 1 } },
            {
              $lookup: {
                from: "schools",
                localField: "schoolId",
                foreignField: "_id",
                as: "schoolname",
              },
            },
            { $unwind: "$schoolname" },
            {
              $lookup: {
                from: "sections",
                let: { classId: "$classId" }, // Store the value of classId in a variable
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$class_id", "$$classId"], // Use the variable in the $eq expression
                      },
                    },
                  },
                ],
                as: "classes",
              },
            },
            { $unwind: "$classes" },
            {
              $lookup: {
                from: "feeinstallments",
                localField: "studentId",
                foreignField: "studentId",
                as: "fees",
                pipeline: [
                  {
                    $group: {
                      _id: "totalAmount",
                      totalAmount: { $sum: "$totalAmount" },
                      paidAmount: { $sum: "$paidAmount" },
                    },
                  },
                  { $project: { _id: 0 } },
                ],
              },
            },
            { $addFields: { fees: { $arrayElemAt: ["$fees", 0] } } },
            {
              $group: {
                _id: "$_id",
                tcType: { $first: "$tcType" },
                reason: { $first: "$reason" },
                comment: { $first: "comment" },
                status: { $first: "$status" },
                studentslist: { $first: "$studentslist.name" },
                schoolname: { $first: "$schoolname.schoolName" },
                classes: { $first: "$classes.className" },
                totalAmount: { $first: "$fees.totalAmount" },
                paidAmount: { $first: "$fees.paidAmount" },
                attachments: { $first: "$attachments" },
              },
            },
            {
              $lookup: {
                from: "tcreasons",
                localField: "reason",
                foreignField: "_id",
                as: "reason",
              },
            },
            { $addFields: { reason: { $arrayElemAt: ["$reason.reason", 0] } } },
            {
              $project: {
                _id: 1,
                tcType: 1,
                reason: 1,
                comment: 1,
                status: 1,
                studentslist: 1,
                schoolname: 1,
                classes: 1,
                totalAmount: { $round: ["$totalAmount", 2] },
                paidAmount: { $round: ["$paidAmount", 2] },
                pendingAmount: {
                  $round: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 2],
                },
                attachments: 1,
              },
            },
            classMatchQuery,
          ],
        },
      },
      { $unwind: "$students" },
      {
        $addFields: {
          totalDocs: { $arrayElemAt: ["$totalDocs.totalDocs", 0] },
        },
      },
      {
        $project: {
          _id: "$students._id",
          totalDocs: 1,
          tcType: "$students.tcType",
          reason: "$students.reason",
          status: "$students.status",
          comment: "$students.comment",
          studentslist: "$students.studentslist",
          schoolname: "$students.schoolname",
          classes: "$students.classes",
          totalAmount: "$students.totalAmount",
          paidAmount: "$students.paidAmount",
          pendingAmount: "$students.pendingAmount",
          attachments: "$students.attachments",
        },
      },
      { $sort: { studentslist: 1 } },
      { $skip: skip },
      { $limit: pageSize },
    ]).exec();

    res
      .status(200)
      .json(SuccessResponse(result, 1, hideMessage ? null : "Student details fetch successfully"));
  } catch (error) {
    console.error("Error Student details fetch:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
}

/**
 *
 * For getting all TcReasons.
 */
const getTcReason = async (req, res, next) => {
  const { page, limit, schoolId } = req.query;
  if (!schoolId?.trim()) {
    return next(new ErrorResponse(`School Id is required`, 403));
  }
  try {
    const pageNumber = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 10;
    const skip = (pageNumber - 1) * pageSize;
    const totalCount = tcReasonModal.find({ schoolId }).count();
    const result = tcReasonModal.find({ schoolId }, "reason").skip(skip).limit(pageSize);
    Promise.all([totalCount, result])
      .then(([count, result1]) => {
        res
          .status(200)
          .json(
            SuccessResponse(
              { reasons: result1, totalCount: count },
              result1?.length,
              "Tc reasons fetched successfully"
            )
          );
      })
      .catch((err) => {
        console.log("Error while fetching tc reason", err);
        next(new ErrorResponse("Something went wrong", 500));
      });
  } catch (error) {
    console.log("Error while fetching tc reason", error);
    next(new ErrorResponse("Something went wrong", 500));
  }
};

/**
 *
 * For add new TcReason.
 */
const addTcReason = async (req, res, next) => {
  const { reason: reasonInput, schoolId } = req.body;
  try {
    if (!schoolId?.trim()) {
      return next(new ErrorResponse(`School Id is required`, 403));
    }
    const reason = reasonInput?.trim()?.toLowerCase();
    if (!reason) {
      return next(new ErrorResponse(`reason is required`, 403));
    }
    const existingReason = await tcReasonModal.findOne({ reason, schoolId });
    if (existingReason) return next(new ErrorResponse("Reason already exists", 403));
    const result = await tcReasonModal.create({ reason, schoolId });
    res.status(200).json(SuccessResponse(result, 1, "Tc reason created successfully"));
  } catch (error) {
    console.log("Error while creating tc reason", error);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

async function deleteTcReason(req, res, next) {
  const { id: idInput } = req.query;
  const { school_id: schoolId } = req?.user;
  try {
    const id = idInput?.trim();
    if (!schoolId?.trim()) {
      return next(new ErrorResponse(`School Id is required`, 403));
    }
    if (!id) {
      return next(new ErrorResponse("Reason Id required!", 403));
    }
    const result = await tcReasonModal.findByIdAndDelete({ id, schoolId });
    if (!result) {
      return next(new ErrorResponse("No matching document found for deletion", 404));
    }
    res.status(200).json(SuccessResponse("Tc reason deleted successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something went wrong", 500));
  }
}

/**
 *
 * For update TcReason.
 */
async function updateTcReason(req, res, next) {
  const { id: idInput, reason: reasonInput } = req.body;
  const { school_id: schoolId } = req?.user;
  if (!schoolId?.trim()) {
    return next(new ErrorResponse(`School Id is required`, 403));
  }

  if (!reasonInput?.trim()) {
    return next(new ErrorResponse("reason required!", 403));
  }
  try {
    const id = idInput?.trim();
    if (!id) {
      return next(new ErrorResponse("Reason Id required!", 403));
    }
    const reason = reasonInput?.trim().toLowerCase();
    const existingReason = await tcReasonModal.findOne({ reason, schoolId });
    if (existingReason) return next(new ErrorResponse("This reason name already exists", 403));
    const result = await tcReasonModal.findByIdAndUpdate(id, { $set: { reason } }, { new: true });
    res.status(200).json(SuccessResponse(result, 1, "Tc reasons updated successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something went wrong", 500));
  }
}

module.exports = {
  createStudentTransfer,
  searchStudentsWithPagination,
  changeStatus,
  getTc,
  getTcDetails,
  getClasses,
  getTcStudentsDetails,
  addTcReason,
  getTcReason,
  updateTcReason,
  deleteTcReason,
};
