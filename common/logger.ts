import { createLogger, transports } from "winston";

const logger = createLogger({
  transports: [
    new transports.Console({ level: "silly" }),
    new transports.File({ filename: "combined.log" }),
  ],
});
export default logger;
