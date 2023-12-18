const router = require('express').Router();
const {
	createFeeCategory,
	getFeeCategory,
	updateFeeCategory,
	deleteFeeCategory,
	getFeeCategoryByFilter,
	getFeeCategoryBySectionId,
	getAllStudentCategories,
} = require('../controller/feeCategory');

// CREATE
router.route('/').get(getFeeCategoryByFilter).post(createFeeCategory);

router.get('/section/:sectionId', getFeeCategoryBySectionId);

// get by multiple category ids
router.get('/student/:studentId', getAllStudentCategories);

router
	.route('/:id')
	.get(getFeeCategory)
	.put(updateFeeCategory)
	.delete(deleteFeeCategory);

module.exports = router;
