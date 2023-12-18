const mongoose = require("mongoose");
const FeeInstallments = require("../models/feeInstallment");

const Students = mongoose.connection.db.collection("students");

async function insertFeeInstallments({ feeDetails, studentList, feeStructure, schoolId, academicYear, categoryId }) {
  try {
    // Create an array of fee installments to be inserted into the database.
    const feeInstallments = [];
    const now = new Date();
    for (const fee of feeDetails) {
      const { feeTypeId, scheduleTypeId, _id, feeTypeName } = fee;
      for (const scheduledDate of fee.scheduledDates) {
        const { date, amount } = scheduledDate;
        const newFee = {
          rowId: _id,
          feeTypeId,
          feeType: {
            _id: feeTypeId,
            name: feeTypeName || feeTypeId.feeType,
          },
          scheduleTypeId,
          academicYearId: academicYear,
          scheduledDate: date,
          totalAmount: amount,
          status: "Upcoming",
          schoolId,
          netAmount: amount,
        };
        if (new Date(date) < now) {
          newFee.status = "Due";
        }
        feeInstallments.push(newFee);
      }
    }

    // Insert the fee installments into the database using a bulk insert operation.
    const feeInstallmentsByStudent = studentList.map((student) => {
      const feeInstallmentsForStudent = feeInstallments.map((fee) => ({
        studentId: student._id,
        gender: student.gender,
        feeStructureId: feeStructure,
        sectionId: student.section,
        rowId: fee.rowId,
        feeTypeId: fee.feeTypeId,
        feeType: fee.feeType,
        date: fee.scheduledDate,
        status: fee.status,
        categoryId,
        scheduleTypeId: fee.scheduleTypeId,
        academicYearId: fee.academicYearId,
        scheduledDate: fee.scheduledDate,
        totalAmount: fee.totalAmount,
        schoolId: fee.schoolId,
        netAmount: fee.netAmount,
      }));
      return feeInstallmentsForStudent;
    });

    const flattenedFeeInstallments = feeInstallmentsByStudent.flat();

    await FeeInstallments.insertMany(flattenedFeeInstallments);
  } catch (err) {
    console.error("Error while inserting data:", err);
  }
}

const runChildProcess = async (
  feeDetails,
  sectionIds, // treated as studentlist if isStudent is true
  feeStructure,
  schoolId,
  academicYearId,
  categoryId,
  isStudent = false
) => {
  // If isStudent is true, then sectionIds is treated as studentList
  let studentList = sectionIds;
  // Fetch the student list from the student API.
  if (!isStudent) {
    studentList = await Students.find(
      {
        section: { $in: sectionIds },
        deleted: false,
        profileStatus: "APPROVED",
      },
      "_id section gender"
    ).toArray();
  }

  insertFeeInstallments({
    feeDetails,
    studentList,
    feeStructure,
    schoolId,
    academicYear: academicYearId,
    categoryId,
  });
};

const runPipedProcesses = async (
  feeDetails, // [feeDetails1, feeDetails2]
  studentList, // [studentList1, studentList2]
  feeStructure,
  schoolId,
  academicYearId,
  categoryId
) => {
  insertFeeInstallments({
    feeDetails: feeDetails[0],
    studentList: studentList[0],
    feeStructure,
    schoolId,
    academicYear: academicYearId,
    categoryId,
  });

  insertFeeInstallments({
    feeDetails: feeDetails[1],
    studentList: studentList[1],
    feeStructure,
    schoolId,
    academicYear: academicYearId,
    categoryId,
  });
};

module.exports = {
  runChildProcess,
  runPipedProcesses,
};
