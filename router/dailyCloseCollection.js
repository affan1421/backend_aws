const router = require('express').Router();
const {
	generateDailyCloseCollection,
	getCollectionDetails,
	dailyTotalFeeCollection,
	updateCloseCollectionStatus,
	getEditStatus,
	updateEditStatus,
} = require('../controller/dailyCloseCollection');

router.post('/create', generateDailyCloseCollection);
router.get('/collectionDetails', getCollectionDetails);
router.get('/todaystotalfees', dailyTotalFeeCollection);
router.post('/updateStatus', updateCloseCollectionStatus);
router.put('/allowEdit', updateEditStatus);
router.get('/allowEdit', getEditStatus);

module.exports = router;
