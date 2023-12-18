/* eslint-disable no-unused-expressions */
/* eslint-disable prefer-destructuring */
const mongoose = require('mongoose');
const excel = require('excel4node');
const moment = require('moment');
const XLSX = require('xlsx');

const FeeReceipt = require('../models/feeReceipt');
const PreviousBalance = require('../models/previousFeesBalance');

const Sections = mongoose.connection.db.collection('sections');

const Schools = mongoose.connection.db.collection('schools');
const AcademicYears = require('../models/academicYear');
const FeeType = require('../models/feeType');

const Students = mongoose.connection.db.collection('students');
const SuccessResponse = require('../utils/successResponse');
const ErrorResponse = require('../utils/errorResponse');
const CatchAsync = require('../utils/catchAsync');
const getSections = require('../helpers/section');

const Student = mongoose.connection.db.collection('students');

const GetAllByFilter = CatchAsync(async (req, res, next) => {
	let {
		schoolId,
		academicYearId,
		isEnrolled = false,
		page,
		limit,
		searchTerm = null,
		sectionId,
	} = req.query;
	const payload = {};

	if (schoolId) {
		payload.schoolId = mongoose.Types.ObjectId(schoolId);
	} else {
		return next(new ErrorResponse('Please Provide The School Id', 422));
	}
	if (academicYearId) {
		payload.academicYearId = mongoose.Types.ObjectId(academicYearId);
	}
	if (isEnrolled) {
		payload.isEnrolled = isEnrolled === 'true';
	}
	if (sectionId) {
		payload.sectionId = mongoose.Types.ObjectId(sectionId);
	}
	if (searchTerm) {
		payload.studentName = { $regex: searchTerm, $options: 'i' };
	}
	// Optional Pagination
	const dataFacet = [
		{ $match: payload },
		{
			$lookup: {
				from: 'sections',
				let: {
					sectionId: '$sectionId',
				},
				pipeline: [
					{
						$match: {
							$expr: {
								$eq: ['$$sectionId', '$_id'],
							},
						},
					},
					{
						$project: {
							name: 1,
							className: 1,
						},
					},
				],
				as: 'sectionId',
			},
		},
		{
			$unwind: {
				path: '$sectionId',
				preserveNullAndEmptyArrays: true,
			},
		},
	];
	if (page && limit) {
		page = +page;
		limit = +limit;
		dataFacet.push({ $skip: page * limit }, { $limit: limit });
	}
	const previousBalances = await PreviousBalance.aggregate([
		{
			$facet: {
				data: dataFacet,
				count: [{ $match: payload }, { $count: 'count' }],
			},
		},
	]);
	const { data, count } = previousBalances[0];

	if (count.length === 0) {
		return next(new ErrorResponse('No Previous Fee Found', 404));
	}
	res
		.status(200)
		.json(SuccessResponse(data, count[0].count, 'Fetched Successfully'));
});

const MakePayment = CatchAsync(async (req, res, next) => {
	const {
		prevBalId,
		paidAmount,
		paymentMode,
		bankName,
		chequeDate,
		chequeNumber,
		transactionDate,
		transactionId,
		status = null,
		upiId,
		payerName,
		ddNumber,
		ddDate,
		createdBy,
	} = req.body;
	let student;
	let admission_no;
	const receipt_id = mongoose.Types.ObjectId();
	const updateBalancePromise = [];

	if (!createdBy)
		return next(new ErrorResponse('Please Provide Created By', 422));

	if (!status) return next(new ErrorResponse('Please Provide Status', 422));

	const previousBalance = await PreviousBalance.findOne({ _id: prevBalId });

	const {
		schoolId,
		studentId,
		studentName,
		parentName,
		parentId,
		totalAmount,
		dueAmount,
		sectionId,
		username,
	} = previousBalance;

	if (studentId) {
		student = await Student.findOne({
			_id: mongoose.Types.ObjectId(studentId),
		});
		({ admission_no = '' } = student);
	}

	const feeTypePromise = FeeType.findOne({ schoolId, feeCategory: 'PREVIOUS' });

	const lastReceiptPromise = FeeReceipt.findOne({ 'school.schoolId': schoolId })
		.sort({ createdAt: -1 })
		.lean();

	const sectionPromise = Sections.findOne(
		{ _id: mongoose.Types.ObjectId(sectionId) },
		'name className class_id'
	);

	const schoolPromise = Schools.findOne(
		{ _id: mongoose.Types.ObjectId(schoolId) },
		'schoolName address'
	);

	let [feeType, lastReceipt, section, school] = await Promise.all([
		feeTypePromise,
		lastReceiptPromise,
		sectionPromise,
		schoolPromise,
	]);

	if (!feeType) {
		// Create Fee Type
		const feeTypePayload = {
			_id: mongoose.Types.ObjectId(),
			feeType: 'Previous Balance',
			accountType: 'Revenue',
			schoolId,
			description: 'Previous Balance Fee',
			isMisc: false,
			feeCategory: 'PREVIOUS',
		};

		feeType = await FeeType.create(feeTypePayload);
	}

	const formattedDate = moment().format('DDMMYY');
	const newCount = lastReceipt
		? (parseInt(lastReceipt.receiptId.slice(-5)) + 1)
				.toString()
				.padStart(5, '0')
		: '00001';
	const receiptId = `PY${formattedDate}${newCount}`;

	const receiptPayload = {
		_id: receipt_id,
		student: {
			name: studentName,
			studentId,
			admission_no,
			class: {
				classId: section.class_id,
				name: section.className.split(' - ')[0],
			},
			section: {
				sectionId,
				name: section.name,
			},
		},
		parent: {
			name: parentName,
			mobile: username,
			parentId,
		},
		school: {
			name: school.schoolName,
			address: school.address,
			schoolId,
		},
		receiptType: 'PREVIOUS_BALANCE',
		academicYear: lastReceipt.academicYear,
		totalAmount,
		paidAmount,
		dueAmount: dueAmount - paidAmount,
		receiptId,
		issueDate: new Date(),
		payment: {
			method: paymentMode,
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
		items: {
			feeTypeId: feeType._id,
			netAmount: totalAmount,
			paidAmount,
		},
		createdBy,
		status,
		approvedBy:
			paymentMode === 'CASH' || status === 'APPROVED' ? createdBy : null,
	};

	if (status === 'APPROVED') {
		const updatePayload = {
			lastPaidDate: new Date(),
		};

		if (dueAmount - paidAmount === 0) {
			updatePayload.status = 'Paid';
		}

		updateBalancePromise.push(
			PreviousBalance.updateOne(
				{ _id: prevBalId },
				{
					$set: { ...updatePayload },
					$inc: {
						paidAmount,
						dueAmount: -paidAmount,
					},
					$push: {
						receiptIds: receipt_id,
					},
				}
			)
		);
	} else {
		// just update the receipt id
		const updatePayload = {
			$push: {
				receiptIds: receipt_id,
			},
		};

		updateBalancePromise.push(
			PreviousBalance.updateOne({ _id: prevBalId }, updatePayload)
		);
	}

	updateBalancePromise.push(FeeReceipt.create(receiptPayload));

	await Promise.all(updateBalancePromise);

	res
		.status(200)
		.json(SuccessResponse(receiptPayload, 1, 'Payment Successful'));
});

const GetStudents = CatchAsync(async (req, res, next) => {
	const { sectionId, academicYearId } = req.query;

	if (!sectionId || !academicYearId) {
		return next(new ErrorResponse('Please Provide All Fields', 422));
	}

	const students = await Student.aggregate([
		{
			$match: {
				section: mongoose.Types.ObjectId(sectionId),
				deleted: false,
				profileStatus: 'APPROVED',
			},
		},
		{
			$lookup: {
				from: 'previousfeesbalances',
				let: {
					studentId: '$_id',
				},
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{
										$eq: ['$studentId', '$$studentId'],
									},
									{
										$eq: [
											'$academicYearId',
											mongoose.Types.ObjectId(academicYearId),
										],
									},
								],
							},
						},
					},
				],
				as: 'previousBalance',
			},
		},
	]).toArray();

	if (students.length === 0) {
		return next(new ErrorResponse('No Students Found', 404));
	}

	const filteredStudents = students.filter(
		el => el.previousBalance.length === 0
	);

	if (filteredStudents.length === 0) {
		return next(new ErrorResponse('All Students Are Mapped', 404));
	}

	res
		.status(200)
		.json(
			SuccessResponse(
				filteredStudents,
				filteredStudents.length,
				'Fetched Successfully'
			)
		);
});

const CreatePreviousBalance = CatchAsync(async (req, res, next) => {
	let {
		studentId = null,
		studentName, // Left
		parentName, // Left
		username, // Left
		gender, // Left
		schoolId,
		sectionId,
		academicYearId,
		pendingAmount,
	} = req.body;
	let secondaryParentName = null;
	const isEnrolled = !!studentId;
	let parentId = null;
	if (
		(!studentId && (!studentName || !parentName || !username || !gender)) ||
		!academicYearId ||
		!schoolId ||
		!sectionId ||
		!pendingAmount
	) {
		return next(new ErrorResponse('Please Provide All The Input Fields', 422));
	}

	// Fetch student, parent, username and gender from studentId
	if (studentId) {
		const isPreviousExist = await PreviousBalance.findOne({
			studentId,
			academicYearId,
		});

		if (isPreviousExist) {
			return next(new ErrorResponse('Previous Balance Already Exists', 409));
		}

		const student = await Student.aggregate([
			{
				$match: {
					_id: mongoose.Types.ObjectId(studentId),
				},
			},
			{
				$lookup: {
					from: 'parents',
					localField: 'parent_id',
					foreignField: '_id',
					as: 'parent',
				},
			},
			{
				$project: {
					_id: 0,
					studentName: '$name',
					parentName: {
						$first: '$parent.name',
					},
					secondaryParentName: {
						$first: '$parent.father_name',
					},
					parentId: {
						$first: '$parent._id',
					},
					username: 1,
					gender: 1,
				},
			},
		]).toArray();
		({
			studentName,
			parentName,
			username,
			gender,
			parentId,
			secondaryParentName,
		} = student[0]);
	}

	parentName =
		(parentName === '' || !parentName) && !secondaryParentName
			? `${studentName} Parent`
			: parentName ?? secondaryParentName;

	const creationPayload = {
		isEnrolled,
		studentName,
		parentName,
		username,
		status: 'Due',
		gender,
		parentId,
		schoolId,
		sectionId,
		academicYearId,
		totalAmount: pendingAmount,
		paidAmount: 0,
		dueAmount: pendingAmount,
	};
	studentId ? (creationPayload.studentId = studentId) : null;

	const previousBalance = await PreviousBalance.create(creationPayload);

	if (!previousBalance) {
		return next(new ErrorResponse('Unable To Create Previous Balance', 500));
	}

	res
		.status(201)
		.json(SuccessResponse(previousBalance, 1, 'Created Successfully'));
});

const BulkCreatePreviousBalance = async (req, res, next) => {
	const { schoolId, isExisting = true } = req.query;
	const { file } = req.files;
	const workbook = XLSX.read(file.data, { type: 'buffer' });
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const rows = XLSX.utils.sheet_to_json(worksheet);

	if (rows.length === 0) {
		return next(new ErrorResponse('No Data Found', 404));
	}

	const [academicYear] = rows;
	const academicYearName = academicYear.ACADEMIC_YEAR.trim();

	const academicYearObj = await AcademicYears.findOne({
		name: academicYearName,
		schoolId: mongoose.Types.ObjectId(schoolId),
	});

	if (!academicYearObj) {
		return next(new ErrorResponse('Academic Year not found', 404));
	}

	const academicYearId = academicYearObj._id;

	let bulkOps = [];

	if (isExisting === 'true' || isExisting === true) {
		const studentIds = rows.map(({ STUDENTID }) =>
			mongoose.Types.ObjectId(STUDENTID)
		);
		const existingBalances = await PreviousBalance.find({
			studentId: { $in: studentIds },
			academicYearId,
		}).select('studentId');

		const existingStudentIds = existingBalances.map(({ studentId }) =>
			studentId.toString()
		);
		const notUpdatedStudents = [];

		const existingStudents = await Student.find(
			{
				_id: { $in: studentIds },
			},
			'gender username section parent_id'
		).toArray();

		for (const { STUDENTID, BALANCE, PARENT, NAME } of rows) {
			if (existingStudentIds.includes(STUDENTID)) {
				notUpdatedStudents.push(STUDENTID);
				// eslint-disable-next-line no-continue
				continue;
			}

			const { gender, username, section, parent_id } = existingStudents.find(
				({ _id }) => _id.toString() === STUDENTID
			);

			const previousBalance = {
				isEnrolled: true,
				studentId: STUDENTID,
				studentName: NAME,
				parentName: PARENT === '' ? `${NAME} Parent` : PARENT,
				status: 'Due',
				username,
				gender,
				parentId: parent_id,
				sectionId: section,
				academicYearId,
				totalAmount: BALANCE,
				paidAmount: 0,
				dueAmount: BALANCE,
				schoolId,
			};

			bulkOps.push({ insertOne: { document: previousBalance } });
		}

		const updatedCount = rows.length - notUpdatedStudents.length;

		if (bulkOps.length > 0) {
			await PreviousBalance.bulkWrite(bulkOps);
		}

		if (updatedCount === 0) {
			return next(new ErrorResponse('All Students Are Mapped', 404));
		}

		res
			.status(200)
			.json(
				SuccessResponse(
					{ notUpdatedCount: notUpdatedStudents.length, updatedCount },
					1,
					'Created Successfully'
				)
			);
	} else {
		const sectionList = await getSections(schoolId);

		bulkOps = rows
			.map(({ NAME, CLASS, PARENT, BALANCE, USERNAME, GENDER }) => {
				if (!sectionList[CLASS]) {
					return null;
				}

				return {
					insertOne: {
						document: {
							isEnrolled: false,
							studentName: NAME,
							parentName: PARENT,
							status: 'Due',
							username: USERNAME,
							gender: GENDER,
							sectionId: sectionList[CLASS]._id,
							academicYearId,
							totalAmount: BALANCE,
							paidAmount: 0,
							dueAmount: BALANCE,
							schoolId,
						},
					},
				};
			})
			.filter(Boolean);

		if (bulkOps.length === 0) {
			return next(
				new ErrorResponse('No Students To Create Previous Balance', 404)
			);
		}

		await PreviousBalance.bulkWrite(bulkOps);

		res
			.status(200)
			.json(
				SuccessResponse({ count: bulkOps.length }, 1, 'Created Successfully')
			);
	}
};

const GetById = async (req, res) => {};

const UpdatePreviousBalance = async (req, res) => {};

const DeletePreviousBalance = async (req, res) => {};

const existingStudentExcel = CatchAsync(async (req, res, next) => {
	const { studentList, academicYearName } = req.body;
	const workbook = new excel.Workbook();

	const worksheet = workbook.addWorksheet('Previous Balances');
	const style = workbook.createStyle({
		font: {
			bold: true,
			color: '#000000',
			size: 12,
		},
		numberFormat: '$#,##0.00; ($#,##0.00); -',
	});

	worksheet.cell(1, 1).string('STUDENTID').style(style);
	worksheet.cell(1, 2).string('NAME').style(style);
	worksheet.cell(1, 3).string('CLASS').style(style);
	worksheet.cell(1, 4).string('PARENT').style(style);
	worksheet.cell(1, 5).string('ACADEMIC_YEAR').style(style);
	worksheet.cell(1, 6).string('BALANCE').style(style);

	const students = await Students.aggregate([
		{
			$match: {
				_id: {
					$in: studentList.map(student => mongoose.Types.ObjectId(student)),
				},
				deleted: false,
				profileStatus: 'APPROVED',
			},
		},
		{
			$lookup: {
				from: 'classes',
				localField: 'class',
				foreignField: '_id',
				as: 'class',
			},
		},
		{
			$lookup: {
				from: 'sections',
				localField: 'section',
				foreignField: '_id',
				as: 'section',
			},
		},
		{
			$lookup: {
				from: 'parents',
				localField: 'parent_id',
				foreignField: '_id',
				as: 'parent',
			},
		},
		{
			$project: {
				_id: 1,
				name: 1,
				className: { $arrayElemAt: ['$class.name', 0] },
				sectionName: { $arrayElemAt: ['$section.name', 0] },
				parentName: { $arrayElemAt: ['$parent.name', 0] },
				secondaryParentName: { $arrayElemAt: ['$parent.father_name', 0] },
			},
		},
		{
			$sort: {
				'class.sequence_number': 1,
			},
		},
	]).toArray();

	let row = 2;
	students.forEach(stud => {
		const {
			_id,
			name,
			className,
			sectionName,
			parentName,
			secondaryParentName,
		} = stud;
		worksheet.cell(row, 1).string(_id.toString());
		worksheet.cell(row, 2).string(name);
		worksheet.cell(row, 3).string(`${className} - ${sectionName}`);
		worksheet.cell(row, 4).string(parentName ?? secondaryParentName);
		worksheet.cell(row, 5).string(academicYearName);
		worksheet.cell(row, 6).number(0);
		row += 1;
	});

	// const fileName = `${school.schoolName}.xlsx`;
	// await workbook.write(fileName);

	let data = await workbook.writeToBuffer();
	data = data.toJSON().data;

	res.status(200).json(SuccessResponse(data, 1, 'Fetched Successfully'));
});

module.exports = {
	GetAllByFilter,
	existingStudentExcel,
	GetById,
	GetStudents,
	CreatePreviousBalance,
	UpdatePreviousBalance,
	DeletePreviousBalance,
	BulkCreatePreviousBalance,
	MakePayment,
};
