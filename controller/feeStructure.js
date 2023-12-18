const mongoose = require("mongoose");
const { runChildProcess, runPipedProcesses } = require("../helpers/process");
const FeeStructure = require("../models/feeStructure");
const ErrorResponse = require("../utils/errorResponse");
const FeeInstallment = require("../models/feeInstallment");
const catchAsync = require("../utils/catchAsync");
const FeeType = require("../models/feeType");
const SuccessResponse = require("../utils/successResponse");
const feeInstallment = require("../models/feeInstallment");
const SectionDiscount = require("../models/sectionDiscount");
const DiscountStructure = require("../models/discountStructure");

const Sections = mongoose.connection.db.collection("sections");
const Students = mongoose.connection.db.collection("students");

// CREATE
exports.create = async (req, res, next) => {
  let {
    feeStructureName,
    schoolId,
    classes = [],
    description = "",
    feeDetails = [],
    studentList = [],
    categoryId,
    totalAmount,
    academicYearId,
  } = req.body;
  let sectionList = null;

  if (
    !feeStructureName ||
    !classes ||
    !feeDetails ||
    !totalAmount ||
    !schoolId ||
    !categoryId ||
    !studentList ||
    !academicYearId
  ) {
    return next(new ErrorResponse("Please Provide All Required Fields", 422));
  }
  const isExist = await FeeStructure.findOne({
    feeStructureName,
    schoolId,
    categoryId,
  });

  if (isExist) {
    return next(new ErrorResponse("Fee Structure With This Name Already Exists", 400));
  }

  if (typeof classes[0] === "string" && typeof feeDetails[0] === "string") {
    classes = classes.map(JSON.parse);
    feeDetails = feeDetails.map(JSON.parse);
  }

  // TODO: add validation if structure name already exists

  try {
    const id = mongoose.Types.ObjectId();
    // Attempt to create the fee structure.
    const feeStructure = await FeeStructure.findOneAndUpdate(
      { _id: id },
      {
        feeStructureName,
        schoolId,
        classes,
        categoryId,
        description,
        feeDetails,
        totalAmount: Number(totalAmount),
        academicYearId,
      },
      { upsert: true, new: true }
    )
      .populate("feeDetails.feeTypeId", "feeType")
      .lean();

    studentList = studentList.filter((s) => s.isSelected === true);

    sectionList = classes.map((c) => mongoose.Types.ObjectId(c.sectionId));
    await Sections.updateMany(
      {
        _id: { $in: sectionList },
      },
      {
        $addToSet: {
          feeStructureIds: feeStructure._id,
        },
      },
      {
        multi: true,
      }
    );

    // Extract the section IDs from the classes array.
    await runChildProcess(
      feeStructure.feeDetails,
      studentList,
      feeStructure._id,
      schoolId,
      academicYearId,
      categoryId,
      true
    );

    const studIds = studentList.map((stud) => mongoose.Types.ObjectId(stud._id));

    await Students.updateMany(
      {
        _id: {
          $in: studIds,
        },
      },
      {
        $addToSet: {
          feeCategoryIds: mongoose.Types.ObjectId(categoryId),
        },
      }
    );

    res.status(201).json(SuccessResponse(feeStructure, 1, "Created Successfully"));
  } catch (err) {
    console.log("error while creating", err.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

// READ
exports.read = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { school_id: schoolId } = req.user;
  let updatedStudents = [];
  const feeStructure = await FeeStructure.findOne({
    _id: id,
  })
    .populate("academicYearId", "name")
    .lean();
  const { categoryId, classes } = feeStructure;
  if (!feeStructure) {
    return next(new ErrorResponse("Fee Structure Not Found", 404));
  }

  const sectionList = classes.map((c) => mongoose.Types.ObjectId(c.sectionId));
  const projection = {
    _id: 1,
    name: 1,
    profile_image: 1,
    section: 1,
    gender: 1,
  };

  const query = {
    section: { $in: sectionList },
    deleted: false,
    profileStatus: "APPROVED",
  };
  const feeAggregate = [
    {
      $match: {
        sectionId: {
          $in: sectionList,
        },
        schoolId: mongoose.Types.ObjectId(schoolId),
        categoryId: mongoose.Types.ObjectId(categoryId),
      },
    },
    {
      $group: {
        _id: "$studentId",
        feeStructureId: {
          $first: "$feeStructureId",
        },
        installments: { $push: "$$ROOT" },
      },
    },
  ];

  const [students, feeInstallments] = await Promise.all([
    Students.find(query).project(projection).toArray(),
    FeeInstallment.aggregate(feeAggregate),
  ]);

  if (students.length) {
    const installmentObj = feeInstallments.reduce((acc, curr) => {
      acc[curr._id] = curr.installments;
      return acc;
    }, {});
    updatedStudents = students.reduce((acc, curr) => {
      const { _id } = curr;
      const foundInstallment = installmentObj[_id];
      const hasInstallment = Boolean(foundInstallment);
      const hasMatchingFeeStructure = hasInstallment && foundInstallment[0].feeStructureId.toString() === id.toString();
      const hasPaidInstallment =
        hasInstallment &&
        foundInstallment.some((installment) => installment.status === "Paid" || installment.status === "Late");

      if (!hasInstallment || hasMatchingFeeStructure) {
        curr.isSelected = hasMatchingFeeStructure;
        if (hasMatchingFeeStructure) {
          curr.isPaid = hasPaidInstallment;
        }
        acc.push(curr);
      }

      return acc;
    }, []);
  }

  feeStructure.studentList = updatedStudents;
  res.status(200).json(SuccessResponse(feeStructure, 1, "Fetched Successfully"));
});



exports.updatedFeeStructure = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { studentList, feeStructureName, classes, feeDetails, ...rest } = req.body;
    const studMappedList = [];
    const unMapStudList = [];

    const { studentsToUpdate, studentsToRemove } = studentList.reduce(
      (acc, student) => {
        const { isNew, isRemoved } = student;
        if (isNew) {
          acc.studentsToUpdate.push(student);
          studMappedList.push(mongoose.Types.ObjectId(student._id));
        } else if (isRemoved) {
          acc.studentsToRemove.push(student);
          unMapStudList.push(mongoose.Types.ObjectId(student._id));
        }
        return acc;
      },
      {
        studentsToUpdate: [],
        studentsToRemove: [],
      }
    );

    if (rest.isRowAdded) {
      feeDetails = feeDetails.map((fee) => ({
        ...fee,
        _id: fee._id ?? mongoose.Types.ObjectId(),
      }));

      const newRows = feeDetails.filter((fee) => fee.isNewFieldinEdit);

      const studAggregate = [
        {
          $match: { feeStructureId: mongoose.Types.ObjectId(id) },
        },
        {
          $group: {
            _id: "$studentId",
            section: { $first: "$sectionId" },
            gender: { $first: "$gender" },
          },
        },
      ];
      // remove the students who are in unMapStudList array
      if (unMapStudList.length > 0) studAggregate[0].$match.studentId = { $nin: unMapStudList };

      const existingStudents = await FeeInstallment.aggregate(studAggregate);

      // make payload 1
      if (studentsToUpdate.length)
        await runPipedProcesses(
          [newRows, feeDetails],
          [existingStudents, studentsToUpdate],
          id,
          rest.schoolId,
          rest.academicYearId,
          rest.categoryId
        );
      else
        await runChildProcess(newRows, existingStudents, id, rest.schoolId, rest.academicYearId, rest.categoryId, true);
    }

    const updatedDocs = await FeeStructure.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          feeStructureName,
          classes,
          feeDetails,
          ...rest,
        },
      }
    );

    if (studentsToRemove.length > 0 || studentsToUpdate.length > 0) {
      // Use bulkWrite for better performance by combining update and delete operations
      const bulkOperations = [];
      const promises = [];

      // Update students in studMappedList and add the feeCategoryIds
      if (studMappedList.length > 0) {
        bulkOperations.push({
          updateMany: {
            filter: { _id: { $in: studMappedList } },
            update: {
              $addToSet: {
                feeCategoryIds: mongoose.Types.ObjectId(rest.categoryId),
              },
            },
          },
        });
      }

      // Update students in unMapStudList and pull the feeCategoryIds
      if (unMapStudList.length > 0) {
        bulkOperations.push({
          updateMany: {
            filter: { _id: { $in: unMapStudList } },
            update: {
              $pull: {
                feeCategoryIds: mongoose.Types.ObjectId(rest.categoryId),
              },
            },
          },
        });

        // Delete feeInstallments for students in unMapStudList
        promises.push(
          FeeInstallment.deleteMany({
            studentId: { $in: unMapStudList },
            feeStructureId: id,
          })
        );
      }

      promises.push(Students.bulkWrite(bulkOperations));

      if (!rest.isRowAdded)
        promises.push(
          runChildProcess(feeDetails, studentsToUpdate, id, rest.schoolId, rest.academicYearId, rest.categoryId, true)
        );

      // Use Promise.allSettled to handle both successful and rejected promises
      await Promise.allSettled(promises);
    }

    res.status(200).json(SuccessResponse(updatedDocs, updatedDocs.modifiedCount, "Updated SuccessFully"));
  } catch (err) {
    console.log("Error While Updating", err.message, err.stack);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

exports.getStudentsBySection = catchAsync(async (req, res, next) => {
  const { id, sectionId } = req.params;
  const { discountId } = req.query;
  const { page = 0, limit = 5, searchTerm = null } = req.query;
  let studentIds = null;

  const match = {
    feeStructureId: mongoose.Types.ObjectId(id),
    sectionId: mongoose.Types.ObjectId(sectionId),
  };

  if (searchTerm) {
    const searchQuery = {
      name: { $regex: searchTerm, $options: "i" },
      section: mongoose.Types.ObjectId(sectionId),
      deleted: false,
      profileStatus: "APPROVED",
    };
    studentIds = await Students.distinct("_id", searchQuery);
    match.studentId = {
      $in: studentIds,
    };
  }

  const aggregate = [
    {
      $match: match,
    },
    {
      $group: {
        _id: "$studentId",
        totalFees: {
          $sum: "$totalAmount",
        },
        netFees: {
          $sum: "$netAmount",
        },
        totalDiscountAmount: {
          $sum: "$totalDiscountAmount",
        },
        paidAmount: {
          $sum: "$paidAmount",
        },
        feeDetails: {
          $push: {
            feeType: "$feeType",
            totalFees: "$totalAmount",
            netAmount: "$netAmount",
            paidAmount: "$paidAmount",
            totalDiscountAmount: "$totalDiscountAmount",
          },
        },
      },
    },
    {
      $skip: +page * +limit,
    },
    {
      $limit: +limit,
    },
    {
      $lookup: {
        from: "students",
        localField: "_id",
        foreignField: "_id",
        as: "studentData",
      },
    },
    {
      $unwind: "$studentData",
    },
    {
      $project: {
        _id: 0,
        studentId: "$_id",
        studentName: "$studentData.name",
        totalFees: 1,
        netFees: 1,
        totalDiscountAmount: 1,
        paidAmount: 1,
        feeDetails: 1,
      },
    },
  ];

  const studentList = await feeInstallment.aggregate(aggregate);

  if (!studentList.length) {
    return next(new ErrorResponse("Student Not Found", 404));
  }

  res.status(200).json(SuccessResponse(studentList, 1, "Fetched Successfully"));
});

exports.getFeeDetails = catchAsync(async (req, res, next) => {
  const { id, discountId } = req.params;
  let feeDetails = null;

  const query = {
    discountId,
    feeStructureId: id,
  };

  let response = {};

  const isMapped = await DiscountStructure.findOne(query, "feeDetails");

  if (!isMapped) {
    const feeStructure = await FeeStructure.findOne({
      _id: id,
    }).populate("feeDetails.feeTypeId", "feeType");

    feeDetails = feeStructure.feeDetails.map((fee) => {
      const { feeTypeId, scheduledDates, totalAmount } = fee;
      return {
        _id: id,
        feeType: {
          id: feeTypeId._id,
          name: feeTypeId.feeType,
        },
        amount: totalAmount,
        breakdown: scheduledDates,
      };
    });
    response = {
      isMapped: false,
      feeDetails,
    };
  } else {
    response = {
      isMapped: true,
      feeDetails: isMapped.feeDetails,
    };
  }

  res.status(200).json(SuccessResponse(response, 1, "Fetched Successfully"));
});

// DELETE
exports.deleteFeeStructure = async (req, res, next) => {
  const { id } = req.params;
  const { school_id: schoolId } = req.user;

  const feeStructure = await FeeStructure.findOne({
    _id: id,
    schoolId,
  });
  if (!feeStructure) {
    return next(new ErrorResponse("Fee Structure Not Found", 404));
  }
  const sectionList = feeStructure.classes.map((c) => c.sectionId);
  try {
    await FeeStructure.findOneAndDelete({
      _id: id,
    });
    await Sections.updateMany(
      {
        _id: { $in: sectionList },
      },
      {
        $pull: {
          feeStructureIds: mongoose.Types.ObjectId(id),
        },
      },
      {
        multi: true,
      }
    );
  } catch (err) {
    console.log("error while deleting", err.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
  res.status(200).json(SuccessResponse(null, 1, "Deleted Successfully"));
};

// LIST
exports.getByFilter = catchAsync(async (req, res, next) => {
  const { schoolId, categoryId, page = 0, limit = 10 } = req.query;
  const query = {};
  if (schoolId) {
    query.schoolId = mongoose.Types.ObjectId(schoolId);
  }
  if (categoryId) {
    query.categoryId = mongoose.Types.ObjectId(categoryId);
  }

  const feeTypes = await FeeStructure.aggregate([
    {
      $facet: {
        data: [
          { $match: query },
          {
            $lookup: {
              from: "academicyears",
              localField: "academicYearId",
              foreignField: "_id",
              as: "academicYearId",
            },
          },
          {
            $addFields: {
              academicYearId: {
                $arrayElemAt: ["$academicYearId", 0],
              },
            },
          },
          { $skip: +page * +limit },
          { $limit: +limit },
        ],
        count: [{ $match: query }, { $count: "count" }],
      },
    },
  ]);
  const { data, count } = feeTypes[0];

  if (count.length === 0) {
    return next(new ErrorResponse("Fee Structure Not Found", 404));
  }
  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});
//  unmapped?schoolId=schoolId&categoryId=categoryId
exports.getUnmappedClassList = catchAsync(async (req, res, next) => {
  const { schoolId, discountId } = req.query;

  const pipeline = [
    {
      $match: {
        school: mongoose.Types.ObjectId(schoolId),
      },
    },
    {
      $lookup: {
        from: "classes",
        localField: "class_id",
        foreignField: "_id",
        as: "class",
      },
    },
    {
      $project: {
        _id: 0,
        sectionId: "$_id",
        name: "$className",
        class_id: 1,
        sequence_number: {
          $first: "$class.sequence_number",
        },
      },
    },
    {
      $sort: {
        sequence_number: 1,
      },
    },
  ];

  let sectionList = await Sections.aggregate(pipeline).toArray();

  if (discountId) {
    const mappedSectionIds = await SectionDiscount.distinct("sectionId", {
      discountId: mongoose.Types.ObjectId(discountId),
    });
    sectionList = sectionList.filter((section) => !mappedSectionIds.includes(section.sectionId.toString()));
  }

  res.status(200).json(SuccessResponse(sectionList, sectionList.length, "Fetched Successfully"));
});

exports.getFeeStructureBySectionId = catchAsync(async (req, res, next) => {
  const { sectionId, categoryId } = req.params;

  const foundStructure = await FeeStructure.find(
    {
      classes: { $elemMatch: { sectionId } },
      categoryId,
      schoolId: req.user.school_id,
    },
    "feeStructureName"
  ).lean();

  if (!foundStructure.length) {
    return next(new ErrorResponse("Fee Structure Not Found", 404));
  }

  res.status(200).json(SuccessResponse(foundStructure, foundStructure.length, "Fetched Successfully"));
});

// TODO: Fetch the feeDetails with the students data from feeInstallments
exports.getFeeCategory = async (req, res, next) => {
  try {
    const { id, sectionId } = req.params;
    const schoolId = mongoose.Types.ObjectId(req.user.school_id);
    const feeStructure = await FeeStructure.findOne(
      {
        _id: id,
      },
      "_id feeDetails totalAmount categoryId"
    ).lean();
    if (!feeStructure) {
      return next(new ErrorResponse("Fee Structure Not Found", 404));
    }
    const { categoryId } = feeStructure;
    const FeeTypes = (await FeeType.find({ schoolId, categoryId })) || [];
    const feeDetails = feeStructure.feeDetails.map((fee) => {
      const feeType = FeeTypes.find((f) => f._id.toString() === fee.feeTypeId.toString());

      return {
        rowId: fee._id,
        feeTypeId: fee.feeTypeId,
        feeTypeName: feeType ? feeType.feeType : null,
        breakDown: fee.scheduledDates.length,
        amount: fee.totalAmount,
      };
    });

    const studentList = await feeInstallment.aggregate([
      {
        $match: {
          schoolId,
          feeStructureId: mongoose.Types.ObjectId(feeStructure._id),
          sectionId: mongoose.Types.ObjectId(sectionId),
        },
      },
      {
        $group: {
          _id: "$studentId",
          sectionId: {
            $first: "$sectionId",
          },
          totalDiscountAmount: {
            $sum: "$totalDiscountAmount",
          },
          paidAmount: {
            $sum: "$paidAmount",
          },
          totalFees: { $sum: "$totalAmount" },
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
                _id: 1,
                name: 1,
                admission_no: 1,
              },
            },
          ],
          as: "_id",
        },
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
          _id: 0,
          studentName: {
            $first: "$_id.name",
          },
          paidAmount: 1,
          totalDiscountAmount: 1,
          studentId: {
            $first: "$_id._id",
          },
          sectionName: {
            $first: "$section.className",
          },
          totalFees: 1,
          admission_no: {
            $first: "$_id.admission_no",
          },
        },
      },
    ]);
    feeStructure.studentList = studentList || [];
    feeStructure.feeDetails = feeDetails;
    res.status(200).json(SuccessResponse(feeStructure, 1, "Fetched Successfully"));
  } catch (err) {
    console.log("error while fetching fee category", err.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};
