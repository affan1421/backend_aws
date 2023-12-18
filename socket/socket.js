const mongoose = require("mongoose");
const notifications = require("../models/notifications");
const connectedUsers = new Map();

const saveNotificationToDatabase = async (clientId, notificationData) => {
  const schoolId = clientId?.split("_")?.[0];
  const userRole = clientId?.split("_")?.[1];
  return await notifications.create({
    ...notificationData,
    schoolId: mongoose.Types.ObjectId(schoolId),
    userRole,
  });
};

// sends notifications to specific user
const sendNotification = async (schoolId, role, notificationData) => {
  try {
    const clientId = `${schoolId}_${role}`;
    const data = await saveNotificationToDatabase(clientId, notificationData);
    const clients = connectedUsers.get(clientId);
    if (clients) for (const client of clients) client.emit("notification:recive", data);
  } catch (error) {
    console.log("SOCKET_ERR", error);
  }
};

// handler for notifiacations
const notificationHandler = (socket) => {
  socket.on("notification:get_all", async (callback) => {
    try {
      const clientId = socket.handshake.auth?.clientId?.split("_");
      const schoolId = clientId?.[0];
      const userRole = clientId?.[1];
      const data = await notifications
        .find({ schoolId: mongoose.Types.ObjectId(schoolId), userRole })
        .sort({ createdAt: -1 });
      callback(data);
    } catch (error) {
      console.log("SOCKET_ERR", error);
    }
  });
};

/**
 * Handles connection and initial logics
 * @param io Server instance of socket
 */
const socketSetup = (io) => {
  // connected to socket
  io.on("connection", async (socket) => {
    // adds users to add connectedUsers list
    const clientId = socket.handshake.auth?.clientId;
    if (clientId) {
      const existingData = connectedUsers.get(clientId);
      if (!existingData) connectedUsers.set(clientId, [socket]);
      else {
        existingData.push(socket);
        connectedUsers.set(clientId, existingData);
      }
    }

    // additional notification handler functions
    notificationHandler(socket);

    // removes client from connected users list
    socket.on("disconnect", () => {
      const clientId = socket.handshake.auth?.clientId;
      const activeSocketsList = connectedUsers.get(clientId)?.filter((socket_obj) => socket_obj.id !== socket.id);
      connectedUsers.set(clientId, activeSocketsList);
    });
  });
};

module.exports = {
  socketSetup,
  sendNotification,
};
