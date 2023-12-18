const mongoose = require("mongoose");
const FeeCategory = require("../models/feeCategory");
const ErrorResponse = require("../utils/errorResponse");
const catchAsync = require("../utils/catchAsync");
const SuccessResponse = require("../utils/successResponse");
const FeeStructure = require("../models/feeStructure");

const Student = mongoose.connection.db.collection("students");

// @desc    Create Fee Category
// @route   POST /api/v1/feecategory
// @access  Private
const createFeeCategory = async (req, res, next) => {
  try {
    const { name, description = "", schoolId } = req.body;
    if (!name || !schoolId) {
      return next(new ErrorResponse("Please provide name and schoolId", 422));
    }
    const isExist = await FeeCategory.findOne({ name: name.trim(), schoolId });

    if (isExist) {
      return next(new ErrorResponse("Fee Category Already Exist", 400));
    }

    const feeCategory = await FeeCategory.create({
      name,
      description,
      schoolId,
    });
    res.status(201).json(SuccessResponse(feeCategory, 1, "Created Successfully"));
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

// @desc    Get Fee Category
// @route   GET /api/v1/feecategory/:id
// @access  Private
const getFeeCategory = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const feeCategory = await FeeCategory.findOne({
    _id: id,
  });
  if (!feeCategory) {
    return next(new ErrorResponse("Fee Category Not Found", 404));
  }
  res.status(200).json(SuccessResponse(feeCategory, 1, "Fetched Successfully"));
});

// @desc    Get All Fee Category
// @route   GET /api/v1/feecategory
// @access  Private
const getFeeCategoryByFilter = catchAsync(async (req, res, next) => {
  let { schoolId, page = 0, limit = 5 } = req.query;
  page = +page;
  limit = +limit;
  const payload = {};
  if (schoolId) {
    payload.schoolId = mongoose.Types.ObjectId(schoolId);
  }
  const aggregate = [
    { $match: payload },
    {
      $facet: {
        data: [
          {
            $lookup: {
              from: "academicyears",
              localField: "academicYearId",
              foreignField: "_id",
              as: "academicYearId",
            },
          },
          { $skip: page * limit },
          { $limit: limit },
        ],
        count: [{ $count: "count" }],
      },
    },
  ];
  const [{ data, count }] = await FeeCategory.aggregate(aggregate);

  if (count.length === 0) {
    return next(new ErrorResponse("Fee Category Not Found", 404));
  }
  res.status(200).json(SuccessResponse(data, count[0].count, "Fetched Successfully"));
});

// @desc    Update Fee Category
// @route   PUT /api/v1/feecategory/:id
// @access  Private
const updateFeeCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, schoolId } = req.body;
    const feeCategory = await FeeCategory.findOneAndUpdate(
      { _id: id },
      {
        name,
        description,
        schoolId,
      },
      {
        new: true,
        runValidators: true,
      }
    );
    if (!feeCategory) {
      return res.status(404).json(new ErrorResponse("Fee Category Not Found", 404));
    }
    res.status(200).json(SuccessResponse(feeCategory, 1, "Updated Successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getFeeCategoryBySectionId = catchAsync(async (req, res, next) => {
  const { sectionId } = req.params;
  const { school_id: schoolId } = req.user;
  const categories = await FeeStructure.aggregate([
    {
      $match: {
        schoolId: mongoose.Types.ObjectId(schoolId),
        "classes.sectionId": mongoose.Types.ObjectId(sectionId),
      },
    },
    {
      $group: {
        _id: "$categoryId",
      },
    },
    {
      $lookup: {
        from: "feecategories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $project: {
        categoryName: {
          $first: "$category.name",
        },
      },
    },
  ]);
  if (categories.length === 0) {
    return next(new ErrorResponse("Fee Category Not Found", 404));
  }
  res.status(200).json(SuccessResponse(categories, categories.length, "Fetched Successfully"));
});
// @desc    Delete Fee Category
// @route   DELETE /api/v1/feecategory/:id
// @access  Private
const deleteFeeCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const feeCategory = await FeeCategory.findOneAndDelete({
      _id: id,
    });
    if (!feeCategory) {
      return res.status(404).json(new ErrorResponse("Fee Category Not Found", 404));
    }
    res.status(200).json(SuccessResponse(null, 1, "Deleted Successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getAllStudentCategories = catchAsync(async (req, res, next) => {
  const { studentId } = req.params;

  const feeCategories = await Student.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(studentId),
      },
    },
    {
      $unwind: {
        path: "$feeCategoryIds",
      },
    },
    {
      $lookup: {
        from: "feecategories",
        let: {
          feeCategory: "$feeCategoryIds",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$feeCategory"],
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
        as: "feeCategoryIds",
      },
    },
    {
      $project: {
        _id: {
          $first: "$feeCategoryIds._id",
        },
        name: {
          $first: "$feeCategoryIds.name",
        },
      },
    },
  ]).toArray();

  res
    .status(200)
    .json(SuccessResponse(feeCategories, feeCategories.length, "Fetched Successfully"));
});

module.exports = {
  createFeeCategory,
  getFeeCategory,
  getAllStudentCategories,
  updateFeeCategory,
  deleteFeeCategory,
  getFeeCategoryBySectionId,
  getFeeCategoryByFilter,
};
