import express from "express";
import apiApp from "./backend/server.js";

const app = express();
app.use(apiApp);

export default app;
