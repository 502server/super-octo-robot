import express from "express";
import apiApp from "./api/server.js";

const app = express();
app.use(apiApp);

export default app;
