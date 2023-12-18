const router = require('express').Router();
const {
	getSummary,
	getStudentList,
	getStudentListExcel,
	getClassList,
	getClassListExcel,
	getStudentListByClass,
} = require('../controller/dueList');

// Summary
router.post('/summary', getSummary);

// Student List
router.post('/studentList', getStudentList);

// Student List Excel
router.post('/studentListExcel', getStudentListExcel);

// Class List
router.post('/classList', getClassList);

// Class List Excel
router.post('/classListExcel', getClassListExcel);

// Student List by Class
router.post('/studentListByClass', getStudentListByClass);

module.exports = router;
