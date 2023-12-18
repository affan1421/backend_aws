const router = require('express').Router();

const {
	getDiscountCategory,
	createDiscountCategory,
	getDiscountCategoryById,
	updateDiscountCategory,
	deleteDiscountCategory,
	discountReport,
	mapDiscountCategory,
	getDiscountCategoryByClass,
	approveStudentDiscount,
	addAttachment,
	getSectionDiscount,
	getStudentsByFilter,
	addStudentToDiscount,
	getStudentForApproval,
	getGraphBySection,
	getStudentsByStructure,
	getDiscountGraph,
	revokeStudentDiscount,
	createDiscountTemplate,
	getDiscountSummary,
	getSectionWiseDiscount,
	getDiscountBySchool,
	getStudentsWithDiscount,
} = require('../controller/discountCategory');

router.post('/:id/revoke', revokeStudentDiscount);

router.get('/school/:schoolId', getDiscountBySchool);

router.get('/studentList', getStudentsWithDiscount);

router.get('/summary', getDiscountSummary);

router.get('/graph', getDiscountGraph);

router.get('/graphBySection', getGraphBySection);

router.post('/createTemplate', createDiscountTemplate);

router.get('/sections', getSectionWiseDiscount);

router.route('/').get(getDiscountCategory).post(createDiscountCategory);

//! To be removed
router.post('/:discountId/map', mapDiscountCategory);

router.get('/:id/class', getDiscountCategoryByClass);

router.get('/:id/structure/:structureId', getStudentsByStructure);

router.get('/:id/studentFilter', getStudentsByFilter);

// TODO: Update this to add student to discount
router.post('/:discountId/addStudent', addStudentToDiscount);

//! To be removed
router.get('/:id/mappedStructure/:feeStructureId', getSectionDiscount);

//! To be removed
router.get('/report', discountReport);

router.route('/:discountId/approval').post(approveStudentDiscount);

router.route('/approval').get(getStudentForApproval);

router.post('/addAttachment', addAttachment);

router
	.route('/:id')
	.get(getDiscountCategoryById)
	.put(updateDiscountCategory)
	.delete(deleteDiscountCategory);

module.exports = router;
