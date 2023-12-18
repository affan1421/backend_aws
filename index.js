/* eslint-disable global-require */ 
const express = require("express");
const http = require("http");
const socket = require("socket.io");
const mongoose = require("mongoose");
mongoose.set("strictQuery", false);
require("dotenv").config();
require("./jobs/installmentDue");
const fileUpload = require("express-fileupload");
const compression = require("compression");

const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const bodyParser = require("body-parser");
const swaggerDocument = require("./swagger.json");
const morganMiddleware = require("./middleware/morgan");
const { socketSetup } = require("./socket/socket");

const app = express();
const server = http.createServer(app);
const io = new socket.Server(server, { cors: { origin: "*" } });

socketSetup(io);

app.use(bodyParser.urlencoded({ limit: "3mb", extended: false }));
app.use(bodyParser.json({ limit: "3mb" }));
app.use(fileUpload());
app.use(express.json());
app.use(
  cors({
    allowedHeaders: "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    origin: "*",
    credentials: true,
    methods: ["PUT", "POST", "PATCH", "DELETE", "GET", "OPTIONS"],
  })
);

app.use(
  compression({
    level: 6,
    threshold: 1000, // 1kb
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

const options = {
  explorer: true,
  swaggerOptions: {
    validatorUrl: null,
  },
};

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, options));

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log(`MongoDB Database Connected`);
    const { authenticateUser } = require("./middleware/authorize");

    app.use(morganMiddleware);

    app.get("/", (req, res) => {
      res.send("Server is up and Running👨‍💻👩‍💻...");
    });

    // authentication middleware
    app.use(authenticateUser);

    app.use("/api/v1/config", require("./router/academicYear"));
    app.use("/api/v1/feetype", require("./router/feeType"));
    app.use("/api/v1/expenseType", require("./router/expenseType"));
    app.use("/api/v1/expense", require("./router/expense"));
    app.use("/api/v1/donor", require("./router/donor"));
    app.use("/api/v1/feeschedule", require("./router/feeSchedule"));
    app.use("/api/v1/feecategory", require("./router/feeCategory"));
    app.use("/api/v1/feestructure", require("./router/feeStructure"));
    app.use("/api/v1/feeinstallment", require("./router/feeInstallment"));
    app.use("/api/v1/discount", require("./router/discountCategory"));
    app.use("/api/v1/applicationfee", require("./router/applicationFee"));
    app.use("/api/v1/feereceipt", require("./router/feeReceipt"));
    app.use("/api/v1/previousfees", require("./router/previousFeesBalance"));
    app.use("/api/v1/duelist", require("./router/dueList"));
    app.use("/api/v1/transfercertificate", require("./router/transferCertificate"));
    app.use("/api/v1/dailyclosecollection", require("./router/dailyCloseCollection"));
    app.use("/api/v1/concession", require("./router/concession"));
    app.use("/api/v1/transportation", require("./router/transportation"));

    app.use((err, req, res, next) => {
      res.status(err.statusCode || 500).json({
        status: err.status || "error",
        message: err.message || "Something went wrong",
      });
    });

    const port = process.env.PORT || 4000;
    server.listen(port, () => {
      console.log(`Servers is listening on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.log(err.message);
    process.exit(1);
  });

module.exports = { app };
