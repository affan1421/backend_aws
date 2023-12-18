const mongoose = require('mongoose');
const flatted = require('flatted');
const FeeInstallments = require('../models/feeInstallment');

const args = process.argv.slice(2);

const feeDetails = flatted.parse(args[0]);
const studentList = flatted.parse(args[1]);
const feeStructure = args[2];
const schoolId = args[3];
const academicYear = args[4];
const categoryId = args[5];

async function insertFeeInstallments() {
	// Connect to the database
	await mongoose.connect(process.env.MONGO_URI);

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
					status: 'Upcoming',
					schoolId,
					netAmount: amount,
				};
				if (new Date(date) < now) {
					newFee.status = 'Due';
				}
				feeInstallments.push(newFee);
			}
		}

		// Insert the fee installments into the database using a bulk insert operation.
		const feeInstallmentsByStudent = studentList.map(student => {
			const feeInstallmentsForStudent = feeInstallments.map(fee => ({
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
		console.error('Error while inserting data:', err);
	} finally {
		// Disconnect from the database
		await mongoose.disconnect();
	}
}

insertFeeInstallments();
