const router = require('express').Router();
const {
	create,
	getAll,
	deleteFeeSchedule,
	getFeeSchedule,
	update,
} = require('../controller/feeSchedule');

router.route('/').get(getAll).post(create);

router.route('/:id').get(getFeeSchedule).put(update).delete(deleteFeeSchedule);

module.exports = router;
