const mongoose = require("mongoose");
const express = require("express");
const ErrorResponse = require("../utils/errorResponse");
const SuccessResponse = require("../utils/successResponse");
const moment = require("moment");

const studentsCollection = mongoose.connection.db.collection("students");
const sectionsCollection = mongoose.connection.db.collection("sections");
const schoolCollection = mongoose.connection.db.collection("schools");
const parentsCollection = mongoose.connection.db.collection("parents");
const AcademicYear = require("../models/academicYear");
const SchoolVehicles = require("../models/schoolVehicles");
const StudentsTransport = require("../models/studentsTransport");
const busDriver = require("../models/busDriver");
const busRoutes = require("../models/busRoutes");

const createNewRoute = async (req, res, next) => {
  try {
    const { routeName, vehicleId, driverId, tripNo, stops, schoolId } = req.body;

    const seats = await SchoolVehicles.findOne({ _id: mongoose.Types.ObjectId(vehicleId) });

    const newRoute = new busRoutes({
      routeName,
      vehicleId,
      driverId,
      tripNo,
      seatingCapacity: seats.seatingCapacity,
      availableSeats: seats.seatingCapacity,
      stops,
      schoolId,
    });

    const savedRoute = await newRoute.save();

    res.status(200).json(SuccessResponse(savedRoute, 1, "New Route Created Successfully"));
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getRoutes = async (req, res, next) => {
  try {
    const { schoolId, searchQuery } = req.query;

    // const page = parseInt(req.query.page) + 1 || 1;
    // const perPage = parseInt(req.query.limit) || 5;
    // const skip = (page - 1) * perPage;

    if (searchQuery) {
      query.$or = [{ routeName: { $regex: searchQuery, $options: "i" } }];
    }

    const routes = await busRoutes.aggregate([
      {
        $match: {
          schoolId: mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $lookup: {
          from: "busdrivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driverInfo",
        },
      },
      {
        $lookup: {
          from: "schoolvehicles",
          localField: "vehicleId",
          foreignField: "_id",
          as: "vehicleInfo",
        },
      },
      {
        $lookup: {
          from: "studentstransports",
          localField: "_id",
          foreignField: "selectedRouteId",
          as: "studentsInfo",
        },
      },
      {
        $project: {
          _id: 1,
          routeName: 1,
          tripNo: 1,
          stops: {
            $map: {
              input: "$stops",
              as: "stop",
              in: {
                _id: "$$stop._id",
                data: {
                  stop: "$$stop.data.stop",
                  oneWay: "$$stop.data.oneWay",
                  roundTrip: "$$stop.data.roundTrip",
                },
                label: "$$stop.label",
              },
            },
          },
          seatingCapacity: 1,
          availableSeats: 1,
          "driverInfo._id": 1,
          "driverInfo.name": 1,
          "vehicleInfo._id": 1,
          "vehicleInfo.registrationNumber": 1,
          "vehicleInfo.assignedVehicleNumber": 1,
          stopsCount: { $size: "$stops" },
          studentsCount: { $size: "$studentsInfo" },
          createdAt: 1,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      // {
      //   $skip: skip,
      // },
      // {
      //   $limit: perPage,
      // },
    ]);

    res.status(200).json({ routes });
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse(error.message || "Something Went Wrong", 500));
  }
};

const getEditRoutes = async (req, res, next) => {
  try {
    const { routeId } = req.query;

    const data = await busRoutes.findOne({ _id: routeId });

    if (!data) {
      return next(new ErrorResponse("Route not found", 404));
    }

    res.status(200).json(SuccessResponse(data, 1, "Route Fetched Successfully"));
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const updateRoutes = async (req, res, next) => {
  try {
    const { routeId } = req.query;
    const updatedData = req.body;

    const data = await busRoutes.findByIdAndUpdate(routeId, { $set: updatedData }, { new: true });

    if (!data) {
      return next(new ErrorResponse("Route not found", 404));
    }

    res.status(200).json(SuccessResponse(data, 1, "Route Updated Successfully"));
  } catch (error) {
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const studentsCount = async (req, res, next) => {
  try {
    const { schoolId } = req.query;
    const routeStudentsCount = await StudentsTransport.aggregate([
      {
        $match: {
          schoolId: mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $group: {
          _id: "$selectedRouteId",
          totalStudents: { $sum: 1 },
        },
      },
    ]);

    res
      .status(200)
      .json(SuccessResponse(routeStudentsCount, routeStudentsCount.length, "Successful"));
  } catch (error) {
    console.log("error in students count", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

//-------------------------bus driver---------------------------

const addNewDriver = async (req, res, next) => {
  try {
    const {
      name,
      contactNumber,
      emergencyNumber,
      drivingLicense,
      aadharNumber,
      bloodGroup,
      address,
      schoolId,
      attachments,
    } = req.body;

    const existingDriver = await busDriver.findOne({
      $or: [{ drivingLicense }, { aadharNumber }, { contactNumber }, { emergencyNumber }],
    });

    if (existingDriver) {
      return res.status(400).json({
        success: false,
        message:
          "Driver with the same driving license, Aadhar number, contact number, or emergency number already exists.",
      });
    }

    const phoneNumberPattern = /^\d{10}$/; // 10-digit phone number
    const aadharNumberPattern = /^\d{12}$/; // 12-digit Aadhar number

    if (!phoneNumberPattern.test(contactNumber) || !phoneNumberPattern.test(emergencyNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Please provide a 10-digit phone number.",
      });
    }

    if (!phoneNumberPattern.test(emergencyNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid emergency number format. Please provide a 10-digit phone number.",
      });
    }

    if (!aadharNumberPattern.test(aadharNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Aadhar number format. Please provide a 12-digit Aadhar number.",
      });
    }

    const newDriver = new busDriver({
      name,
      contactNumber,
      emergencyNumber,
      drivingLicense,
      aadharNumber,
      bloodGroup,
      address,
      schoolId,
      attachments,
    });

    await newDriver.save();

    res.status(200).json(SuccessResponse(newDriver, 1, "New Driver Added Successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const editDriver = async (req, res, next) => {
  try {
    const { id } = req.query;

    const driver = await busDriver.findOne({ _id: mongoose.Types.ObjectId(id) });

    if (!driver) {
      return next(new ErrorResponse("Driver not found", 404));
    }

    res.status(200).json(SuccessResponse(driver, 1, "Driver Details Fetched successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const updateDriver = async (req, res, next) => {
  try {
    const { id } = req.query;
    const updatedData = req.body;

    const driver = await busDriver.findByIdAndUpdate(id, { $set: updatedData }, { new: true });

    if (!driver) {
      return next(new ErrorResponse("Driver not found", 404));
    }
    res.status(200).json(SuccessResponse(driver, 1, "Updated Successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const deleteDriver = async (req, res, next) => {
  try {
    const { id } = req.query;

    const deleteDriver = await busDriver.deleteOne({ _id: id });

    res.status(200).json(SuccessResponse("Driver Details Deleted Successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//   try {
//     const { schoolId, searchQuery } = req.query;

//     // const page = parseInt(req.query.page) || 1;
//     // const perPage = parseInt(req.query.limit) || 5;
//     // const skip = (page - 1) * perPage;

//     const totalCount = await busDriver.countDocuments();

//     const data = await busDriver.aggregate([
//       {
//         $match: {
//           schoolId: mongoose.Types.ObjectId(schoolId),
//         },
//       },
//       {
//         $lookup: {
//           from: "busroutes",
//           let: { driverId: "$_id" },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: ["$driverId", "$$driverId"],
//                 },
//               },
//             },
//           ],
//           as: "routesInfo",
//         },
//       },
//       {
//         $unwind: {
//           path: "$routesInfo",
//           preserveNullAndEmptyArrays: true,
//         },
//       },
//       {
//         $project: {
//           "routesInfo.routeName": 1,
//           name: 1,
//           contactNumber: 1,
//           emergencyNumber: 1,
//           drivingLicense: 1,
//           aadharNumber: 1,
//           bloodGroup: 1,
//           address: 1,
//           schoolId: 1,
//           attachments: 1,
//         },
//       },
//     ]);

//     res
//       .status(200)
//       .json(SuccessResponse(data, totalCount, "Data fetched successfully", totalCount));
//   } catch (error) {
//     return next(new ErrorResponse("Something went Wrong", 500));
//   }
// };

const listDrivers = async (req, res, next) => {
  try {
    const { schoolId, searchQuery } = req.query;

    const page = parseInt(req.query.page) + 1 || 1;
    const perPage = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * perPage;

    const totalCount = await busDriver.countDocuments();

    const data = await busDriver.aggregate([
      {
        $match: {
          schoolId: mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $lookup: {
          from: "busroutes",
          let: { driverId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$driverId", "$$driverId"],
                },
              },
            },
          ],
          as: "routesInfo",
        },
      },
      {
        $unwind: {
          path: "$routesInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          contactNumber: { $first: "$contactNumber" },
          emergencyNumber: { $first: "$emergencyNumber" },
          drivingLicense: { $first: "$drivingLicense" },
          aadharNumber: { $first: "$aadharNumber" },
          bloodGroup: { $first: "$bloodGroup" },
          address: { $first: "$address" },
          schoolId: { $first: "$schoolId" },
          attachments: { $first: "$attachments" },
          routesInfo: { $push: "$routesInfo.routeName" },
          createdAt: { $first: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          contactNumber: 1,
          emergencyNumber: 1,
          drivingLicense: 1,
          aadharNumber: 1,
          bloodGroup: 1,
          address: 1,
          schoolId: 1,
          attachments: 1,
          routesInfo: 1,
          createdAt: 1,
        },
      },
      {
        $match: {
          $or: [{ name: { $regex: new RegExp(searchQuery, "i") } }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: perPage,
      },
    ]);

    res.status(200).json(SuccessResponse(data, totalCount, "Data fetched successfully"));
  } catch (error) {
    console.error("Error in listDrivers:", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const viewDriver = async (req, res, next) => {
  try {
    const { id } = req.query;
    const driver = await busDriver.findOne({ _id: id }).populate("selectedRoute", "routeName");

    if (!driver) {
      return next(new ErrorResponse("Driver doesn't exist", 404));
    }
    res.status(200).json(SuccessResponse(driver, 1, "data fetched successfully"));
  } catch (error) {
    console.log("Error while viewing drivers", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const routeList = async (req, res, next) => {
  try {
    const { schoolId } = req.query;
    const filter = { schoolId: mongoose.Types.ObjectId(schoolId) };
    const routelist = await busRoutes.find(filter).select("routeName");
    res.status(200).json(SuccessResponse(routelist, routelist.length, "Successfully fetched"));
  } catch (error) {
    console.log("Error while listing routes ", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const stopList = async (req, res, next) => {
  try {
    const { routeId } = req.query;

    const route = await busRoutes.findById(routeId).select("stops").lean();

    if (!route) {
      return next(new ErrorResponse("Route not found", 404));
    }

    const responseData = route.stops; // Directly use the "stops" array

    res.status(200).json(SuccessResponse(responseData, responseData.length, "Successful"));
  } catch (error) {
    console.log("Error while listing stops ", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const listMonths = async (req, res, next) => {
  try {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    res.status(200).json({
      success: true,
      data: months,
      resultCount: months.length,
      message: "List of months retrieved successfully",
    });
  } catch (error) {
    console.error("Error while listing months: ", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//-------------------------vehicles------------------------------

const addNewVehicle = async (req, res, next) => {
  try {
    const {
      registrationNumber,
      assignedVehicleNumber,
      seatingCapacity,
      taxValid,
      fcValid,
      vehicleMode,
      schoolId,
      attachments,
    } = req.body;

    const existingVehicle = await SchoolVehicles.findOne({ registrationNumber });

    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: "Vehicle with Same Registration Number already exists",
      });
    }

    const vehicleNumber = await SchoolVehicles.findOne({ assignedVehicleNumber });

    if (vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: "Vehicle Number already exists",
      });
    }

    const formattedTaxValid = moment(taxValid, "DD/MM/YYYY").toDate();
    const formattedFcValid = moment(fcValid, "DD/MM/YYYY").toDate();

    const newVehicle = new SchoolVehicles({
      registrationNumber,
      assignedVehicleNumber,
      seatingCapacity,
      taxValid: formattedTaxValid,
      fcValid: formattedFcValid,
      vehicleMode,
      schoolId,
      attachments,
    });

    await newVehicle.save();

    res.status(200).json(SuccessResponse(newVehicle, 1, "New Vehicle added successfully"));
  } catch (error) {
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const editVehicle = async (req, res, next) => {
  try {
    const { id } = req.query;

    const vehicle = await SchoolVehicles.findOne({ _id: mongoose.Types.ObjectId(id) });

    if (!vehicle) {
      return next(new ErrorResponse("Vehicle not Found", 404));
    }

    res.status(200).json(SuccessResponse(vehicle, 1, "Successful"));
  } catch (error) {
    return next(new ErrorResponse(error.message || "Something Went Wrong", 500));
  }
};

const updateVehicle = async (req, res, next) => {
  try {
    const { id } = req.query;
    const updatedData = req.body;

    const vehicle = await SchoolVehicles.findByIdAndUpdate(
      id,
      { $set: updatedData },
      { new: true }
    );

    res.status(200).json(SuccessResponse(vehicle, 1, "Vehicle Data Updated Successfully"));
  } catch (error) {
    console.log("Error while updating Vehicle details", error.message);
    return next(new ErrorResponse(error.message || "Something Went Wrong", 500));
  }
};

const deleteVehicle = async (req, res, next) => {
  try {
    const { id } = req.query;
    await SchoolVehicles.deleteOne({ _id: id });
    res.status(200).json({ success: true, message: "Vehicle details deleted successfully" });
  } catch (error) {
    console.log("Error while Deleting vehicle data", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const listVehicles = async (req, res, next) => {
  try {
    const { schoolId, searchQuery } = req.query;
    const page = parseInt(req.query.page) + 1 || 1;
    const perPage = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * perPage;

    const totalCount = await SchoolVehicles.countDocuments();

    // const data = await SchoolVehicles.find(filter).skip(skip).limit(perPage);

    const data = await SchoolVehicles.aggregate([
      {
        $match: {
          schoolId: mongoose.Types.ObjectId(schoolId),
        },
      },
      {
        $lookup: {
          from: "busroutes",
          let: { vehicleId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$vehicleId", "$$vehicleId"],
                },
              },
            },
          ],
          as: "vehicleInfo",
        },
      },
      {
        $unwind: {
          path: "$vehicleInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          registrationNumber: { $first: "$registrationNumber" },
          assignedVehicleNumber: { $first: "$assignedVehicleNumber" },
          seatingCapacity: { $first: "$seatingCapacity" },
          availableSeats: { $first: "$availableSeats" },
          vehicleMode: { $first: "$vehicleMode" },
          taxValid: { $first: "$taxValid" },
          fcValid: { $first: "$fcValid" },
          schoolId: { $first: "$schoolId" },
          attachments: { $first: "$attachments" },
          vehicleInfo: { $push: "$vehicleInfo.routeName" },
          createdAt: { $first: "$createdAt" },
        },
      },
      {
        $project: {
          _id: 1,
          registrationNumber: 1,
          assignedVehicleNumber: 1,
          seatingCapacity: 1,
          availableSeats: 1,
          vehicleMode: 1,
          taxValid: 1,
          fcValid: 1,
          schoolId: 1,
          attachments: 1,
          vehicleInfo: 1,
          createdAt: 1,
        },
      },
      {
        $match: {
          $or: [{ registrationNumber: { $regex: new RegExp(searchQuery, "i") } }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: perPage,
      },
    ]);

    res
      .status(200)
      .json(SuccessResponse(data, totalCount, "Vehicle data fetched sucessfully", totalCount));
  } catch (error) {
    console.log("Error while listing vehicles", error.message);
    return next(new ErrorResponse("Some thing went wrong", 500));
  }
};

const viewVehicle = async (req, res, next) => {
  try {
    const { id } = req.query;
    const vehicle = await SchoolVehicles.findOne({ _id: id }).select("_id attachments");

    res.status(200).json(SuccessResponse(vehicle, 1, "Successfully Fetched"));
  } catch (error) {
    console.log("Error while viewing vehicle", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const driverList = async (req, res, next) => {
  try {
    const { schoolId } = req.query;
    filter = { schoolId: mongoose.Types.ObjectId(schoolId) };
    const driverlist = await busDriver.find(filter).select("name");
    res.status(200).json(SuccessResponse(driverlist, driverlist.length, "Fetched Successfully"));
  } catch (error) {
    console.log("Error while viewing driver-list", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//----------------------------students--------------------------------

const getAllClasses = async (req, res, next) => {
  try {
    const { schoolId } = req.query;
    const classList = await sectionsCollection
      .aggregate([
        {
          $match: {
            school: mongoose.Types.ObjectId(schoolId),
          },
        },
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

    res
      .status(200)
      .json(SuccessResponse(classList, classList.length, "Classes details fetch successfully"));
  } catch (error) {
    console.error("Error fetching classes list:", error);
    console.log("error", error.message);
    return next(new ErrorResponse("Something Went Wrong", 500));
  }
};

const getClassWiseStudents = async (req, res, next) => {
  try {
    const { classId, schoolId } = req.query;

    if (!classId || !schoolId) {
      return res.status(400).json({
        error: "Both Class ID and School ID are required in the query parameters.",
      });
    }

    const students = await studentsCollection
      .aggregate([
        {
          $match: {
            section: mongoose.Types.ObjectId(classId),
            school_id: mongoose.Types.ObjectId(schoolId),
          },
        },
        {
          $project: {
            name: 1,
          },
        },
      ])

      .toArray();

    if (!students || students.length === 0) {
      return res.status(404).json({
        error: "No students found for the specified classId and schoolId.",
      });
    }

    res.status(200).json(SuccessResponse(students, students.length, "succesfullly fetched"));
  } catch (error) {
    console.error("Went wrong while fetching students data", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const getVehicleNumbers = async (req, res, next) => {
  try {
    const { schoolId, searchQuery } = req.query;

    const filter = {
      schoolId: mongoose.Types.ObjectId(schoolId),
      $or: [
        {
          registrationNumber: { $regex: new RegExp(searchQuery, "i") },
        },
      ],
    };
    const vehicleNumbers = await SchoolVehicles.find(filter).select(
      "registrationNumber assignedVehicleNumber"
    );

    res.status(200).json(SuccessResponse(vehicleNumbers, vehicleNumbers.length, "Successful"));
  } catch (error) {
    console.error("Went wrong while fetching vehicle numbers", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const addStudentTransport = async (req, res, next) => {
  try {
    const {
      schoolId,
      sectionId,
      studentId,
      transportSchedule,
      selectedRouteId,
      stopId,
      feeMonths,
      monthlyFees,
    } = req.body;

    const academicYr = await AcademicYear.findOne({
      schoolId: mongoose.Types.ObjectId(schoolId),
      isActive: true,
    }).select("_id");

    console.log(academicYr._id, "academicYear");

    const existingStudent = await StudentsTransport.findOne({
      studentId: mongoose.Types.ObjectId(studentId),
    });

    if (existingStudent) {
      return next(new ErrorResponse("Student already exist", 404));
    }

    const trip = await busRoutes
      .findOne({ _id: mongoose.Types.ObjectId(selectedRouteId) })
      .select("tripNo availableSeats");

    if (!trip) {
      return next(new ErrorResponse("Selected route not found", 404));
    }

    if (trip.availableSeats <= 0) {
      return next(new ErrorResponse("No available seats on the selected route", 400));
    }

    await busRoutes.findByIdAndUpdate(
      selectedRouteId,
      { $inc: { availableSeats: -1 } },
      { new: true }
    );

    const newStudentTransport = new StudentsTransport({
      schoolId,
      sectionId,
      studentId,
      academicYear: academicYr._id,
      transportSchedule,
      selectedRouteId,
      stopId,
      feeMonths,
      monthlyFees,
      tripNumber: trip.tripNo,
    });

    await newStudentTransport.save();

    res
      .status(200)
      .json(
        SuccessResponse(newStudentTransport, 1, "Student Transport details added successfully")
      );
  } catch (error) {
    console.error("Went wrong while adding student transport", error.message);
    return next(new ErrorResponse(error.message || "Something went wrong", 500));
  }
};

const editStudentTransport = async (req, res, next) => {
  try {
    const { id } = req.query;
    const currentMonth = new Date().toLocaleString("en-US", { month: "long" });

    const studentData = await StudentsTransport.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(id),
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "studentInfo",
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "sectionId",
          foreignField: "_id",
          as: "sectionInfo",
        },
      },
      {
        $lookup: {
          from: "busroutes",
          let: { routeId: "$selectedRouteId", stopId: "$stopId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$_id", "$$routeId"] }, { $in: ["$$stopId", "$stops._id"] }],
                },
              },
            },
            {
              $unwind: "$stops",
            },
            {
              $match: {
                $expr: { $eq: ["$$stopId", "$stops._id"] },
              },
            },
          ],
          as: "routeInfo",
        },
      },
      {
        $project: {
          "studentInfo._id": 1,
          "studentInfo.name": 1,
          "sectionInfo._id": 1,
          "sectionInfo.className": 1,
          "routeInfo._id": 1,
          "routeInfo.routeName": 1,
          "routeInfo.stopId": { $arrayElemAt: ["$routeInfo.stops._id", 0] },
          "routeInfo.stop": { $arrayElemAt: ["$routeInfo.stops.data.stop", 0] },
          transportSchedule: 1,
          feeDetails: {
            $filter: {
              input: "$feeDetails",
              as: "feeDetail",
              cond: {
                $eq: ["$$feeDetail.monthName", currentMonth],
              },
            },
          },
          feeMonths: 1,
          tripNumber: 1,
          status: 1,
        },
      },
    ]);

    // Assuming totalAmount is a property inside the filtered feeDetail
    const totalAmount = studentData[0].feeDetails[0].totalAmount;

    // If you want to rename feeAmount to totalAmount
    studentData[0].feeAmount = totalAmount;
    delete studentData[0].totalAmount;

    res.status(200).json(SuccessResponse(studentData, 1, "Successful"));
  } catch (error) {
    console.error("Went wrong while editing student transport", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const updateStudentTransport = async (req, res, next) => {
  try {
    const { id } = req.query;
    const updateData = req.body;
    const studentData = await StudentsTransport.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    res.status(200).json(SuccessResponse(studentData, 1, "updated Successfully"));
  } catch (error) {
    console.error("Went wrong while updating student transport", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const deleteStudentTransport = async (req, res, next) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const result = await StudentsTransport.deleteOne({ _id: mongoose.Types.ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "No documents were deleted" });
    }

    res.status(200).json({ message: `${result.deletedCount} documents deleted successfully` });
  } catch (error) {
    console.error("Error while deleting student transport documents", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

const getStudentTransportList = async (req, res, next) => {
  try {
    const { schoolId, searchQuery, classId } = req.query;

    const page = parseInt(req.query.page) + 1 || 1;
    const perPage = parseInt(req.query.limit) || 5;
    const skip = (page - 1) * perPage;

    const currentMonth = new Date().toLocaleString("en-US", { month: "long" });

    const studentData = await StudentsTransport.aggregate([
      {
        $match: {
          $or: [
            { schoolId: mongoose.Types.ObjectId(schoolId) },
            { sectionId: mongoose.Types.ObjectId(classId) },
          ],
        },
      },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "studentInfo",
        },
      },
      {
        $lookup: {
          from: "sections",
          localField: "sectionId",
          foreignField: "_id",
          as: "sectionInfo",
        },
      },
      {
        $lookup: {
          from: "busroutes",
          let: { routeId: "$selectedRouteId", stopId: "$stopId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$_id", "$$routeId"] }, { $in: ["$$stopId", "$stops._id"] }],
                },
              },
            },
            {
              $unwind: "$stops",
            },
            {
              $match: {
                $expr: { $eq: ["$$stopId", "$stops._id"] },
              },
            },
          ],
          as: "routeInfo",
        },
      },
      {
        $lookup: {
          from: "busdrivers",
          localField: "routeInfo.driverId",
          foreignField: "_id",
          as: "driverInfo",
        },
      },
      {
        $lookup: {
          from: "schoolvehicles",
          localField: "routeInfo.vehicleId",
          foreignField: "_id",
          as: "vehicleInfo",
        },
      },
      {
        $project: {
          "studentInfo._id": 1,
          "studentInfo.name": 1,
          "sectionInfo._id": 1,
          "sectionInfo.className": 1,
          "routeInfo._id": 1,
          "routeInfo.routeName": 1,
          "routeInfo.stopId": { $arrayElemAt: ["$routeInfo.stops._id", 0] },
          "routeInfo.stop": { $arrayElemAt: ["$routeInfo.stops.data.stop", 0] },
          "driverInfo._id": { $arrayElemAt: ["$driverInfo._id", 0] },
          "driverInfo.name": { $arrayElemAt: ["$driverInfo.name", 0] },
          "vehicleInfo._id": { $arrayElemAt: ["$vehicleInfo._id", 0] },
          "vehicleInfo.registrationNumber": {
            $arrayElemAt: ["$vehicleInfo.registrationNumber", 0],
          },
          "vehicleInfo.assignedVehicleNumber": {
            $arrayElemAt: ["$vehicleInfo.assignedVehicleNumber", 0],
          },
          transportSchedule: 1,
          feeDetails: {
            $filter: {
              input: "$feeDetails",
              as: "feeDetail",
              cond: {
                $eq: ["$$feeDetail.monthName", currentMonth],
              },
            },
          },
          feeAmount: 1,
          tripNumber: 1,
          status: 1,
          createdAt: 1,
        },
      },
      {
        $match: {
          $or: [
            { "studentInfo.name": { $regex: new RegExp(searchQuery, "i") } },
            { "parentInfo.name": { $regex: new RegExp(searchQuery, "i") } },
            { "routeInfo.routeName": { $regex: new RegExp(searchQuery, "i") } },
            { "driverInfo.name": { $regex: new RegExp(searchQuery, "i") } },
          ],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: perPage,
      },
    ]);

    const totalCount = await StudentsTransport.countDocuments();

    res.status(200).json(SuccessResponse(studentData, totalCount, "Data fetched successfully"));
  } catch (error) {
    console.error("Went wrong while listing student transport", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

const getTripNumber = async (req, res, next) => {
  try {
    const { selectedRouteId } = req.query;

    const tripInfo = await busRoutes
      .findOne({ _id: mongoose.Types.ObjectId(selectedRouteId) })
      .select("tripNo");

    const tripNo = tripInfo ? tripInfo.tripNo : null;

    res.status(200).json(SuccessResponse(tripNo, 1, "Successful"));
  } catch (error) {
    console.error("Went wrong while getting trip number", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//-------------------------dashboard-data----------------------------

const getDashboardCount = async (req, res, next) => {
  try {
    const { schoolId, month } = req.query;

    const filter = {
      schoolId: mongoose.Types.ObjectId(schoolId),
    };

    const [studentsCount, routesCount, vehiclesCount, driverCount, totalStopsCount, feeStats] =
      await Promise.all([
        StudentsTransport.countDocuments(filter),
        busRoutes.countDocuments(filter),
        SchoolVehicles.countDocuments(filter),
        busDriver.countDocuments(filter),

        busRoutes.aggregate([
          {
            $match: filter,
          },
          {
            $unwind: "$stops",
          },
          {
            $group: {
              _id: null,
              stopsCount: { $sum: 1 },
            },
          },
        ]),

        StudentsTransport.aggregate([
          {
            $match: {
              ...filter,
              "feeDetails.monthName": month,
              "feeDetails.status": { $in: ["Paid", "Due"] },
            },
          },
          {
            $unwind: "$feeDetails",
          },
          {
            $match: {
              "feeDetails.monthName": month,
            },
          },
          {
            $group: {
              _id: "$feeDetails.monthName",
              paidAmount: { $sum: "$feeDetails.paidAmount" },
              dueAmount: { $sum: "$feeDetails.dueAmount" },
            },
          },
        ]),
      ]);

    const stopsCount = totalStopsCount[0]?.stopsCount || 0;
    const feeDetails = feeStats.map(({ _id, paidAmount, dueAmount }) => ({
      monthName: _id,
      paidAmount: paidAmount || 0,
      dueAmount: dueAmount || 0,
    }));

    const monthEntry = feeDetails.find((entry) => entry.monthName === month);
    const feeDetailsResult = monthEntry
      ? {
          monthName: monthEntry.monthName,
          paidAmount: monthEntry.paidAmount,
          dueAmount: monthEntry.dueAmount,
        }
      : { monthName: month, paidAmount: 0, dueAmount: 0 };

    res.status(200).json({
      studentsCount,
      routesCount,
      vehiclesCount,
      driverCount,
      stopsCount,
      feeDetails: feeDetailsResult, // Sending only the matching month
    });
  } catch (error) {
    console.error("Went wrong while fetching dashboard data", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//------------------------payment-----------------------------------

const makePayment = async (req, res, next) => {
  try {
    const {
      studentId,
      status,
      transportId,
      paidAmount,
      paymentMethod,
      createdBy,
      bankName,
      transactionId,
      transactionDate,
    } = req.body;

    const transport = await StudentsTransport.findOne({
      studentId: mongoose.Types.ObjectId(studentId),
    });

    if (!transport) {
      return next(new ErrorResponse("Transport not found", 404));
    }

    const feeDetailToUpdate = transport.feeDetails.find(
      (detail) => detail._id.toString() === transportId
    );

    if (!feeDetailToUpdate) {
      return next(new ErrorResponse("Fee detail not found", 404));
    }

    // Update fee details based on the provided status
    if (status === "APPROVED") {
      const transactionDay = new Date(transactionDate).getDate();
      const transactionMonth = new Date(transactionDate).toLocaleString("en-US", {
        month: "long",
      });

      const isLate = transactionMonth === feeDetailToUpdate.monthName && transactionDay > 10;

      feeDetailToUpdate.status = isLate ? "Late" : "Paid";
      feeDetailToUpdate.dueAmount -= paidAmount;
      feeDetailToUpdate.paidAmount = paidAmount;

      const generateReceiptId = () => {
        const alphanumericChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

        let receiptId = "";

        for (let i = 0; i < 10; i++) {
          const randomIndex = Math.floor(Math.random() * alphanumericChars.length);
          receiptId += alphanumericChars.charAt(randomIndex);
        }

        return receiptId;
      };

      feeDetailToUpdate.receiptId = generateReceiptId();
      feeDetailToUpdate.createdBy = createdBy;
      feeDetailToUpdate.paymentDate = transactionDate;
      feeDetailToUpdate.paymentMethod = paymentMethod;

      if (paymentMethod !== "CASH") {
        // Create a separate object under transportId in feeDetail
        feeDetailToUpdate.bankTransaction = {
          bankName,
          transactionId,
        };
      }

      await StudentsTransport.updateOne(
        { _id: transport._id, "feeDetails._id": transportId },
        {
          $set: {
            "feeDetails.$.status": "Paid",
            "feeDetails.$.dueAmount": feeDetailToUpdate.dueAmount,
            "feeDetails.$.paidAmount": feeDetailToUpdate.paidAmount,
            "feeDetails.$.receiptId": feeDetailToUpdate.receiptId,
            "feeDetails.$.createdBy": feeDetailToUpdate.createdBy,
            "feeDetails.$.paymentDate": feeDetailToUpdate.paymentDate,
            "feeDetails.$.paymentMethod": feeDetailToUpdate.paymentMethod,
            "feeDetails.$.bankTransaction": feeDetailToUpdate.bankTransaction,
            // Add other fields as needed
          },
        }
      );
    }

    res.status(200).json(SuccessResponse(transport, 1, "Updated Successfully"));
  } catch (error) {
    console.error("Went wrong while making payment", error.message);
    return next(new ErrorResponse("Something went wrong", 500));
  }
};

//-------------------------module-exports-----------------------------

module.exports = {
  createNewRoute,
  getRoutes,
  updateRoutes,
  getEditRoutes,
  studentsCount,
  addNewDriver,
  editDriver,
  updateDriver,
  deleteDriver,
  listDrivers,
  viewDriver,
  routeList,
  stopList,
  listMonths,
  addNewVehicle,
  editVehicle,
  updateVehicle,
  deleteVehicle,
  listVehicles,
  viewVehicle,
  driverList,
  getAllClasses,
  getClassWiseStudents,
  getVehicleNumbers,
  addStudentTransport,
  editStudentTransport,
  getDashboardCount,
  updateStudentTransport,
  deleteStudentTransport,
  getStudentTransportList,
  getTripNumber,
  makePayment,
};
