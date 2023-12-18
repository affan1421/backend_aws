const router = require("express").Router();
const {
  createConcession,
  getStudentsByClass,
  getStudentFeeDetails,
  getConcessionCardData,
  getConcessionClassList,
  changeStatus,
  getStudentConcessionData,
  addConcessionReason,
  getConcessionReason,
  updateConcessionReason,
  deleteConcessionReason,
  getStudentWithConcession,
  getClassesWithConcession,
  getAllReasonTypes,
  revokeConcession,
} = require("../controller/concession");

router.post("/create", createConcession);
router.get("/classWiseStudentsData", getStudentsByClass);
router.get("/feedetails", getStudentFeeDetails);
router.get("/concessionCardData", getConcessionCardData);
router.get("/concessionClassList", getConcessionClassList);
router.get("/changeStatus/:id", changeStatus);
router.get("/studentsconcession", getStudentConcessionData);
router.post("/reasons", addConcessionReason);
router.get("/reasons", getConcessionReason);
router.put("/reasons", updateConcessionReason);
router.delete("/deleteReasons", deleteConcessionReason);
router.get("/studentsconcession", getStudentConcessionData);
router.get("/studentwithconcession", getStudentWithConcession);
router.get("/concessionclasses", getClassesWithConcession);
router.get("/getAllReasonTypes", getAllReasonTypes);
router.get("/revoke", revokeConcession);

module.exports = router;
