const express = require('express');

const router = express.Router();
const feeInstallmentController = require('../controller/feeInstallment');

router.post('/makePayment', feeInstallmentController.MakePayment);

router.get('/allTransactions', feeInstallmentController.GetTransactions);

router.get(
	'/transactionsBySection',
	feeInstallmentController.SectionWiseTransaction
);

router.post('/reportBySchedules', feeInstallmentController.reportBySchedules);

router.post('/:id', feeInstallmentController.update);

router.get(
	'/unmappedStudentExcel/:schoolId',
	feeInstallmentController.UnmappedStudentExcel
);

// Get Income Dashboard Data
router.get('/incomeDashboard', feeInstallmentController.IncomeDashboard);

router.post(
	'/addPreviousFee/:schoolId',
	feeInstallmentController.AddPreviousFee
);

router.get('/studentsList', feeInstallmentController.StudentsList);
router.get('/student', feeInstallmentController.StudentSearch);
router.get(
	'/studentstructure',
	feeInstallmentController.getStudentFeeStructure
);

router.get('/studentReport', feeInstallmentController.studentReport);

router.get(
	'/studentFeeExcel/:schoolId',
	feeInstallmentController.StudentFeeExcel
);

router.get(
	'/newAdmissionExcel/:schoolId',
	feeInstallmentController.NewAdmissionExcel
);

module.exports = router;
