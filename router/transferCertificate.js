const router = require('express').Router();
const {
  createStudentTransfer,
  searchStudentsWithPagination,
  changeStatus,
  getTc,
  getTcDetails,
  getClasses,
  getTcStudentsDetails,
  getTcReason,
  addTcReason,
  updateTcReason,
  deleteTcReason,
} = require("../controller/transferCertificate");

// create new tranfer certificate
router.post('/', createStudentTransfer);

// view all students of a particular school
router.get('/students', searchStudentsWithPagination);

// change the TC status
router.put('/changeStatus/:id', changeStatus);

// view the different transfer list
router.get('/tcList', getTc);

// TC details, which includes document counts also
router.get("/details/:id", getTcDetails);

// to view all the available classNames of a particular schools
router.get('/classes', getClasses);

// in-detail data of students who applied for TC
router.get('/tcStudentsDetails', getTcStudentsDetails);

// create new tc reason
router.post('/reasons', addTcReason);

// get available tc reasons
router.get('/reasons', getTcReason);

// update tc reason
router.put("/reasons", updateTcReason);

// delete tc reason
router.delete("/deleteReasons", deleteTcReason);

module.exports = router;
